/**
 * LEADer seed — creates the power user, a set of Danish (+ a few global) sources
 * across both ingestion lanes, and a realistic spread of demo opportunities so
 * every screen has data on first run. Scores are computed with the real engine.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { scoreOpportunity } from "../src/lib/scoring";
import { DEFAULT_WEIGHTS } from "../src/lib/scoring/config";
import { hashPassword } from "../src/lib/auth/password";
import { LOCAL_EMBED_MODEL, localEmbed, opportunityEmbedText } from "../src/lib/ai/embeddings";
import { ensureDefaultDiscoveryLanes } from "../src/lib/crm/lanes";
import { confidenceScore, pursuitScore } from "../src/lib/crm/scoring";
import { dealStatusFromOpportunity } from "../src/lib/crm/status";

const db = new PrismaClient();

const OWNER_EMAIL = process.env.DEV_USER_EMAIL || "owner@leader.local";
const OWNER_PASSWORD = process.env.SEED_PASSWORD || "leader-demo-1234";
const day = 24 * 60 * 60 * 1000;
const future = (d: number) => new Date(Date.now() + d * day);
const past = (d: number) => new Date(Date.now() - d * day);

function accountType(category?: string, ingest?: string): Prisma.AccountCreateInput["type"] {
  const text = `${category ?? ""} ${ingest ?? ""}`.toLowerCase();
  if (text.includes("community")) return "COMMUNITY";
  if (text.includes("tender")) return "PUBLIC_BUYER";
  if (text.includes("startup") || text.includes("mvp") || text.includes("accelerator")) return "STARTUP";
  return "COMPANY";
}

async function main() {
  console.log("🌱 Seeding LEADer…");

  // ── Power user ──────────────────────────────────────────────────────────
  const passwordHash = await hashPassword(OWNER_PASSWORD);
  const user = await db.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { passwordHash, onboardedAt: new Date() },
    create: {
      email: OWNER_EMAIL,
      name: "Tobias",
      passwordHash,
      role: "OWNER",
      onboardedAt: new Date(),
      headline: "Fullstack developer · AI builder · MVP & product advisor",
      bio: "Solo technical partner for startups, founders and SMEs. I turn funded ideas into shipped MVPs — fullstack build, AI features and a pragmatic product roadmap. Prefer active, directly-applicable assignments under 100,000 DKK.",
      preferredProjectTypes: [
        "Fullstack development",
        "AI / automation",
        "MVP / prototype",
        "Product strategy & roadmap",
        "Voucher / accelerator assignment",
      ],
      excludedCategories: ["Pure design", "Hardware manufacturing"],
      budgetMaxDkk: 100000,
      preferredCurrency: "DKK",
      scoringWeights: DEFAULT_WEIGHTS as object,
      exportPrefs: { defaultFormat: "xlsx", includeNotes: true, includeSummary: true },
      aiKeys: { provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    },
  });

  // Clean previous demo data for a deterministic re-seed.
  await db.conversionAsset.deleteMany({ where: { ownerId: user.id } });
  await db.task.deleteMany({ where: { ownerId: user.id } });
  await db.touchpoint.deleteMany({ where: { ownerId: user.id } });
  await db.evidence.deleteMany({ where: { ownerId: user.id } });
  await db.discoveryCandidate.deleteMany({ where: { ownerId: user.id } });
  await db.discoveryMission.deleteMany({ where: { ownerId: user.id } });
  await db.dealPerson.deleteMany({ where: { deal: { ownerId: user.id } } });
  await db.deal.deleteMany({ where: { ownerId: user.id } });
  await db.person.deleteMany({ where: { ownerId: user.id } });
  await db.account.deleteMany({ where: { ownerId: user.id } });
  await db.discoveryLane.deleteMany({ where: { ownerId: user.id } });
  await db.communityImport.deleteMany({ where: { ownerId: user.id } });
  await db.opportunity.deleteMany({ where: { ownerId: user.id } });
  await db.source.deleteMany({ where: { ownerId: user.id } });
  await db.list.deleteMany({ where: { ownerId: user.id } });

  await ensureDefaultDiscoveryLanes(user.id);
  const lanes = await db.discoveryLane.findMany({ where: { ownerId: user.id } });
  const laneBySlug = new Map(lanes.map((lane) => [lane.slug, lane.id]));

  // ── Sources (both lanes) ─────────────────────────────────────────────────
  const mk = (s: Omit<Prisma.SourceUncheckedCreateInput, "ownerId">) =>
    db.source.create({ data: { ...s, ownerId: user.id } });

  const ehsys = await mk({
    name: "EHSYS — aktuelle indkøb", type: "PUBLIC_WEB", workspace: "DK",
    url: "https://ehsys.dk/indkoeb/alle", parserKey: "ehsys-procurement",
    keywords: ["teknisk", "produkt", "roadmap", "software", "AI", "Beyond Beta"], country: "DK", category: "Tender",
    frequency: "DAILY", notes: "High-signal supplier opportunities from EHSYS programmes including Beyond Beta and Erhvervshus initiatives.",
  });
  const beyondBeta = await mk({
    name: "Beyond Beta — startup programme calls", type: "ACCELERATOR", workspace: "DK",
    url: "https://www.beyondbeta.dk/", parserKey: "beyond-beta",
    keywords: ["startup", "scaleup", "tech"], country: "DK", category: "Accelerator", frequency: "WEEKLY",
  });
  const erhvervshus = await mk({
    name: "Virksomhedsguiden — digitalisation grants", type: "PUBLIC_WEB", workspace: "DK",
    url: "https://virksomhedsguiden.dk/content/ydelser/digitalisering-raadgivertilskud/00f2ddc0-76bb-4cb8-b15c-989ed1228c3d/", parserKey: "erhvervshuse",
    keywords: ["voucher", "tilskud", "digitalisering", "innovationsagent"], country: "DK",
    category: "Voucher / grant", frequency: "DAILY",
  });
  const innofond = await mk({
    name: "Innovationsfonden — Innobooster", type: "PUBLIC_WEB", workspace: "DK",
    url: "https://innovationsfonden.dk/en/p/innobooster",
    keywords: ["innobooster", "tilskud", "projekt", "startup"], country: "DK", category: "Funding", frequency: "WEEKLY",
  });
  const procurement = await mk({
    name: "Udbud.dk — public procurement", type: "PROCUREMENT", workspace: "DK",
    url: "https://udbud.dk/", parserKey: "procurement",
    keywords: ["software", "udvikling", "IT", "webapp", "konsulent"], country: "DK", category: "Tender",
    frequency: "DAILY", notes: "Official Danish public procurement portal. Use Discover web search for broader query coverage.",
  });
  await mk({
    name: "Virksomhedsguiden — SMV:Digital", type: "PUBLIC_WEB", workspace: "DK",
    url: "https://virksomhedsguiden.dk/content/udbyder/smvdigital/", parserKey: "erhvervshuse",
    keywords: ["SMV:Digital", "software", "digitalisering", "rådgivning"], country: "DK", category: "Voucher / grant", frequency: "WEEKLY",
  });
  const community = await mk({
    name: "FB: Danish Startup Founders", type: "FACEBOOK_MANUAL", workspace: "DK",
    keywords: ["mvp", "udvikler", "co-founder", "freelance"], country: "DK",
    category: "Community", frequency: "MANUAL",
    notes: "Manual import only — paste posts via Community Import. Never scraped.",
  });
  const ycEU = await mk({
    name: "YC companies — global founder signals", type: "PUBLIC_WEB", workspace: "GLOBAL",
    url: "https://www.ycombinator.com/jobs",
    keywords: ["startup", "mvp", "ai", "fellowship", "grant"], country: "", category: "Accelerator", frequency: "WEEKLY",
  });

  // ── Demo opportunities ───────────────────────────────────────────────────
  type Demo = {
    title: string; description: string; org: string; budgetMin?: number; budgetMax?: number;
    deadline?: Date; category: string; sourceId: string; status?: any; workspace?: "DK" | "GLOBAL";
    applicationRoute?: "DIRECT" | "APPLICATION" | "UNKNOWN"; location?: string; url?: string;
    contacts?: { name?: string; email?: string; role?: string }[]; ingest?: "AUTOMATED" | "MANUAL" | "COMMUNITY";
    expired?: boolean;
  };

  const demos: Demo[] = [
    {
      title: "MVP-udvikling til SaaS-startup (voucher-finansieret)",
      description: "Tidlig startup med InnoBooster-bevilling søger fullstack-udvikler til at bygge en MVP: Next.js + Postgres, brugerlogin, dashboard og en simpel AI-funktion. Klar deadline og direkte kontakt til stifter.",
      org: "Nordic SaaS ApS", budgetMin: 60000, budgetMax: 90000, deadline: future(18),
      category: "MVP / prototype", sourceId: erhvervshus.id, applicationRoute: "DIRECT", location: "København",
      url: "https://example-erhvervshus.dk/tilskud/mvp-saas", ingest: "AUTOMATED",
      contacts: [{ name: "Mette Sørensen", email: "mette@nordicsaas.dk", role: "Founder" }],
      status: "INTERESTING",
    },
    {
      title: "AI-prototype: dokument-klassificering for SMV",
      description: "SMV ønsker proof-of-concept der klassificerer indgående dokumenter med en LLM. Behov for fullstack-opsætning, prompt-design og en lille review-UI. Markedsmodningsstøtte dækker budgettet.",
      org: "LogiFlow", budgetMin: 40000, budgetMax: 75000, deadline: future(9),
      category: "AI / automation", sourceId: ehsys.id, applicationRoute: "APPLICATION", location: "Aarhus",
      url: "https://example-ehsys.dk/opportunities/ai-doc", ingest: "AUTOMATED", status: "WATCH",
    },
    {
      title: "Teknisk roadmap & arkitektur-review for funded fintech",
      description: "Pre-seed fintech med fondsmidler søger ekstern teknisk rådgiver til at lave roadmap, arkitektur-review og hjælpe med at vælge stack. 2-3 ugers engagement.",
      org: "PayPeer", budgetMin: 50000, budgetMax: 80000, deadline: future(25),
      category: "Product strategy", sourceId: beyondBeta.id, applicationRoute: "DIRECT", location: "Remote/DK",
      ingest: "AUTOMATED", status: "NEW",
    },
    {
      title: "Innovationsagent: digitalisering af bookingflow",
      description: "Voucher-projekt via Erhvervshus. Lille virksomhed vil digitalisere booking og betaling. Oplagt til en fullstack-leverandør der kan levere hurtigt.",
      org: "KlinikBooking", budgetMin: 25000, budgetMax: 50000, deadline: future(40),
      category: "Voucher / grant", sourceId: erhvervshus.id, applicationRoute: "APPLICATION", location: "Odense",
      ingest: "AUTOMATED", status: "NEW",
    },
    {
      title: "Beyond Beta cohort — teknisk medstifter/leverandør søges",
      description: "Accelerator-deltager mangler teknisk eksekvering til at bygge første version af produktet inden demo day. AI-features et plus.",
      org: "HealthNudge", budgetMin: 30000, budgetMax: 70000, deadline: future(6),
      category: "Accelerator", sourceId: beyondBeta.id, applicationRoute: "DIRECT", location: "København",
      ingest: "AUTOMATED", status: "CONTACTED",
      contacts: [{ name: "Jonas Berg", email: "jonas@healthnudge.io", role: "CEO" }],
    },
    {
      title: "InnoBooster-projekt: automatisering af rapportering",
      description: "Bevilget projekt der skal automatisere manuel rapportering med scripts + dashboard. Søger udvikler/automation-konsulent.",
      org: "GreenMetrics", budgetMin: 70000, budgetMax: 100000, deadline: future(30),
      category: "AI / automation", sourceId: innofond.id, applicationRoute: "APPLICATION", location: "Remote/DK",
      ingest: "AUTOMATED", status: "NEW",
    },
    {
      title: "Freelance fullstack til founder (FB-opslag)",
      description: "Opslag i founder-gruppe: 'Søger en der kan bygge MVP på React/Node i løbet af 4-6 uger, budget omkring 50k, har lidt funding'. Direkte besked til stifter.",
      org: "Danish Startup Founders (FB)", budgetMin: 40000, budgetMax: 55000, deadline: future(14),
      category: "Community", sourceId: community.id, applicationRoute: "DIRECT", location: "København",
      ingest: "COMMUNITY", status: "INTERESTING",
    },
    {
      title: "Public tender: lille IT-udviklingsopgave (under tærskel)",
      description: "Mindre offentlig opgave: udvikling af intern web-app. Tender-lignende, direkte tilbud muligt under tærskelværdi.",
      org: "Kommune X", budgetMin: 80000, budgetMax: 100000, deadline: future(21),
      category: "Tender", sourceId: procurement.id, applicationRoute: "APPLICATION", location: "Jylland",
      ingest: "AUTOMATED", status: "NEW",
    },
    {
      title: "Won: AI-onboarding flow for SaaS",
      description: "Afsluttet og vundet projekt — byggede et AI-drevet onboarding-flow. Reference-case.",
      org: "FlowMate", budgetMin: 60000, budgetMax: 85000, deadline: past(10),
      category: "AI / automation", sourceId: ehsys.id, applicationRoute: "DIRECT", location: "Remote/DK",
      ingest: "AUTOMATED", status: "WON", expired: true,
    },
    {
      title: "Lost: stor enterprise-platform (for stor / for dyr)",
      description: "Stort udbud, langt over foretrukket budget og scope. Ikke en god fit for solo-leverandør.",
      org: "BigCorp", budgetMin: 400000, budgetMax: 800000, deadline: past(5),
      category: "Tender", sourceId: procurement.id, applicationRoute: "APPLICATION", location: "København",
      ingest: "AUTOMATED", status: "LOST", expired: true,
    },
    {
      title: "Expired: hackathon prototype bounty",
      description: "Lille bounty for en prototype — deadline overskredet, beholdes som reference.",
      org: "TechFest", budgetMin: 10000, budgetMax: 20000, deadline: past(2),
      category: "Other", sourceId: ehsys.id, applicationRoute: "UNKNOWN", location: "Aarhus",
      ingest: "AUTOMATED", status: "ARCHIVED", expired: true,
    },
    // Global examples
    {
      title: "Global: AI MVP for early-stage fellowship startup",
      description: "Fellowship-backed founder needs an external builder for an AI MVP. English-speaking, remote, ~€8-10k.",
      org: "VentureLab", budgetMin: 60000, budgetMax: 80000, deadline: future(20),
      category: "MVP / prototype", sourceId: ycEU.id, applicationRoute: "DIRECT", location: "Remote/EU",
      workspace: "GLOBAL", ingest: "AUTOMATED", status: "NEW",
    },
    {
      title: "Global: product strategy sprint for funded climate startup",
      description: "Seed-funded climate startup wants a 2-week product strategy + technical roadmap sprint.",
      org: "ClimaPath", budgetMin: 50000, budgetMax: 90000, deadline: future(33),
      category: "Product strategy", sourceId: ycEU.id, applicationRoute: "APPLICATION", location: "Remote",
      workspace: "GLOBAL", ingest: "AUTOMATED", status: "WATCH",
    },
  ];

  for (const d of demos) {
    const breakdown = scoreOpportunity(
      {
        title: d.title, description: d.description, organization: d.org,
        budgetMin: d.budgetMin, budgetMax: d.budgetMax, deadline: d.deadline,
        category: d.category, applicationRoute: d.applicationRoute, contacts: d.contacts,
      },
      { budgetMaxDkk: user.budgetMaxDkk, weights: DEFAULT_WEIGHTS },
    );
    breakdown.computedAt = new Date().toISOString();

    const opp = await db.opportunity.create({
      data: {
        ownerId: user.id,
        sourceId: d.sourceId,
        title: d.title,
        description: d.description,
        rawContent: d.description,
        organization: d.org,
        budgetMin: d.budgetMin,
        budgetMax: d.budgetMax,
        currency: d.workspace === "GLOBAL" ? "DKK" : "DKK",
        deadline: d.deadline,
        postedAt: past(3),
        isActive: !d.expired,
        url: d.url,
        location: d.location,
        country: d.workspace === "GLOBAL" ? "" : "DK",
        category: d.category,
        workspace: d.workspace ?? "DK",
        status: d.status ?? "NEW",
        applicationRoute: d.applicationRoute ?? "UNKNOWN",
        ingestMethod: d.ingest ?? "AUTOMATED",
        matchScore: breakdown.total,
        scoreBreakdown: breakdown as object,
        embedding: localEmbed(
          opportunityEmbedText({ title: d.title, description: d.description, organization: d.org, category: d.category }),
        ),
        embeddingModel: LOCAL_EMBED_MODEL,
        embeddedAt: new Date(),
        dedupeHash: `seed-${Buffer.from(d.title).toString("base64").slice(0, 24)}`,
        contacts: d.contacts?.length ? { create: d.contacts } : undefined,
        activities: { create: { type: "IMPORT", message: `Seeded (${d.ingest ?? "AUTOMATED"})` } },
      },
    });

    const acct = await db.account.upsert({
      where: { ownerId_name: { ownerId: user.id, name: d.org } },
      update: {
        type: accountType(d.category, d.ingest),
        workspace: d.workspace ?? "DK",
        country: d.workspace === "GLOBAL" ? undefined : "DK",
        fitScore: breakdown.total,
        source: "seed",
      },
      create: {
        ownerId: user.id,
        name: d.org,
        type: accountType(d.category, d.ingest),
        workspace: d.workspace ?? "DK",
        country: d.workspace === "GLOBAL" ? undefined : "DK",
        fitScore: breakdown.total,
        source: "seed",
      },
    });

    const laneId =
      d.ingest === "COMMUNITY"
        ? laneBySlug.get("community-manual")
        : d.category === "Tender"
          ? laneBySlug.get("tenders-procurement")
          : d.category === "AI / automation"
            ? laneBySlug.get("sme-ai-automation")
            : d.category === "MVP / prototype" || d.category === "Accelerator"
              ? laneBySlug.get("direct-startup-mvp")
              : laneBySlug.get("funded-work");
    const conf = confidenceScore({
      hasUrl: Boolean(d.url),
      hasDeadline: Boolean(d.deadline),
      hasBudget: d.budgetMin != null || d.budgetMax != null,
      hasOrganization: Boolean(d.org),
      evidenceCount: 1,
      sourceKind: d.ingest === "COMMUNITY" ? "community" : "source-scan",
    });
    const pursuit = pursuitScore({
      matchScore: breakdown.total,
      confidenceScore: conf,
      deadline: d.deadline,
      priority: d.status === "WATCH" || d.status === "INTERESTING" ? 2 : 0,
    });

    const deal = await db.deal.create({
      data: {
        ownerId: user.id,
        accountId: acct.id,
        sourceId: d.sourceId,
        laneId,
        legacyOpportunityId: opp.id,
        title: d.title,
        summary: d.description,
        rawContent: d.description,
        valueMin: d.budgetMin,
        valueMax: d.budgetMax,
        currency: "DKK",
        deadline: d.deadline,
        status: dealStatusFromOpportunity(d.status ?? "NEW"),
        priority: d.status === "WATCH" || d.status === "INTERESTING" ? 2 : 0,
        workspace: d.workspace ?? "DK",
        category: d.category,
        applicationRoute: d.applicationRoute ?? "UNKNOWN",
        url: d.url,
        matchScore: breakdown.total,
        confidenceScore: conf,
        pursuitScore: pursuit,
        qualification: { seededFromOpportunity: opp.id, ingestMethod: d.ingest ?? "AUTOMATED" },
        nextAction:
          d.status === "WON" || d.status === "LOST" || d.status === "ARCHIVED"
            ? undefined
            : "Qualify buyer, budget and next step.",
      },
    });

    await db.evidence.create({
      data: {
        ownerId: user.id,
        accountId: acct.id,
        dealId: deal.id,
        kind: d.url ? "WEB_RESULT" : d.ingest === "COMMUNITY" ? "USER_NOTE" : "SOURCE_SNIPPET",
        url: d.url,
        title: d.title,
        snippet: d.description,
        sourceName: "seed",
        provider: d.ingest ?? "AUTOMATED",
        confidence: conf,
        metadata: { opportunityId: opp.id, category: d.category },
      },
    });

    if (d.status !== "WON" && d.status !== "LOST" && d.status !== "ARCHIVED") {
      await db.task.create({
        data: {
          ownerId: user.id,
          accountId: acct.id,
          dealId: deal.id,
          title: "Qualify buyer, budget and next step",
          description: "Seeded CRM follow-up task.",
          dueAt: d.deadline ? new Date(Math.min(d.deadline.getTime(), Date.now() + 3 * day)) : future(3),
          priority: pursuit >= 80 ? "HIGH" : "MEDIUM",
        },
      });
    }

    for (const contact of d.contacts ?? []) {
      const person = contact.email
        ? await db.person.upsert({
            where: { ownerId_email: { ownerId: user.id, email: contact.email } },
            update: { accountId: acct.id, name: contact.name, role: contact.role },
            create: { ownerId: user.id, accountId: acct.id, name: contact.name, email: contact.email, role: contact.role },
          })
        : await db.person.create({ data: { ownerId: user.id, accountId: acct.id, name: contact.name, role: contact.role } });
      await db.dealPerson.create({
        data: { dealId: deal.id, personId: person.id, role: contact.role },
      });
    }
  }

  // ── Lists + watchlist + tags + a saved search ─────────────────────────────
  const top = await db.opportunity.findMany({
    where: { ownerId: user.id, workspace: "DK" }, orderBy: { matchScore: "desc" }, take: 5,
  });

  const hotList = await db.list.create({
    data: { ownerId: user.id, name: "Hot this week", description: "Highest-fit active leads", color: "#3b82f6" },
  });
  const voucherList = await db.list.create({
    data: { ownerId: user.id, name: "Voucher / grant track", description: "Erhvervshus & InnoBooster-style", color: "#22c55e" },
  });
  for (const o of top.slice(0, 3)) {
    await db.listItem.create({ data: { listId: hotList.id, opportunityId: o.id } });
  }
  const voucherOpps = await db.opportunity.findMany({
    where: { ownerId: user.id, category: { in: ["Voucher / grant", "Funding", "AI / automation"] } }, take: 3,
  });
  for (const o of voucherOpps) {
    await db.listItem.create({ data: { listId: voucherList.id, opportunityId: o.id } });
  }

  for (const o of top.slice(0, 2)) {
    await db.watchlistItem.create({
      data: { ownerId: user.id, opportunityId: o.id, priority: 3, reminderAt: future(2) },
    });
  }

  // Tags
  const tagNames = ["fullstack", "ai", "voucher", "startup", "urgent"];
  const tags = await Promise.all(
    tagNames.map((name) => db.tag.upsert({ where: { name }, update: {}, create: { name } })),
  );
  if (top[0]) {
    await db.opportunityTag.createMany({
      data: [
        { opportunityId: top[0].id, tagId: tags[0].id },
        { opportunityId: top[0].id, tagId: tags[1].id },
        { opportunityId: top[0].id, tagId: tags[3].id },
      ],
      skipDuplicates: true,
    });
  }

  await db.savedSearch.create({
    data: {
      ownerId: user.id,
      name: "Active < 100k, score ≥ 60",
      filters: { activeOnly: true, budgetMax: 100000, scoreMin: 60, workspace: "DK", sort: "score" },
    },
  });

  // A welcome alert
  await db.alert.create({
    data: {
      ownerId: user.id, type: "DIGEST", title: "Welcome to LEADer",
      body: "Seed data loaded. Connect real sources in Settings and run discovery to start finding live opportunities.",
    },
  });

  const counts = {
    sources: await db.source.count({ where: { ownerId: user.id } }),
    opportunities: await db.opportunity.count({ where: { ownerId: user.id } }),
    accounts: await db.account.count({ where: { ownerId: user.id } }),
    deals: await db.deal.count({ where: { ownerId: user.id } }),
    lanes: await db.discoveryLane.count({ where: { ownerId: user.id } }),
    lists: await db.list.count({ where: { ownerId: user.id } }),
  };
  console.log("✅ Seed complete:", counts);
  console.log(`\n🔑 Sign in at /login with:\n   email:    ${OWNER_EMAIL}\n   password: ${OWNER_PASSWORD}\n`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
