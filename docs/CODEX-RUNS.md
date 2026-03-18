# Codex Runs

## Current Run
Run 3 adds the V1 interpretation layer:
- rules-based editorial interpretation service in `lib/interpreter.ts`
- explicit rule catalog in `lib/interpreter-rules.ts`
- structured interpretation output with validation
- `POST /api/interpret` for record or payload-based interpretation
- `PATCH /api/signals/[id]/interpret` for saving reviewed interpretation fields
- dedicated operator workbench at `/signals/[id]/interpret`
- editable interpretation review before save
- Airtable or mock-mode save flow that moves status to `Interpreted`

## Implementation Notes
- App runs without Airtable by using believable mock records only when `AIRTABLE_PAT`, `AIRTABLE_BASE_ID`, or `AIRTABLE_TABLE_NAME` are missing.
- When Airtable is configured, listing and creating signals target the real base/table instead of silently falling back.
- Interpretation is now rules-based and structured. Generation remains placeholder-only.
- Signal health can be checked with `GET /api/signals/health`.
- Engagement score is derived in code for display only when the Airtable field is blank.
- Interpretation metadata includes confidence, source, and interpreted-at timestamp for operator trust, but those metadata fields are not persisted to Airtable in this run.
- Saved interpretation fields currently include:
  - Signal Category
  - Severity Score
  - Signal Subtype
  - Emotional Pattern
  - Teacher Pain Point
  - Relevance to Zaza Draft
  - Risk to Teacher
  - Interpretation Notes
  - Hook Template Used
  - Content Angle
  - Platform Priority
  - Suggested Format Priority
  - Status = `Interpreted`

## Suggested Next Runs
1. Build the draft generation layer for X, LinkedIn, Reddit, image prompt, and video script.
2. Add stronger interpretation tuning and rule instrumentation based on operator feedback.
3. Add safer Airtable update coverage for more fields, including explicit clearing semantics.
4. Add review actions and schedule metadata editing.
