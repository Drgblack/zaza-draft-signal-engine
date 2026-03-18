# Airtable Schema Notes

## Base Configuration
- `AIRTABLE_BASE_ID=appC3IsXkfpADw9uB`
- `AIRTABLE_TABLE_NAME=Signals`

## Integration Approach
- Secrets are read from environment variables only.
- Airtable access uses direct `fetch`, not the Airtable SDK.
- Field name mapping is isolated in `lib/airtable.ts`.
- The app falls back to mock mode when Airtable is not fully configured.

## Recommended V1 Fields
These Airtable field labels are the current mapping targets used by the scaffold:

- `Created Date`
- `Created By`
- `Status`
- `Review Notes`
- `Reuse Flag`
- `Scheduled Date`
- `Posted Date`
- `Source URL`
- `Source Title`
- `Source Type`
- `Source Publisher`
- `Source Date`
- `Raw Excerpt`
- `Manual Summary`
- `Signal Category`
- `Severity Score`
- `Signal Subtype`
- `Emotional Pattern`
- `Teacher Pain Point`
- `Relevance To Zaza Draft`
- `Risk To Teacher`
- `Interpretation Notes`
- `Hook Template Used`
- `Content Angle`
- `Platform Priority`
- `Suggested Format Priority`
- `X Draft`
- `LinkedIn Draft`
- `Reddit Draft`
- `Image Prompt`
- `Video Script`
- `CTA Or Closing Line`
- `Hashtags Or Keywords`
- `Posted`
- `Platform Posted To`
- `Final Caption Used`
- `Asset Link`
- `Post URL`
- `Platform Performed Best`
- `Likes Or Reactions`
- `Comments`
- `Shares Or Reposts`
- `Saves`
- `Clicks`
- `Engagement Score`
- `Outcome Quality`
- `Why It Performed Or Didnt`
- `Repeatable Pattern`
- `Best Hook Signal Combination`
- `Evergreen Potential`
- `Repurpose Later`
- `Repurpose Ideas`
- `Teacher Voice Source`
- `Anonymised User Pattern`
- `Related Zaza Framework Tag`
- `Generation Model Version`
- `Prompt Version`

## Caveat
`PATCH` updates currently omit `undefined` values and do not implement explicit field clearing semantics yet. That is acceptable for this scaffold run but should be tightened in a later pass.
