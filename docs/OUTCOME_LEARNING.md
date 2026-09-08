# Outcome learning

> How LEADer stops guessing what a good lead looks like and starts knowing.

## The problem this solves

The match score was, until now, an **assumption**. `lib/scoring/config.ts` holds a
hand-tuned weight vector and a keyword lexicon written once, up front, encoding
somebody's best guess at what "good work" means. Every lead in the system — the
first one and the ten-thousandth — was judged against that same frozen guess.

Meanwhile the app was already collecting the only thing that actually answers the
question. Every time a lead moves to **won**, **applied**, **contacted**, or
**archived**, the owner renders a verdict. Thousands of those verdicts sat in the
`Opportunity` table and were read for exactly one purpose: counting tiles on the
dashboard.

Outcome learning closes that loop. The ranking now learns from the owner's own
track record, and gets sharper every week it is used.

## How it works

```
 decided leads ──▶ labelled samples ──▶ learner ──▶ cached model ──▶ scorer
  (Opportunity)      (outcomes.ts)    (calibration.ts)  (DB)     (scoring/index)
        ▲                                                              │
        └──────────────── the owner triages the results ◀──────────────┘
```

### 1. Labelling — `scoring/calibration.ts`

Each status maps to a **target** (the conversion value we regress against) and a
**weight** (how much that decision is trusted as evidence):

| Status | Target | Weight | Why |
|---|---|---|---|
| `WON` | 1.00 | 1.00 | The objective. |
| `APPLIED` | 0.72 | 0.85 | Real effort was spent. |
| `CONTACTED` | 0.58 | 0.60 | Worth reaching out about. |
| `INTERESTING` | 0.50 | 0.35 | A shrug — kept, not acted on. |
| `WATCH` | 0.46 | 0.30 | A weaker shrug. |
| `LOST` | 0.34 | 0.80 | **Above the midpoint on purpose** — a lost bid was still worth pursuing, and finding pursuable work is the scorer's actual job. |
| `ARCHIVED` | 0.00 | 0.90 | Seen and thrown away. The true negative. |
| `NEW` | — | — | Never triaged; carries no signal. |

### 2. Learning

Two independent things are learned:

**Per criterion** — a weighted Pearson correlation between the criterion's raw
0..1 signal and the target. A criterion that separates wins from discards gets
its weight multiplied up; one that tracks discards gets multiplied down. A
criterion whose value never varies correlates at exactly 0, because a constant
explains nothing.

**Per feature** — discrete keys (`source:ehsys`, `category:voucher`,
`budget:50k-100k`, `token:udbud`) get a shrunk difference from the base
conversion rate. This is the adaptive replacement for the static lexicon: it
learns that *Erhvervshus vouchers convert for you and recruitment never does*
without anyone writing that down.

### 3. Shrinkage — the part that makes it safe

Every learned effect is multiplied by

```
confidence = n / (n + 12)        n = effective (weight-adjusted) sample count
```

so the model **starts as exactly the current behaviour and eases away from it**
as evidence accumulates. At 0 outcomes every multiplier is 1 and scores are
identical to the uncalibrated scorer. Below 4 effective samples nothing is
applied at all. Feature lift is shrunk a second time by its own sighting count,
so a single lucky win cannot rewrite the ranking.

Weights are rescaled, never replaced — a user who hand-tuned the Settings
sliders keeps their intent and has it *sharpened*, not overwritten.

### 4. Applying it

- Calibrated weights replace the base weights in `scoreOpportunity`.
- Matched features add a bounded adjustment, at most **±12 points**, squashed
  through `tanh` so many weak matches can never run away with the score.
- The adjustment is recorded on the breakdown as `calibration`, so the
  opportunity detail page can show *why* a lead was moved.

## Where it runs

| Trigger | Behaviour |
|---|---|
| Scheduled discovery (`runDueDiscovery`) | Relearns first, so tonight's leads are ranked by everything decided today. Failures are non-fatal. |
| `POST /api/calibration` | Relearns on demand and rescores the whole pipeline. Only rows whose score actually moved are written. |
| `GET /api/calibration` | Returns the model, computing it on first visit so the UI is never empty. |
| Discover workbench | Search results are ranked through the model, and saving one into the pipeline scores it the same way. |
| Ingestion / manual create / community import / rescore | Read the cached model and score through it. |

Every surface that produces a match score goes through the same model, so a lead
cannot be ranked one way in Discover and another way in the pipeline.

## Design decisions worth knowing

**The training set is derived, not journalled.** Samples are read from
`Opportunity` rows rather than a separate outcome ledger. That means learning
works retroactively over every lead ever touched, needs no hook on the status
write path (so it can never half-record a transition or drift out of sync), and
a wiped cache costs only a recompute. `ScoringCalibration` holds pure derived
data — dropping the table is safe.

**Stored score snapshots are preferred over recomputation.** Raw signals come
from the breakdown persisted when the lead was scored. Recomputing today would
mark every historical deadline "expired" and destroy the time-sensitivity
signal the lead was actually judged on. Recomputation is only the fallback for
rows scored before breakdowns were persisted.

**Both sides of the loop share one feature extractor.** `scoring/features.ts` is
used for training rows and for unseen leads. If the two ever drifted, learned
lift would silently stop matching anything.

**A missing table degrades, it does not break.** Prisma's `P2021` is caught, so
a deployment that has not run `db push` loses the feature quietly rather than
failing to score.

## Verifying it

```bash
npm run test -- src/lib/scoring     # 50 tests
```

The suite pins the guarantees that matter: no outcomes changes nothing, thin
evidence changes nothing, a constant signal is ignored, a feature seen once is
ignored, learned weights stay normalised, the point cap holds however many
features match, and scores never leave 0..100.

## Using it

**Settings → Learning** shows the whole model: how many decisions it learned
from, its confidence, which criteria moved and by how much, and the concrete
sources, categories and words that separate the owner's wins from their
discards — each with the sample size behind it. Nothing is asserted without the
evidence count that backs it.
