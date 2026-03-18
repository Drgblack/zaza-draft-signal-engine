# Codex Runs

## Current Run
Run 5.5 extends the schema and Airtable mappings for the next automation phase:
- typed support for automation-prep fields including:
  - ingestion source and method
  - scoring fields
  - duplicate cluster reference
  - keep/review/reject recommendation
  - quality gate result
  - review priority
  - auto-generated and needs-human-review flags
- central Airtable field definitions updated in `lib/airtable-schema.ts`
- Airtable parse and serialize coverage extended in `lib/airtable.ts`
- mock records updated so old and new flows stay compatible
- light detail-page surfacing for automation readiness
- optional review queue surfacing for recommendation and priority
- no ingestion, scoring, dedupe, or automation logic added yet

## Previous Runs
Run 5 refines the V1 workflow into a more coherent operator tool:
- dedicated record detail page at `/signals/[id]`
- generic workflow update route at `PATCH /api/signals/[id]/workflow`
- explicit status actions for:
  - `Reviewed`
  - `Approved`
  - `Scheduled`
  - `Posted`
  - `Archived`
  - `Rejected`
- scheduling support for `Scheduled Date`
- posted support for:
  - `Posted Date`
  - `Platform Posted To`
  - `Post URL`
  - `Final Caption Used`
- actionable review queue at `/review`
- light filtering and sorting on `/signals`
- dashboard pipeline improvements with scheduled-soon visibility
- Run 4 added the V1 content generation layer with:
  - fixed-template generation service in `lib/generator.ts`
  - readable prompt construction in `lib/generation-prompts.ts`
  - lightweight provider helper in `lib/llm.ts`
  - provider selection order:
    - `ANTHROPIC_API_KEY`
    - `OPENAI_API_KEY`
    - mock fallback
  - `POST /api/generate`
  - `PATCH /api/signals/[id]/generate`
  - dedicated generation workbench at `/signals/[id]/generate`

## Implementation Notes
- App runs without Airtable by using believable mock records only when `AIRTABLE_PAT`, `AIRTABLE_BASE_ID`, or `AIRTABLE_TABLE_NAME` are missing.
- When Airtable is configured, listing and creating signals target the real base/table instead of silently falling back.
- Interpretation is rules-based and structured.
- Generation uses one provider path at a time with fixed output templates and strict response validation.
- Signal health can be checked with `GET /api/signals/health`.
- Engagement score is derived in code for display only when the Airtable field is blank.
- Workflow updates now flow through a single route that writes status, scheduling, and posting metadata back to Airtable when configured.
- Automation-prep metadata now round-trips safely through the shared Airtable layer, but no scoring or dedupe decisions are executed yet.
- The review queue groups records into:
  - needs interpretation
  - ready for generation
  - ready for review
  - approved / ready to schedule
  - scheduled / awaiting posting
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
- Saved generation fields currently include:
  - X Draft
  - LinkedIn Draft
  - Reddit Draft
  - Image Prompt
  - Video Script
  - CTA / Closing Line
  - Hashtags / Keywords
  - Generation Model Version
  - Prompt Version
  - Status = `Draft Generated`
- Workflow save coverage currently includes:
  - Status
  - Review Notes
  - Scheduled Date
  - Posted Date
  - Platform Posted To
  - Post URL
  - Final Caption Used
- Automation-prep field coverage currently includes:
  - Ingestion Source
  - Ingestion Method
  - Signal Relevance Score
  - Signal Novelty Score
  - Signal Urgency Score
  - Brand Fit Score
  - Source Trust Score
  - Duplicate Cluster ID
  - Keep / Reject Recommendation
  - Why Selected
  - Why Rejected
  - Auto-Generated?
  - Needs Human Review
  - Quality Gate Result
  - Similarity To Existing Content
  - Review Priority
- If no provider key is configured, deterministic mock generation still supports the full review-and-save workflow.

## Suggested Next Runs
1. Add the automated ingestion foundation using the newly mapped schema fields.
2. Add scoring and dedupe logic on top of the prepared Airtable fields.
3. Add explicit Airtable field-clearing semantics for update routes where needed.
4. Add lightweight operator controls around automation review without expanding into bulk workflow.
