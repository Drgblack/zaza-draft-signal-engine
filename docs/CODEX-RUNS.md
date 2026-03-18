# Codex Runs

## Current Run
Run 2 hardens Airtable reliability:
- exact Airtable field-label alignment
- schema-driven parser/serializer layer
- narrow create payload for manual intake
- stricter `GET /api/signals` and `POST /api/signals`
- internal diagnostics via `GET /api/signals/health`
- clearer UI feedback for Airtable vs mock mode

## Implementation Notes
- App runs without Airtable by using believable mock records only when `AIRTABLE_PAT`, `AIRTABLE_BASE_ID`, or `AIRTABLE_TABLE_NAME` are missing.
- When Airtable is configured, listing and creating signals target the real base/table instead of silently falling back.
- Interpretation and generation routes are placeholders that return structured mock objects.
- Signal health can be checked with `GET /api/signals/health`.
- Engagement score is derived in code for display only when the Airtable field is blank.

## Suggested Next Runs
1. Add edit and detail views for an individual signal.
2. Add safer Airtable update coverage for more fields, including explicit clearing semantics.
3. Introduce controlled draft templates for X, LinkedIn, and Reddit.
4. Add review actions and schedule metadata editing.
