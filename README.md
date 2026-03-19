# Zaza Draft Signal Engine

Internal human-in-the-loop signal interpretation and content preparation system for Zaza Draft.

## Purpose
Convert selected teacher-relevant signals into structured, platform-specific draft content for manual review and posting.

## V1 Scope
- Manual signal intake
- Lightweight insight layer over record state and audit trail
- Structured operator feedback capture over signals, framing, recommendations, outputs, and sources
- Feedback-aware co-pilot guidance that references past operator judgement without changing scoring or automation
- Pattern-aware co-pilot suggestions that surface relevant saved patterns with visible reasons
- Manual pattern library for capturing reusable signals, Scenario Angles, and output examples from strong records
- Heuristic pattern discovery assist that surfaces stronger candidate records without auto-creating patterns
- Pattern coverage gap visibility that shows where recurring signals are not yet well-covered by the existing pattern library
- Pattern lifecycle management so active patterns stay clean and retired patterns stay viewable but out of normal use
- Pattern bundles that group related patterns into reusable playbook kits
- Bundle coverage and missing-kit visibility that shows which communication families already have robust kits and which still need one
- Pattern-aware generation with visible, optional pattern selection during draft creation
- Editorial modes / posting-intent profiles with visible, single-mode selection during generation
- Platform intent profiles so X, LinkedIn, and Reddit express the same editorial mode differently
- Final review workspace for comparing, editing, and marking platform drafts before manual posting
- Manual posting log / external publishing memory for recording what was actually published outside the app
- Manual outcome quality tracking for judging whether a posted item felt strong, acceptable, weak, reusable, or not worth repeating
- Reuse memory that references prior judged posted outcomes when guiding new editorial decisions
- Editorial playbook cards that distill reusable operator guidance into compact manual cards linked to patterns, bundles, modes, and family labels
- Playbook coverage gaps that show where recurring editorial situations are still uncovered, weakly covered, or proving high-value without a saved card yet
- Unified guidance that converges co-pilot recommendation, reuse memory, playbook support, pattern support, and meaningful gap warnings into one compact operator-facing layer
- Editorial confidence that shows how much trust the current guidance deserves, using explainable qualitative support and uncertainty signals
- Operator tuning controls that let the operator adjust bounded strictness and guidance posture without editing code
- Signal interpretation
- Fixed-template content generation
- Airtable storage
- Internal review workflow

## Status
Active internal workflow with ingestion, scoring, scenario framing, generation, audit memory, operator-facing insights, a lightweight reusable pattern library, bounded pattern discovery suggestions, heuristic pattern-aware co-pilot assists, inspectable pattern coverage-gap visibility, a manual lifecycle layer for retiring weak or outdated patterns, manual pattern bundles for organising related approaches into small kits, bundle-level coverage visibility for spotting thin or missing kits, a bounded editorial-mode layer for shaping draft intent more explicitly, explicit platform intent profiles for X, LinkedIn, and Reddit, a final review workspace for last-mile manual editing decisions, a manual posting-memory layer for preserving what was actually published externally, a manual qualitative outcome layer for capturing whether those published outputs were worth repeating, a bounded reuse-memory layer that brings those judged outcomes back into new editorial decisions without auto-applying them, a manual editorial playbook-card layer for compact reusable operator guidance, a heuristic playbook-coverage layer that highlights which recurring situations still need clearer playbook support, a unified guidance layer that presents the strongest next action, relevant memory, and support context in one place, and a bounded operator-tuning layer for adjusting strictness and guidance posture without code edits.

## Unified Guidance
- Guidance is assembled centrally in `lib/guidance.ts` rather than duplicated in page components.
- The model pulls together:
  - primary co-pilot recommendation
  - feedback-aware support notes
  - reuse-memory highlights
  - related playbook cards
  - strongest relevant pattern and bundle context
  - meaningful playbook coverage-gap warnings
- Prioritisation stays explicit and compact:
  - primary action first
  - strongest reuse signal next
  - strongest playbook or pattern support after that
  - gap or caution note only when it materially helps
- The layer is operator-facing only:
  - no hidden ranking system
  - no automatic action-taking
  - no automatic playbook or pattern selection
- The signal detail page uses the fullest version of the panel. Interpretation, generation, and review reuse a lighter version of the same model.

## Editorial Confidence
- Editorial confidence is a bounded confidence-in-guidance layer, not a confidence-in-truth metric.
- Current levels are:
  - high
  - moderate
  - low
- Confidence is derived from structured signals the operator can inspect, such as:
  - Scenario Angle quality
  - pattern support
  - playbook support
  - reuse-memory quality
  - source fit and transformability
  - playbook coverage gaps
- Uncertainty flags are intentionally compact and may include:
  - weak framing
  - no playbook support
  - weak pattern match
  - uncertain source fit
  - novel or thinly covered case
  - cautionary reuse memory
  - indirect signal requires judgement
- The layer is advisory only:
  - no fake precision
  - no hard blockers
  - no hidden ranking system
  - no claim that a recommendation is objectively correct

## Operator Tuning
- Operator tuning is centralized in `lib/tuning.ts` with pure shared definitions in `lib/tuning-definitions.ts`.
- Current controls are intentionally small:
  - source strictness
  - scoring strictness
  - confidence strictness
  - co-pilot conservatism
  - transformability rescue
  - pattern suggestion strictness
- Presets are:
  - Conservative
  - Balanced
  - Exploratory
- Current tuning is persisted locally, surfaced on `/settings`, and summarized lightly on `/insights`.
- Tuning shifts bounded heuristics only:
  - source filtering and trust penalties
  - keep / review / reject thresholds
  - confidence thresholds
  - co-pilot posture on borderline cases
  - Scenario Angle rescue strength for indirect sources
  - pattern-suggestion minimum match strength
- Limitations:
  - no formula editor
  - no per-source custom tuning in this layer
  - no auto-learning or optimisation
  - bounded heuristics only

## Playbook Coverage Gaps
- Coverage areas are deterministic, compact combinations of existing structured dimensions such as platform, editorial mode, source family, and recurring situation family.
- Gaps are descriptive only. The layer does not cluster, generate cards automatically, or change scoring.
- Surfaced gaps fall into three operator-facing buckets:
  - uncovered
  - weak coverage
  - opportunity
- Operators can jump straight from a surfaced gap into the playbook create flow, with the title, situation, suggested modes, and obvious related pattern or bundle links prefilled.
- `What works` and `What to avoid` are intentionally left for operator judgement.
- Limitations:
  - heuristic only
  - uses structured signals and explicit keyword families rather than embeddings or semantic search
  - not exhaustive
