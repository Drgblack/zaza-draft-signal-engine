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
- Signal interpretation
- Fixed-template content generation
- Airtable storage
- Internal review workflow

## Status
Active internal workflow with ingestion, scoring, scenario framing, generation, audit memory, operator-facing insights, a lightweight reusable pattern library, bounded pattern discovery suggestions, heuristic pattern-aware co-pilot assists, inspectable pattern coverage-gap visibility, a manual lifecycle layer for retiring weak or outdated patterns, manual pattern bundles for organising related approaches into small kits, bundle-level coverage visibility for spotting thin or missing kits, a bounded editorial-mode layer for shaping draft intent more explicitly, explicit platform intent profiles for X, LinkedIn, and Reddit, a final review workspace for last-mile manual editing decisions, a manual posting-memory layer for preserving what was actually published externally, and a manual qualitative outcome layer for capturing whether those published outputs were worth repeating.
