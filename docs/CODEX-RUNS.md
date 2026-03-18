# Codex Runs

## Current Run
Run 4 adds the V1 content generation layer:
- fixed-template generation service in `lib/generator.ts`
- readable prompt construction in `lib/generation-prompts.ts`
- lightweight provider helper in `lib/llm.ts`
- provider selection order:
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - mock fallback
- `POST /api/generate` for record or payload-based generation
- `PATCH /api/signals/[id]/generate` for saving reviewed draft outputs
- dedicated generation workbench at `/signals/[id]/generate`
- editable draft review before save
- Airtable or mock-mode save flow that moves status to `Draft Generated`

## Implementation Notes
- App runs without Airtable by using believable mock records only when `AIRTABLE_PAT`, `AIRTABLE_BASE_ID`, or `AIRTABLE_TABLE_NAME` are missing.
- When Airtable is configured, listing and creating signals target the real base/table instead of silently falling back.
- Interpretation is rules-based and structured.
- Generation uses one provider path at a time with fixed output templates and strict response validation.
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
- If no provider key is configured, deterministic mock generation still supports the full review-and-save workflow.

## Suggested Next Runs
1. Add stronger draft-quality review tooling and lightweight redraft controls.
2. Add stronger interpretation and generation tuning based on operator feedback.
3. Add safer Airtable update coverage for more fields, including explicit clearing semantics.
4. Add review actions and schedule metadata editing.
