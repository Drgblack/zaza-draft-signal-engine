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
- Rules-based interpretation layer
- `POST /api/interpret`
- `PATCH /api/signals/[id]/interpret`
- LLM-backed or mock-fixed generation layer
- `POST /api/generate`
- `PATCH /api/signals/[id]/generate`
- `PATCH /api/signals/[id]/workflow`
- Dashboard, signals index, signal detail, new signal, review, interpretation, and generation pages
- Generation workbench page

## Explicitly Excluded
- Scraping
- Autonomous agents
- Scheduling automation
- Auth and user accounts
- Analytics engine
- Posting to social platforms
- Real image or video generation
- Airtable base creation

## V1 Working Model
1. Operator manually submits one signal.
2. Signal receives a first-pass category, severity, hook, and status.
3. The interpretation layer returns a structured editorial read with category, severity, pain point, risk framing, hook, and platform guidance.
4. Operator edits and saves the interpretation back to the signal record.
5. The generation layer produces fixed-format drafts for X, LinkedIn, Reddit, image direction, and short-form video.
6. Operator edits and saves the drafts back to the record.
7. Operator reviews, approves, schedules, and logs posting metadata manually through the detail workflow.

## Next Planned Runs
- Add stronger operator-side quality controls for interpretation and generation outputs
- Introduce richer Airtable update semantics where fields need explicit clearing
- Expand review tooling without adding automation beyond operator control
- Keep the workflow single-operator and human-in-the-loop without auth or posting integrations
