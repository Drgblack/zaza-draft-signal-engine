# Codex Runs

## Current Run
Scaffold the internal tool foundations only:
- repo structure
- core types
- config and mock mode
- Airtable wrapper
- route placeholders
- dashboard shell UI

## Implementation Notes
- App runs without Airtable by using believable mock records.
- Airtable integration activates only when `AIRTABLE_PAT`, `AIRTABLE_BASE_ID`, and `AIRTABLE_TABLE_NAME` are all present.
- Interpretation and generation routes are placeholders that return structured mock objects.

## Suggested Next Runs
1. Add edit and detail views for an individual signal.
2. Add safer Airtable update coverage for more fields.
3. Introduce controlled draft templates for X, LinkedIn, and Reddit.
4. Add review actions and schedule metadata editing.
