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

const db = new PrismaClient();

const OWNER_EMAIL = process.env.DEV_USER_EMAIL || "owner@leader.local";
const OWNER_PASSWORD = process.env.SEED_PASSWORD || "leader-demo-1234";
const day = 24 * 60 * 60 * 1000;
const future = (d: number) => new Date(Date.now() + d * day);
const past = (d: number) => new Date(Date.now() - d * day);

async function main() {
  console.log("🌱 Seeding LEADer…");

  // ── Power user ──────────────────────────────────────────────────────────
  const passwordHash = await hashPassword(OWNER_PASSWORD);
  const user = await db.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { passwordHash },
    create: {
      email: OWNER_EMAIL,
      name: "Tobias",
      passwordHash,
      role: "OWNER",
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
      aiKeys: { provider: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    },
  });

  // Clean previous demo data for a deterministic re-seed.
  await db.opportunity.deleteMany({ where: { ownerId: user.id } });
  await db.source.deleteMany({ where: { ownerId: user.id } });
  await db.list.deleteMany({ where: { ownerId: user.id } });

  // ── Sources (both lanes) ─────────────────────────────────────────────────
  const mk = (s: Omit<Prisma.SourceUncheckedCreateInput, "ownerId">) =>
    db.source.create({ data: { ...s, ownerId: user.id } });

  const ehsys = await mk({
    name: "EHSYS — opportunity listings", type: "PUBLIC_WEB", workspace: "DK",
    url: "https://example-ehsys.dk/opportunities", parserKey: "ehsys",
    keywords: ["udvikler", "mvp", "ai", "digital"], country: "DK", category: "Innovation",
    frequency: "DAILY", notes: "TODO: implement real EHSYS parser (selectors) in lib/ingestion/parsers.",
  });
  const beyondBeta = await mk({
    name: "Beyond Beta — programme calls", type: "ACCELERATOR", workspace: "DK",
    url: "https://example-beyondbeta.dk/programmes", parserKey: "beyond-beta",
    keywords: ["startup", "scaleup", "tech"], country: "DK", category: "Accelerator", frequency: "WEEKLY",
  });
  const erhvervshus = await mk({
    name: "Erhvervshus Hovedstaden — voucher programmes", type: "PUBLIC_WEB", workspace: "DK",
    url: "https://example-erhvervshus.dk/tilskud", parserKey: "erhvervshuse",
    keywords: ["voucher", "tilskud", "digitalisering", "innovationsagent"], country: "DK",
    category: "Voucher / grant", frequency: "DAILY",
  });
  const innofond = await mk({
    name: "Innovationsfonden — InnoBooster (RSS)", type: "RSS", workspace: "DK",
    url: "https://example-innovationsfonden.dk/feed.xml",
    keywords: ["innobooster", "tilskud", "projekt"], country: "DK", category: "Funding", frequency: "DAILY",
  });
  const procurement = await mk({
    name: "Public procurement (tender-like)", type: "PROCUREMENT", workspace: "DK",
    url: "https://example-udbud.dk/it", parserKey: "procurement",
    keywords: ["it", "software", "udvikling", "konsulent"], country: "DK", category: "Tender", frequency: "DAILY",
  });
  const community = await mk({
    name: "FB: Danish Startup Founders", type: "FACEBOOK_MANUAL", workspace: "DK",
    keywords: ["mvp", "udvikler", "co-founder", "freelance"], country: "DK",
    category: "Community", frequency: "MANUAL",
    notes: "Manual import only — paste posts via Community Import. Never scraped.",
  });
  const ycEU = await mk({
    name: "Global accelerator calls (RSS)", type: "RSS", workspace: "GLOBAL",
    url: "https://example-global-accelerators.com/feed.xml",
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

    await db.opportunity.create({
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
        dedupeHash: `seed-${Buffer.from(d.title).toString("base64").slice(0, 24)}`,
        contacts: d.contacts?.length ? { create: d.contacts } : undefined,
        activities: { create: { type: "IMPORT", message: `Seeded (${d.ingest ?? "AUTOMATED"})` } },
      },
    });
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
