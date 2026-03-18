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
- `POST /api/interpret` placeholder
- `POST /api/generate` placeholder
- Dashboard, signals index, new signal, and review pages

## Explicitly Excluded
- Scraping
- Autonomous agents
- Scheduling automation
- Auth and user accounts
- Analytics engine
- Posting to social platforms
- Real image or video generation
- LLM-backed interpretation or generation
- Airtable base creation

## V1 Working Model
1. Operator manually submits one signal.
2. Signal receives a first-pass category, severity, hook, and status.
3. Placeholder interpretation and generation routes return structured mock outputs.
4. Records are reviewed in a clean internal dashboard.

## Next Planned Runs
- Add deeper review workflow states and edits
- Introduce richer Airtable field coverage and safer update semantics
- Add fixed-format draft generation logic behind the placeholder route
- Expand review tooling without adding automation beyond operator control
