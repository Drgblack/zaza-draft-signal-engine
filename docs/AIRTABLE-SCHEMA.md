# Airtable Schema Notes

## Base Configuration
- `AIRTABLE_PAT=<your Airtable personal access token>`
- `AIRTABLE_BASE_ID=appC3IsXkfpADw9uB`
- `AIRTABLE_TABLE_NAME=Signals`
- `NEXT_PUBLIC_APP_NAME=Zaza Draft Signal Engine`

## Integration Approach
- Secrets are read from environment variables only.
- Airtable access uses direct `fetch`, not the Airtable SDK.
- Field-name constants and field kinds are isolated in `lib/airtable-schema.ts`.
- Parsing and serialization logic live in `lib/airtable.ts`.
- Mock mode is used only when Airtable env vars are missing.
- If Airtable is configured but failing, the app now surfaces an explicit error instead of silently swapping to mock data.

## Recommended V1 Fields
These are the live field labels the app now maps against:

- `Record ID`
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
- `Relevance to Zaza Draft`
- `Risk to Teacher`
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
- `CTA / Closing Line`
- `Hashtags / Keywords`
- `Posted?`
- `Platform Posted To`
- `Final Caption Used`
- `Asset Link`
- `Post URL`
- `Platform Performed Best`
- `Likes / Reactions`
- `Comments`
- `Shares / Reposts`
- `Saves`
- `Clicks`
- `Engagement Score`
- `Outcome Quality`
- `Why It Performed / Didn’t`
- `Repeatable Pattern?`
- `Best Hook-Signal Combination`
- `Evergreen Potential`
- `Repurpose Later`
- `Repurpose Ideas`
- `Teacher Voice Source`
- `Anonymised User Pattern?`
- `Related Zaza Framework Tag`
- `Generation Model Version`
- `Prompt Version`

## Diagnostics
- `GET /api/signals/health` reports:
  - whether Airtable is configured
  - whether the API is reachable
  - whether the configured table exists
  - whether expected field labels are present
  - whether sample response mapping succeeded

## Current Caveats
- `PATCH` updates still omit `undefined` values and do not implement explicit field clearing semantics yet.
- The internal `recordId` continues to use Airtable’s actual record ID, not the editable `Record ID` column.
- Engagement score fallback is computed in code for display only when Airtable does not provide `Engagement Score`.
