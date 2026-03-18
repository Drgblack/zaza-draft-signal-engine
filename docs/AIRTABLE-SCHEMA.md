# Airtable Schema Notes

## Base Configuration
- `AIRTABLE_PAT=<your Airtable personal access token>`
- `AIRTABLE_BASE_ID=appC3IsXkfpADw9uB`
- `AIRTABLE_TABLE_NAME=Signals`
- `NEXT_PUBLIC_APP_NAME=Zaza Draft Signal Engine`
- `ANTHROPIC_API_KEY=<optional, preferred for generation>`
- `OPENAI_API_KEY=<optional fallback for generation>`

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
- `Scenario Angle`
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
- `Ingestion Source`
- `Ingestion Method`
- `Signal Relevance Score`
- `Signal Novelty Score`
- `Signal Urgency Score`
- `Brand Fit Score`
- `Source Trust Score`
- `Duplicate Cluster ID`
- `Keep / Reject Recommendation`
- `Why Selected`
- `Why Rejected`
- `Auto-Generated?`
- `Needs Human Review`
- `Quality Gate Result`
- `Similarity To Existing Content`
- `Review Priority`
- `Teacher Voice Source`
- `Anonymised User Pattern?`
- `Related Zaza Framework Tag`
- `Generation Model Version`
- `Prompt Version`

## Automation-Prep Fields
These fields are now mapped in the app and ready for future ingestion, scoring, deduplication, and prioritisation work:

- Text:
  - `Ingestion Source`
  - `Ingestion Method`
  - `Duplicate Cluster ID`
- Number:
  - `Signal Relevance Score`
  - `Signal Novelty Score`
  - `Signal Urgency Score`
  - `Brand Fit Score`
  - `Source Trust Score`
  - `Similarity To Existing Content`
- Single select:
  - `Keep / Reject Recommendation`
    - `Keep`
    - `Review`
    - `Reject`
  - `Quality Gate Result`
    - `Pass`
    - `Needs Review`
    - `Fail`
  - `Review Priority`
    - `Low`
    - `Medium`
    - `High`
    - `Urgent`
- Long text:
  - `Why Selected`
  - `Why Rejected`
- Checkbox:
  - `Auto-Generated?`
  - `Needs Human Review`

These fields are display-ready and round-trip-safe, but this run does not implement:
- ingestion jobs
- scoring logic
- dedupe logic
- queue prioritisation logic

## Diagnostics
- `GET /api/signals/health` reports:
  - whether Airtable is configured
  - whether the API is reachable
  - whether the configured table exists
  - whether expected field labels are present
  - whether sample response mapping succeeded

## Workflow Updates
- `PATCH /api/signals/[id]/workflow` is the main server-side update route for:
  - `Status`
  - `Review Notes`
  - `Scheduled Date`
  - `Posted Date`
  - `Platform Posted To`
  - `Post URL`
  - `Final Caption Used`
- Interpretation save still uses `PATCH /api/signals/[id]/interpret`.
- Generation save still uses `PATCH /api/signals/[id]/generate`.
- If Airtable is unconfigured, the same workflow actions complete in mock mode with non-persistent session feedback.

## Scenario Framing
- `Scenario Angle` is now a first-class Airtable-backed field.
- Purpose:
  - bridge a raw signal into a clearer teacher communication scenario before interpretation runs
  - improve interpretation quality for indirect news, policy, or incident signals
- Quality guidance:
  - strong angles describe what the teacher needs to say, document, report, explain, or respond to
  - weak angles are usually headline rewrites or generic issue labels
- The app now evaluates the field as:
  - `missing`
  - `weak`
  - `usable`
  - `strong`
- Operator usage:
  - add or refine it on `/signals/[id]/interpret`
  - review the quality feedback shown under the field
  - optionally use `Suggest angles` for 2-3 bounded scenario ideas
  - run interpretation with the scenario framing in place
  - save the interpretation to persist both the scenario and the structured interpretation fields
- The interpretation layer now treats `Scenario Angle` as the highest-priority framing input when present, while still using the source headline, excerpt, and summary as evidence.
- The generation layer now also prioritises a usable `Scenario Angle` when building drafts, so outputs feel like they respond to the communication situation rather than just the source headline.

## Current Caveats
- `PATCH` updates still omit `undefined` values and do not implement explicit field clearing semantics yet.
- The internal `recordId` continues to use Airtable’s actual record ID, not the editable `Record ID` column.
- Engagement score fallback is computed in code for display only when Airtable does not provide `Engagement Score`.
- Generation metadata persists `Generation Model Version` and `Prompt Version`, but `generatedAt` and `generationSource` currently stay in app-layer metadata only.
- Automation readiness on the detail page is display-only and intentionally shallow. It is not a scoring or decision engine.
