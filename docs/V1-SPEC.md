# Zaza Draft Signal Engine V1 Spec

## Purpose
Build a private internal dashboard for manually submitting signals, lightly classifying them, preparing fixed-format content drafts later, and reviewing the resulting records in a clean queue.

## Included In This Run
- Next.js App Router scaffold with TypeScript and Tailwind
- Shared dashboard shell UI
- Typed domain model for signals and API contracts
- Mock-safe fallback mode
- Fetch-based Airtable integration foundation
- `GET /api/signals`
- `POST /api/signals`
- Operator-triggered ingestion foundation with:
  - source registry
  - RSS / Atom feed fetching
  - feed normalisation
  - simple duplicate guard
  - `POST /api/ingest`
  - `/ingestion`
- Rules-based scoring layer with:
  - `POST /api/score`
  - one-record scoring from the signal detail page
  - bounded batch scoring from `/ingestion`
  - recommendation, quality gate, and review priority outputs
- Controlled pipeline chaining with:
  - `POST /api/pipeline/run`
  - bounded operator-triggered runs from `/ingestion`
  - explicit score-to-gate-to-interpret-to-generate rules
  - no autonomous recurring processing
- Rules-based interpretation layer
- `POST /api/interpret`
- `PATCH /api/signals/[id]/interpret`
- Human-guided scenario framing with:
  - Airtable-backed `Scenario Angle`
  - operator input on the interpretation workbench
  - interpretation precedence that treats scenario framing as the strongest shaping signal when present
- LLM-backed or mock-fixed generation layer
- `POST /api/generate`
- `PATCH /api/signals/[id]/generate`
- `PATCH /api/signals/[id]/workflow`
- Dashboard, signals index, signal detail, new signal, review, interpretation, and generation pages
- Generation workbench page

## Explicitly Excluded
- Broad scraping
- Autonomous agents
- Scheduling automation
- Auth and user accounts
- Analytics engine
- Posting to social platforms
- Real image or video generation
- Airtable base creation
- autonomous recurring interpretation/generation chaining

## V1 Working Model
1. Operator manually submits one signal.
2. Operator can also run ingestion against enabled structured feed sources to import candidate signals.
3. Imported candidates are saved as new records with ingestion metadata and human-review flags.
4. Operator can score new or existing records to decide whether they should be kept, reviewed, or rejected.
5. Operator can run a bounded pipeline pass that:
   - ingests
   - scores
   - gates
   - auto-interprets kept/pass records
   - auto-generates only high-priority kept/pass records
6. The interpretation layer returns a structured editorial read with category, severity, pain point, risk framing, hook, and platform guidance.
7. Operator can add a scenario angle when a raw source needs to be transformed into a clearer teacher communication situation before interpretation.
8. Operator edits and saves the interpretation back to the signal record when needed.
9. The generation layer produces fixed-format drafts for X, LinkedIn, Reddit, image direction, and short-form video.
10. Operator edits and saves the drafts back to the record when needed.
11. Operator reviews, approves, schedules, and logs posting metadata manually through the detail workflow.

## Next Planned Runs
- Improve duplicate handling and better borderline-review tooling
- Add more operator control over bounded pipeline scope and thresholds
- Add stronger operator-side quality controls for interpretation and generation outputs
- Keep the workflow single-operator and human-in-the-loop without auth or posting integrations
