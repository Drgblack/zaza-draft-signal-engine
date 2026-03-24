

# Zaza Growth Engine — Video Factory
## Complete Technical Specification: Phases B · C · D · E

**Zaza Technologies — Confidential Internal Build Document**  
*Revision 3 — incorporates all reviewer feedback rounds*

## Current Build Status — March 24 2026

### Completed
- Phase B: ContentOpportunity + VideoBrief intelligence layer, trust heuristics, and founder review flow
- Strategic Intelligence split: Content Intelligence read-model projection plus persisted Growth Intelligence routing metadata
- Phase C: real provider-backed video factory pipeline, RenderJob lifecycle, queue runner, retry logic, idempotency, quality checks, ffmpeg composition, review API wiring, run ledger, lineage, and package export
- Phase D: final-script trust pass, WeeklySignalDigest, ProductionDefaults versioning, prompt override rules, provider benchmark aggregation, A/B config/result tagging, observability surfaces, retention metadata, standalone ThumbnailSpec storage, and provider registry completion
- Phase E foundations: BatchRenderJob, ContentMixTarget, AutoApproveConfig, ConnectHandoffPackage, ConnectPerformanceSignal, CreatorBrief, ContentSeries, and channel package metadata

### In progress
- Native Inngest orchestration beyond the current local queue runner + Inngest-compatible dispatch layer
- Deeper channel-specific packaging and delivery workflows beyond the current typed metadata and handoff bundle layer

### Remaining gaps
- No standalone CDN control plane beyond Blob-backed persistence and CDN-ready delivery metadata
- Thumbnail overlay-text workflow remains narrower than the full Phase D vision

### Status note

This block supersedes the earlier prompt-by-prompt handoff notes. The implementation has moved well past the old "Prompts 6-10" checkpoint, so the historical handoff instructions are intentionally removed.

---

## Table of Contents

1. [System Overview & Strategic Architecture](#1-system-overview--strategic-architecture)
2. [Roadmap Summary](#2-roadmap-summary)
3. [Phase B — Video-Ready Intelligence](#3-phase-b--video-ready-intelligence)
4. [Phase C — One-Click AI Video Generation](#4-phase-c--one-click-ai-video-generation)
5. [Phase D — Feedback, Trust Hardening & Production Readiness](#5-phase-d--feedback-trust-hardening--production-readiness)
6. [Phase E — Batch Production, Connect Handoff & Scaled Distribution](#6-phase-e--batch-production-connect-handoff--scaled-distribution)
7. [Cross-Phase Data Model](#7-cross-phase-data-model)
8. [Provider Strategy & Multi-Provider Abstraction](#8-provider-strategy--multi-provider-abstraction)
9. [Cost Awareness Architecture](#9-cost-awareness-architecture)
10. [Queue & Async Orchestration](#10-queue--async-orchestration)
11. [Non-Goals & Deferral Register](#11-non-goals--deferral-register)
12. [Glossary](#12-glossary)

---

## 1. System Overview & Strategic Architecture

The Zaza Growth Engine is a trust-first, video-first signal-to-distribution intelligence system. It listens to teacher pain signals from public sources, converts those signals into structured content opportunities, generates production-ready video briefs, and produces AI-generated video assets for founder review and downstream distribution.

This is not a video generator. It is a **decision-to-content system with zero friction**. The video is the output; the intelligence pipeline is the product.

### 1.1 End-to-End Flow

```
Signal Engine                   Content Intelligence            Execution Layer
─────────────────               ─────────────────────           ───────────────
Ingestion                       ContentOpportunity              Connect
Scoring                   →     MessageAngle              →     Campaigns
Interpretation                  HookSet                         Outreach
Memory                          VideoBrief                      Influencer handoff
                                RenderJob                       Asset export
                                RenderedAsset
                                PublishPackage
```

**Implementation note — March 24 2026:** the repo now enforces a Strategic Intelligence split in code. `ContentIntelligence` is a read-only projection over persisted opportunity fields, while `GrowthIntelligence` is persisted separately and only consumes content-level outputs for routing, prioritisation, and execution-path selection.

### 1.2 Architecture Principles

- **Sense before act.** The Signal Engine interprets; Connect executes. These are separate systems sharing a typed intelligence contract.
- **Human approval at the boundary.** The founder approves briefs before generation. Nothing downstream runs without that approval.
- **Trust is structural.** Trust guardrails are not brand preferences. They are enforced at every layer: opportunity, angle, hook, brief, render, review.
- **Video is the primary output.** All other content formats are derivatives of the video brief.
- **Consistency over cleverness.** Fixed voice identity, fixed style anchors, and fixed prompt structures outperform creative variation at this stage.
- **Compound by learning.** Performance signals must feed back into scoring. A system that does not learn is an expensive template.
- **Cost awareness is not optional.** Video generation is 10–100× more expensive than text. Every job must be costed before it runs, and every regeneration loop must be bounded.
- **Determinism after approval.** No AI rewriting of approved language. The founder approved specific words. The pipeline must use them.
- **No provider lock-in.** The visual generation layer uses a typed `VisualProvider` abstraction from day one. Provider switching must never require pipeline changes.

### 1.3 The Four-Phase Model

| Phase | Name | Primary Output | Gate to Next Phase |
|-------|------|----------------|--------------------|
| B | Video-Ready Intelligence | Production-ready brief | Founder approves brief in under 2 minutes in 70% of cases |
| C | One-Click Video Generation | Reviewable video asset | Founder receives video within 5 minutes; regeneration rate below 50% |
| D | Feedback & Hardening | Learning system | Regeneration rate below 30% within 60 days of Phase C launch |
| E | Scale & Delivery | Growth production engine | 10+ videos exported per week without founder as production bottleneck |

---

## 2. Roadmap Summary

Phases are sequential. Each phase has a hard gate condition before the next begins.

| Phase | Goal | Core Deliverables | Primary Risk | Success Criteria |
|-------|------|-------------------|--------------|------------------|
| B | Turn signals into production-ready briefs | ContentOpportunity, MessageAngle, HookSet, VideoBrief, review UI, TrustEvaluator, confidence scoring | AI-generated language feels generic; teacher voice lost | Brief approval under 2 min with no rewriting in 70% of cases |
| C | One-click video generation after brief approval | VisualProvider abstraction, RenderJob lifecycle, queue system, cost tracking, regeneration budget cap, idempotency, pre-generation triage, asset review UI | Provider quality inconsistency; unconstrained API spend; no real fallback for primary provider | Founder presses Generate and receives reviewable video within 5 min; cost visible per job; regeneration budget enforced |
| D | System learns and hardens | PerformanceSignal loop, prompt versioning, A/B defaults comparison, deduplication, TrustEvaluator service, final-script trust pass, thumbnail enhancement, music layer, CDN delivery, observability | Feedback ignored; system stagnates at Phase C quality ceiling | Regeneration rate below 30%; cost-per-approved-video trend decreasing |
| E | Operate at scale and feed distribution | Batch rendering, Connect handoff, creator briefs, channel packaging, content mix engine, auto-approve with safety rails | Complexity outpaces team capacity; Connect coupling too tight | 10+ videos exported per week without founder bottleneck; Connect consumes handoff packages autonomously |

---

## 3. Phase B — Video-Ready Intelligence

> **B thinks.**
> This is the intelligence layer. Nothing in Phases C, D, or E functions without the artifacts Phase B produces.

### 3.1 Purpose

Phase B converts ranked signals into founder-reviewable, production-ready content briefs. The primary output of Phase B is not a video — it is a VideoBrief that is good enough to generate from without rewriting.

### 3.2 Scope

- ContentOpportunity generation from ranked signals, with confidence scoring
- MessageAngle engine — framing and stance selection
- HookSet engine — platform-ready opening lines
- VideoBrief builder — production-complete creative document
- Founder review flow — approve, edit, skip-with-reason
- TrustEvaluator — first deployment as a generation-time constraint
- Teacher voice preservation — authentic language captured and protected from source signals

### 3.3 Data Objects

#### ContentOpportunity

A ContentOpportunity is a decision object, not a signal summary. It tells the founder what pain is present, why it matters now, what angle is promising, and what commercial and trust risks exist.

```ts
interface ContentOpportunity {
  opportunityId:            string
  sourceSignalIds:          string[]
  title:                    string
  primaryPainPoint:         string
  painPointCategory:        string    // e.g. 'parent-complaint-emails' — used by PromptOverride in Phase D
  teacherLanguage:          string[]  // verbatim phrases from source signals — preserved, not paraphrased
  recommendedAngle:         string
  recommendedHookDirection: string
  recommendedFormat:        'short-form-video' | 'carousel' | 'thread'
  recommendedPlatforms:     Platform[]
  whyNow:                   string
  commercialPotential:      'high' | 'medium' | 'low'
  trustRisk:                'high' | 'medium' | 'low'
  trustRiskNotes:           string[]
  confidence:               number    // 0–100; drives auto-prioritisation and Phase E auto-approve
  historicalCostAvg:        number | null  // null in Phase B; populated from Phase C data onwards
  historicalApprovalRate:   number | null  // null in Phase B; shown in review as nudge toward high-ROI angles
  memoryContext:            string | null
  status:                   OpportunityStatus
  createdAt:                string
  reviewedAt:               string | null
  skipReason:               SkipReason | null  // required when founder skips — becomes training data
  operatorNotes:            string | null
}

type SkipReason =
  | 'not_relevant'
  | 'wrong_audience'
  | 'trust_risk_too_high'
  | 'timing_wrong'
  | 'duplicate_of_existing'
  | 'other'
```

> **On confidence score:** The primary mechanism for reducing founder cognitive load. High-confidence opportunities surface first. In Phase E, opportunities above a configured threshold can be auto-approved to brief stage. Design the field now; activate auto-approval in Phase E.

> **On skipReason:** Not optional UX polish. It is the training data for Phase D scoring improvement. Every skip without a reason is a wasted signal. The UI must require it before the skip is accepted.

> **On historicalCostAvg and historicalApprovalRate:** Null in Phase B. Populated from Phase C job records onwards. In Phase C review the founder sees: *"Similar pain points: avg €0.68 / 62% approved"* — a low-cost behavioural nudge toward high-ROI angles that compounds over time.

#### MessageAngle

```ts
interface MessageAngle {
  angleId:       string
  opportunityId: string
  angle:         string    // e.g. "Tired teachers don't need better writing — they need safer writing"
  stance:        'protective' | 'empowering' | 'validating' | 'reframing'
  proofPoints:   string[]
  avoid:         string[]  // language patterns that break trust for this angle
  trustScore:    number    // 0–100 from TrustEvaluator
  trustNotes:    string[]
}
```

#### HookSet

```ts
interface HookSet {
  hookSetId:  string
  angleId:    string
  platform:   'tiktok' | 'instagram-reels' | 'youtube-shorts' | 'linkedin'
  hooks:      string[]    // 3–5 hooks per platform
  riskNotes:  string[]
}
```

#### VideoBrief

The VideoBrief is the primary production artifact. All fields that feed the narration script must be written in approved, trust-safe, teacher-authentic language at this stage.

**There is no AI rewriting after approval. This is a pipeline integrity rule, not a feature preference.**

```ts
interface VideoBrief {
  briefId:               string
  opportunityId:         string
  angleId:               string
  primaryHook:           string      // first spoken line
  scriptBeat1:           string      // problem recognition
  scriptBeat2:           string      // solution awareness
  scriptBeat3:           string      // reassurance or proof
  softClose:             string      // CTA — always gentle, never pushy
  visualDirection:       string      // general scene description
  brollIdeas:            string[]    // suggested visual subjects, one per scene
  textOverlayIdeas:      string[]
  audience:              string
  trustGuardrails:       string[]    // what must NOT appear in the generated video
  productDestination:    string
  contentType:           ContentType
  status:                BriefStatus
  approvedAt:            string | null
  reviewStatus:          'pending' | 'approved' | 'rejected' | 'needs-edit'
  finalScriptTrustScore: number | null  // null in Phase B; populated in Phase D after full-script evaluation
}

type ContentType = 'pain' | 'validation' | 'solution' | 'story'
```

> **On contentType:** Added in Phase B, consumed by Phase E content mix engine. Label it at brief creation, not retroactively.

> **On finalScriptTrustScore:** Null in Phase B. When Phase D adds the final-script trust pass, this is a data population change, not a schema migration. Design the field now.

### 3.4 TrustEvaluator — First Deployment

In Phase B, TrustEvaluator runs at angle and hook generation time. It is a constrained AI call with a fixed system prompt and a structured output schema. It must use a different model than the generation pipeline — one failure mode must not affect both.

```ts
interface TrustEvaluationInput {
  text:     string
  context:  'angle' | 'hook' | 'script' | 'caption'
  audience: 'teacher'
}

interface TrustEvaluationResult {
  score:       number           // 0–100; threshold for pass: 70
  passed:      boolean
  violations:  TrustViolation[]
  suggestions: string[]
}

interface TrustViolation {
  pattern:     string
  severity:    'block' | 'warn'
  replacement: string | null
}
```

Violations at `block` severity auto-regenerate without surfacing to founder. Violations at `warn` appear as amber indicators. Founder is not required to resolve them.

**Patterns that always block:**

- Urgency language ("act now", "don't wait", "limited time")
- Fear amplification ("your career is at risk", "you could lose your job")
- Exaggerated claims ("never worry again", "completely solved")
- AI-bro framing ("I used AI and it changed everything")
- Fake-social-proof patterns ("teachers everywhere are switching to")
- Condescension toward teachers ("most teachers don't realise")

### 3.5 Teacher Voice Preservation

The `teacherLanguage[]` field captures verbatim phrases from source signals. The generation prompt must preserve and echo this language, not translate it into cleaner prose. This is a competitive advantage, not a UX detail.

```
You have access to the following phrases used by teachers themselves to describe this pain.
Incorporate at least one of these phrases verbatim or near-verbatim in the angle or hook.
Do not translate them into cleaner language. Their rawness is the signal.

Teacher phrases: [teacherLanguage array]
```

### 3.6 Founder Review Flow

| Step | Action | Target Time |
|------|--------|-------------|
| 1. Opportunity triage | Confidence-ordered queue. Read pain point, why-now, trust risk, historical cost/approval hint. Select or skip with reason. | 20–30 sec |
| 2. Angle + hook selection | Review 2–3 angles with trust scores. Click to select. | 30–45 sec |
| 3. Brief review | Read hook, beats, soft close. Edit 1–2 lines if needed. Click Approve. | 60–90 sec |

### 3.7 Phase B Success Criteria

- Brief approval under 2 minutes with no rewriting in 70% of cases
- Generated angles preserve at least one verbatim teacher phrase per opportunity
- Trust risk visible at every layer before approval
- All skipped or rejected opportunities capture a reason
- Confidence scores correlate with actual founder selection rate within 30 days

---

## 4. Phase C — One-Click AI Video Generation

> **C produces.**
> The founder approves a brief. The system produces a video. The founder reviews it.

### 4.1 Purpose

Phase C converts an approved VideoBrief into a real, reviewable video asset with a single founder action. The founder is active only at brief approval and final asset review.

### 4.2 Non-Goals (Phase C Strict Boundary)

- Auto-posting to any platform
- AI rewriting of approved brief language — pipeline integrity violation
- Batch rendering (Phase E)
- Influencer dispatch (Connect)
- Analytics optimisation loops (Phase D)
- Scheduling or campaign assignment
- Music layer (Phase D)
- Thumbnail overlay text (Phase D)
- A/B provider comparison (Phase D)
- Reference image continuity (Phase D)
- ElevenLabs v3 upgrade (Phase D)

### 4.3 Current System State Before Phase C

| Component | Status |
|-----------|--------|
| `/factory-inputs` UI + API | Operational and wired to real routes |
| VideoBrief approval gate | Operational |
| Prompt Compiler (deterministic) | Operational; includes trust checks and prompt overrides |
| RenderJob + RenderedAsset schema | Operational and persisted |
| ProductionDefaults snapshot | Operational, versioned, and applied at compile/job time |
| `/render-status` polling route | Operational |
| Generation completes synchronously | No — queued/local async runner with external Inngest-compatible dispatch support |
| Provider layer | Operational registry with explicit real/mock gating |
| VisualProvider interface | Operational |
| Lifecycle state machine | Operational |
| Queue system | Operational local queue runner plus Inngest-compatible dispatch layer |
| Cost tracking | Operational |
| Regeneration budget cap | Operational |
| Pre-generation triage picker | Operational |
| Retry and failure logic | Operational |
| Idempotency protection | Operational |

### 4.4 Provider Strategy & Visual Provider Abstraction

#### The Core Rule

The `VisualProvider` interface must be implemented before any provider-specific code is written. Provider-specific logic never appears in the pipeline. All providers are registered implementations of the same interface. Switching provider requires adding one implementation file — not touching the pipeline.

#### VisualProvider Interface

```ts
interface VisualProviderOptions {
  prompt:       string
  durationSecs: number
  aspectRatio:  '9:16'
  quality:      'fast' | 'standard'
  referenceImageUrl?: string    // optional; passed when defaults.visual.referenceImageUrl is set
}

interface VisualProviderResult {
  taskId: string
  poll():  Promise<VisualProviderPollResult>
}

interface VisualProviderPollResult {
  status:   'pending' | 'succeeded' | 'failed'
  videoUrl: string | null
  error:    string | null
}

interface VisualProvider {
  id:            string        // e.g. 'runway-gen4', 'kling-2', 'veo-3'
  displayName:   string
  costPerSecond: number        // used by CostEstimate
  generateScene(options: VisualProviderOptions): Promise<VisualProviderResult>
}
```

#### Provider Registry

```ts
const visualProviders: Record<string, VisualProvider> = {
  'runway-gen4': new RunwayGen4Provider(),
  'kling-2':     new Kling2Provider(),    // registered from Phase C; used as fallback
  'veo-3':       new Veo3Provider(),      // registered; activated when API confirmed stable
}
```

#### Primary Stack

| Role | Provider | Phase C Default | Rationale |
|------|----------|-----------------|-----------|
| Narration | ElevenLabs Multilingual v2 | Yes | Best voice consistency; fixed voice ID; reliable REST |
| Narration model family | Configurable via `modelFamily` field | v2 | Allows v3 upgrade in Phase D without code change |
| Visuals | Runway Gen-4 | Yes | Strong programmatic API; reliable async; good style control |
| Captions | AssemblyAI | Yes | Word-level timestamps; SRT output; accurate on synthesised speech |
| Composition | ffmpeg (self-hosted) | Yes | Full control; deterministic; no per-call cost |

#### Fallback Matrix

| Primary Fails | Tier-2 Fallback | Notes |
|---------------|-----------------|-------|
| ElevenLabs | OpenAI TTS (`tts-1-hd`, `onyx`) | Lower voice consistency; all fallback uses logged |
| Runway Gen-4 | Kling via aggregator (fast mode) | Real motion video — not static image. Static image + ken-burns is visibly outdated in 2026. |
| AssemblyAI | OpenAI Whisper (`whisper-1`) | Slightly lower timestamp precision; acceptable |
| ffmpeg | `failed_permanent` | No cloud fallback; surface clearly; fix locally |

> **Why Kling as visual fallback, not static image:** Static image with ffmpeg pan/zoom looks visibly outdated alongside modern short-form video. Kling provides real motion video at lower cost and faster generation than Runway. It is registered in Phase C so it is available for fallback immediately and for A/B testing in Phase D without additional integration work.

> **Why Veo 3 is registered but not primary:** Google Veo 3.x offers native vertical support, strong character consistency, and dual-tier pricing. It is a credible primary provider candidate. Register it in Phase C so provider switching in Phase D is a configuration change, not a new integration.

#### Narration Model Family Field

```ts
voice: {
  elevenLabsVoiceId: string
  modelFamily:       'eleven_multilingual_v2' | 'eleven_multilingual_v3'
  // ...other fields
}
```

Adding `modelFamily` as a configurable field means the Phase D ElevenLabs v3 upgrade is a settings change, not a code change.

### 4.5 ProductionDefaults System

Stored as a single Firestore document at `config/productionDefaults`. Fetched once at job creation and stored as a **frozen, versioned snapshot** on the RenderJob. Mid-job changes do not affect running jobs.

```ts
interface ProductionDefaults {
  version:   string    // CRITICAL: must increment on every change
  createdAt: string

  voice: {
    elevenLabsVoiceId: string
    modelFamily:       'eleven_multilingual_v2' | 'eleven_multilingual_v3'
    stability:         number     // 0.6
    similarityBoost:   number     // 0.8
    style:             number     // 0.2
    useSpeakerBoost:   boolean
    fallbackProvider:  'openai'
    fallbackVoiceId:   'onyx'
  }

  visual: {
    primaryProviderId:   string   // 'runway-gen4'
    fallbackProviderId:  string   // 'kling-2'
    styleAnchor:         string   // fixed prefix on every scene prompt
    referenceImageUrl:   string | null  // null in Phase C; set in Phase D
    motionStyle:         string   // 'slow dolly in' | 'subtle zoom' | 'static drift'
    negativeConstraints: string
    aspectRatio:         '9:16'
    resolution:          '1080x1920'
  }

  captions: {
    enabled:         boolean
    font:            'Inter-Bold'
    size:            52
    colour:          'white'
    highlightColour: 'yellow'
    position:        'bottom-third'
    style:           'word-by-word'
  }

  composition: {
    sceneDuration:      number    // default 4 seconds
    fadeTransition:     number    // default 0.3 seconds
    audioNormalisation: boolean
    outputFormat:       'mp4'
    codec:              'h264'
    audioBitrate:       '192k'
    videoBitrate:       '4000k'
  }

  regenerationBudget: {
    maxPerBrief: number           // default 3
  }

  mode:             'fast' | 'quality'
  dailySpendCapUsd: number        // default 20
}
```

#### The styleAnchor

The styleAnchor is the primary visual consistency mechanism. Every scene prompt begins with this string, unchanged. Write once, test across five to six generations, refine until output is consistent, then freeze. Treat it as a brand asset.

```
Cinematic vertical video, 9:16 aspect ratio, soft natural lighting, warm neutral tones,
realistic classroom or home-office setting, no text on screen, no stock photo aesthetic,
photorealistic, subtle depth of field, no animation, no cartoon, no AI glitch artifacts.
```

#### The referenceImageUrl Field

Many 2026 video generation models produce dramatically more consistent characters and locations when given a reference image. This field is null in Phase C by default. Phase D is when the founder selects a reference frame, stores it in Vercel Blob, and sets the URL. From that point, all scene generations include the reference. Character and location consistency improves substantially with this single addition.

#### Versioning Rule

Every change to any field in ProductionDefaults must increment `version` before saving.

```ts
// Wrong — impossible to explain why output quality changed
defaults.styleAnchor = "new style text"

// Correct
defaults.styleAnchor = "new style text"
defaults.version = "1.3.0"
defaults.createdAt = new Date().toISOString()
await saveDefaults(defaults)
```

#### fast vs quality Mode

| Setting | Visuals | Scenes | Approx. Cost | Approx. Time |
|---------|---------|--------|--------------|--------------|
| `fast` | Provider fast tier | 3 seconds each | ~€0.35/video | ~2 min |
| `quality` | Provider standard tier | 4 seconds each | ~€0.75/video | ~4 min |

### 4.6 Pre-Generation Triage Picker

Before clicking Generate, the founder sees a lightweight 6-option concern picker. This is a data collection mechanism, not a quality gate. It does not block or modify generation. The earlier structured feedback is collected, the faster the Phase D prompt improvement loop produces useful rules.

```
Before generating this video, help us learn faster.
What is your biggest concern with this brief? (select one — takes 5 seconds)

○  Voice might feel off
○  Visual mood might be wrong
○  Scene setting might not match
○  Pacing or timing concern
○  Trust or brand safety question
○  No concerns — looks good
```

```ts
type PreTriageConcern =
  | 'voice_concern'
  | 'visual_mood_concern'
  | 'scene_setting_concern'
  | 'pacing_concern'
  | 'trust_concern'
  | 'no_concern'

// Added to RenderJob:
preTriage: PreTriageConcern | null
```

In Phase D, the WeeklySignalDigest correlates preTriage against regenerationReason. If `visual_mood_concern` precedes `regenerated: wrong_mood` in more than 60% of cases, that pattern surfaces as an actionable finding.

### 4.7 Regeneration Budget Cap

Without a per-brief regeneration limit, a stubborn brief can consume €5–10 in API spend before the founder disengages.

```ts
// In RenderJob:
regenerationCount:          number    // increments on each new job with retryOf set
regenerationBudgetExhausted: boolean

// Enforced when regenerationCount >= maxPerBrief:
// Generate button replaced with:
//   - Edit Brief (opens brief editor, resets counter for new brief version)
//   - Discard (archives brief, returns to queue)
```

The founder sees a calm message: *"You've generated this brief 3 times. To continue, edit the brief or discard it."*

This prevents silent cost accumulation and forces a useful decision: either the brief needs structural improvement (Edit) or the opportunity is not viable (Discard). Both outcomes are more valuable than a fourth regeneration attempt.

### 4.8 Cost Awareness Architecture

Must be live in Phase C, not deferred.

```ts
interface CostEstimate {
  estimatedTotalUsd:    number
  narrationCostUsd:     number
  visualsCostUsd:       number    // provider.costPerSecond × durationSecs × sceneCount
  transcriptionCostUsd: number
  compositionCostUsd:   number    // ~0 for self-hosted ffmpeg
  providerId:           string
  mode:                 'fast' | 'quality'
  estimatedAt:          string
}

interface JobCostRecord {
  jobId:            string
  estimatedCostUsd: number
  actualCostUsd:    number
  narrationActual:  number
  visualsActual:    number
  transcriptActual: number
  providerId:       string
  completedAt:      string
}
```

Cost estimate is generated after the Prompt Compiler runs, before the job is created. Shown to founder as: *"Estimated cost: €0.75"*. If the estimate would exceed the daily spend cap, founder sees a warning and must explicitly override to proceed.

### 4.9 Idempotency & Duplicate Protection

```ts
interface IdempotencyKey {
  briefId: string
  hash:    string  // SHA-256 of: scriptText + voiceId + primaryProviderId + styleAnchor + mode
}

async function findOrCreateRenderJob(
  brief:    VideoBrief,
  defaults: ProductionDefaults
): Promise<string> {
  const key = buildIdempotencyKey(brief, defaults)
  const existing = await findActiveJobByKey(key)
  if (existing) return existing.jobId
  return createRenderJob(brief, defaults, key)
}
```

Keys invalidated when: previous job is `completed`, `failed_permanent`, or `discarded`; brief has been edited; founder explicitly clicks Regenerate.

### 4.10 Queue & Async Orchestration

Maximum 3 concurrent RenderJobs in Phase C. Use Inngest for queue management:

```ts
export const renderVideoJob = inngest.createFunction(
  {
    id:          'render-video',
    concurrency: { limit: 3 },
    retries:     2,
  },
  { event: 'video/render.requested' },
  async ({ event, step }) => {
    const { jobId } = event.data

    await step.run('narration',     () => runNarrationStep(jobId))
    await step.run('transcription', () => runTranscriptionStep(jobId))
    await step.run('visuals',       () => runVisualsStep(jobId))      // uses VisualProvider abstraction
    await step.run('quality-check', () => runQualityCheck(jobId))
    await step.run('composition',   () => runCompositionStep(jobId))
    await step.run('upload',        () => runUploadStep(jobId))

    await markJobCompleted(jobId)
  }
)
```

Each `step.run` is individually retried by Inngest on failure without re-running completed steps.

### 4.11 Generation Pipeline — Step by Step

```
VideoBrief (approved)
    │
    ▼
Pre-flight
    ├── Pre-generation triage picker shown to founder
    ├── Idempotency check
    ├── Cost estimate (using VisualProvider.costPerSecond)
    ├── Daily spend cap check
    └── RenderJob created (status: queued) + Inngest queue

    │
    ▼
Step 1: Prompt Compiler
    Input:  VideoBrief + ProductionDefaults snapshot
    Output: NarrationSpec + ScenePrompts[0..2] + ScenePlan
    Time:   < 1 second — deterministic, no API call

    │
    ▼
Step 2: Narration Generation (ElevenLabs → OpenAI TTS fallback)
    Input:  NarrationSpec (uses defaults.voice.modelFamily)
    Output: narration.mp3 → Vercel Blob
    Time:   3–8 seconds

    │
    ▼
Step 3: Caption Generation (AssemblyAI → Whisper fallback)
    Input:  narration.mp3 URL
    Output: captions.srt with word-level timestamps → Vercel Blob
    Time:   5–12 seconds

    │
    ▼
Step 4: Scene Visual Generation (VisualProvider — parallel)
    Provider: defaults.visual.primaryProviderId
    Fallback: defaults.visual.fallbackProviderId
    Input:  ScenePrompts[0..2], referenceImageUrl if set
    Output: scene_0.mp4, scene_1.mp4, scene_2.mp4 → Vercel Blob
    Time:   30–90 seconds (all three run concurrently)

    │
    ▼
Step 5: Quality Guard (sanity checks only — not AI judgment)
    Checks: audio present, duration ±20% of expected, scene count correct, file intact
    On failure: retry; after max retries → failed_permanent

    │
    ▼
Step 6: Composition (ffmpeg)
    Input:  scene_0–2.mp4 + narration.mp3 + captions.srt
    Operations:
      - Concatenate scenes with fade transitions
      - Mix narration audio
      - Burn karaoke-style captions (current word highlighted)
      - Apply text overlays from brief.textOverlayIdeas[]
      - Normalise to 9:16 @ 1080x1920
    Output: final_draft.mp4 → Vercel Blob
    Time:   10–20 seconds

    │
    ▼
Step 7: Asset Storage + Cost Recording
    Write RenderedAsset to Firestore
    Write JobCostRecord to Firestore
    Generate thumbnail (heuristic frame selection — no vision API)
    Update RenderJob.status = 'completed'

    │
    ▼
Step 8: Notify Founder
    UI polling detects 'completed'
    Review view unlocks; regeneration count and budget shown

Total: 2–4 min (quality mode), 1–2 min (fast mode)
Founder active time during generation: 0 minutes
```

### 4.12 Prompt Compiler — Exact Implementation

#### Narration Script

```ts
function buildNarrationScript(brief: VideoBrief, defaults: ProductionDefaults): NarrationSpec {
  // Direct field concatenation — no AI rewriting.
  // The founder approved this language. It must not be touched.
  const scriptText = [
    brief.primaryHook,
    brief.scriptBeat1,
    brief.scriptBeat2,
    brief.scriptBeat3,
    brief.softClose
  ]
  .filter(Boolean)
  .map(line => line.trim())
  .join(' ')

  return {
    voiceId:   defaults.voice.elevenLabsVoiceId,
    modelId:   defaults.voice.modelFamily,
    voiceSettings: {
      stability:         defaults.voice.stability,
      similarity_boost:  defaults.voice.similarityBoost,
      style:             defaults.voice.style,
      use_speaker_boost: defaults.voice.useSpeakerBoost
    },
    scriptText
  }
}
```

#### Scene Prompts

```ts
type SceneIntent = 'problem_recognition' | 'solution_awareness' | 'reassurance'

const intentMoodMap: Record<SceneIntent, string> = {
  problem_recognition: 'quiet concern, relatable stress, authentic',
  solution_awareness:  'calm clarity, gentle relief, professional',
  reassurance:         'warm confidence, grounded, trustworthy'
}

function buildScenePrompt(
  intent:     SceneIntent,
  brief:      VideoBrief,
  defaults:   ProductionDefaults,
  sceneIndex: number
): string {
  return [
    defaults.visual.styleAnchor,                                      // ALWAYS FIRST — never move or omit
    brief.visualDirection ?? 'a calm professional school environment',
    brief.brollIdeas?.[sceneIndex] ?? 'teacher at a desk reviewing documents',
    `Gentle camera motion. ${defaults.visual.motionStyle}.`,
    `Mood: ${intentMoodMap[intent]}.`,
    defaults.visual.negativeConstraints                               // ALWAYS LAST
  ].join(' ')
}
```

#### ScenePlan with Continuity Hints

```ts
interface ScenePlan {
  scenes: Array<{
    index:          number
    intent:         SceneIntent
    prompt:         string
    continuityHint: string  // e.g. "same room as scene 0, different angle"
  }>
}
```

Continuity hints are passed as additional context for scenes 1 and 2 when the provider supports it. This prevents the "three random clips" problem for trivial implementation cost.

### 4.13 RenderJob Lifecycle

#### State Machine

```
queued
→ narration_generating    → narration_done
→ transcription_generating → transcription_done
→ visuals_generating      → visuals_done
→ quality_checking
→ compositing
→ uploading
→ completed

(any state) → failed
(failed)    → retry_queued  → [restarts from failed step only]
(failed ×3) → failed_permanent
```

#### Full Schema

```ts
interface RenderJob {
  jobId:                       string
  briefId:                     string
  opportunityId:               string
  status:                      RenderJobStatus
  createdAt:                   string
  updatedAt:                   string
  retryOf:                     string | null
  retryCount:                  number
  regenerationCount:           number
  regenerationBudgetExhausted: boolean
  lastError:                   string | null
  defaultsSnapshot:            ProductionDefaults
  idempotencyKey:              string
  preTriage:                   PreTriageConcern | null
  costEstimate:                CostEstimate
  providerLog:                 ProviderCallRecord[]

  steps: {
    narration:     StepRecord
    transcription: StepRecord
    visuals:       StepRecord[]
    qualityCheck:  StepRecord
    composition:   StepRecord
    upload:        StepRecord
  }

  artifacts: {
    narrationUrl:  string | null
    captionsSrt:   string | null
    sceneUrls:     string[]
    finalVideoUrl: string | null
    thumbnailUrl:  string | null
  }
}

interface StepRecord {
  status:        'pending' | 'running' | 'done' | 'failed'
  startedAt:     string | null
  completedAt:   string | null
  durationMs:    number | null
  error:         string | null
  providerJobId: string | null
}
```

### 4.14 Retry Logic

```ts
async function executeWithRetry<T>(
  step:         () => Promise<T>,
  maxRetries  = 2,
  baseDelayMs = 3000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await step()
    } catch (error) {
      if (attempt === maxRetries) throw error
      await sleep(baseDelayMs * Math.pow(2, attempt))  // 3s, 6s, 12s
    }
  }
  throw new Error('unreachable')
}
```

### 4.15 Automated Quality Guard

Sanity validation only. Not AI quality judgment.

```ts
interface QualityCheckResult {
  passed:           boolean
  hasAudio:         boolean
  durationSeconds:  number
  expectedDuration: number
  durationInRange:  boolean    // ±20% of expected
  captionsPresent:  boolean
  sceneCount:       number
  failures:         string[]
}
```

If `passed === false`, the job retries. After max retries: `failed_permanent` with failure reasons displayed. The founder never reviews obviously broken output.

### 4.16 Thumbnail Generation

Phase C: heuristic frame selection using ffmpeg scene detection. Extract frames at 0.5s, 2s, 4s, 6s. Select the frame with the highest face prominence score. No vision API required.

Phase D adds: manual frame override; optional overlay text; re-thumbnailing without re-rendering.

### 4.17 API Routes

| Route | Behaviour |
|-------|-----------|
| `POST /api/render/generate-video` | Pre-triage → idempotency check → cost estimate → daily cap check → create RenderJob (queued) → Inngest → return `{ jobId, estimatedCostUsd, regenerationCount, budgetRemaining }` |
| `POST /api/render/regenerate-video` | Increment `regenerationCount` → check budget cap → create new RenderJob with `retryOf` → return new `jobId` or `{ budgetExhausted: true }` |
| `GET /api/render/render-status?jobId=x` | Return status, step states, artifact URLs, actual cost when complete, regeneration budget status |

### 4.18 Founder UX — Exact Flow

Total active founder time per video: **under 3 minutes**. Wall-clock time: 3–6 minutes.

| Screen | Sees | Actions | Time |
|--------|------|---------|------|
| VideoBrief view | Hook, beats, soft close, trust guardrails, estimated cost, historical angle performance hint | Pre-triage picker, edit fields, Approve & Generate | 60–90 sec |
| Generation status | Step progress; estimated cost; regeneration budget remaining; can close tab | Nothing | 0 sec |
| Asset review | Video player, brief summary, trust guardrail checklist, actual cost, regeneration count | Approve / Regenerate (reason required) / Edit Brief / Discard | 30–60 sec |
| Budget exhausted | "You've generated this brief 3 times." | Edit Brief / Discard | 15 sec |

### 4.19 Implementation Sequence (Strict Order)

| Slice | Deliverable | Verification |
|-------|-------------|--------------|
| 1 — VisualProvider + Lifecycle | `VisualProvider` interface; Runway + Kling implementations; staged RenderJob statuses; Inngest queue; mock providers retained | Job progresses through all states; two providers registered |
| 2 — Idempotency + Cost + Budget | Idempotency check; CostEstimate; regeneration budget enforcement; daily cap | Double-click → same jobId; cost shown; fourth regeneration blocked |
| 3 — Artifact persistence | Vercel Blob integration; intermediate artifacts stored | All intermediate files present in Blob |
| 4 — Retry system | `executeWithRetry`; per-step retry; failure states | Force-fail step; verify retry; verify `failed_permanent` |
| 5 — Provider integration | ElevenLabs, Runway, AssemblyAI; Kling fallback | Real narration, real video scenes, real captions |
| 6 — Composition | ffmpeg pipeline | Play final video; verify audio sync; verify captions |
| 7 — Quality guard + thumbnail | `runQualityCheck`; frame-heuristic thumbnail | Force silent video → caught; thumbnail present on completion |
| 8 — Review UI + pre-triage | Asset review; pre-triage picker; budget display | Full end-to-end flow from brief approval to asset review |

### 4.20 Phase C Definition of Done

- Founder approves brief and clicks Generate
- RenderJob progresses through all lifecycle stages; no synchronous completion path remains
- Real video appears in review UI within 5 minutes (quality mode)
- Cost estimate shown before generation; actual cost recorded after
- Pre-generation triage picker shown; response stored on RenderJob
- Approve, Regenerate (reason required), Edit Brief, and Discard all function correctly
- Regeneration budget cap enforced; clear message when budget exhausted
- Idempotency prevents duplicate jobs
- Quality guard catches broken outputs before founder review
- All intermediate artifacts persisted to Vercel Blob
- Retries operate at step level with exponential backoff
- VisualProvider abstraction in place; Runway primary and Kling fallback registered
- No mock providers remain in the production code path

---

## 5. Phase D — Feedback, Trust Hardening & Production Readiness

> **D learns.**
> The system improves without founder reconfiguration.

### 5.1 Purpose

Phase D converts the generator into a learning system. Without this, Phase C hits a quality ceiling requiring increasing founder intervention. Phase D breaks that ceiling by routing outcome data back into the generation pipeline, elevating TrustEvaluator to a first-class service, adding A/B defaults comparison, and making the system observable without developer involvement.

**The single metric that defines Phase D success: regeneration rate drops below 30% within 60 days of Phase C launch.**

### 5.2 Feedback Loop Architecture

#### PerformanceSignal

```ts
interface PerformanceSignal {
  signalId:           string
  type:               'video_result'
  outcome:            'approved' | 'rejected' | 'regenerated' | 'edited_then_approved'
  opportunityId:      string
  briefId:            string
  jobId:              string
  angleId:            string
  defaultsVersion:    string          // enables version-aware analysis
  primaryProviderId:  string
  contentType:        ContentType
  platform:           Platform | null
  preTriage:          PreTriageConcern | null
  regenerationReason: RegenerationReason | null
  promptFeedback:     PromptFeedback[] | null
  costUsd:            number
  capturedAt:         string
}

interface PromptFeedback {
  sceneIndex: number
  issue:      'wrong_setting' | 'wrong_mood' | 'wrong_subject' | 'too_abstract'
  note:       string | null
}
```

#### Signal Capture Points

| Action | Outcome | Additional Input |
|--------|---------|-----------------|
| Approve | `approved` | None |
| Regenerate | `regenerated` | RegenerationReason (required) |
| Edit brief & regenerate | `edited_then_approved` after second generation | None |
| Discard | `rejected` | None |

#### WeeklySignalDigest

```ts
interface WeeklySignalDigest {
  period:                string
  totalGenerated:        number
  approvalRate:          number       // target: > 70%
  regenerationRate:      number       // target: < 30%
  avgCostPerApproved:    number
  topAngles:             AngleSummary[]
  flaggedPainPoints:     string[]
  promptIssuePatterns:   string[]
  preTriageCorrelations: string[]     // pre-triage → regeneration reason patterns above 60%
  defaultsVersionImpact: VersionImpactSummary[]
  providerComparison:    ProviderComparisonSummary[]   // populated when A/B mode active
}
```

**Implementation note:** this exists in the repo today as a deterministic stored summary built from run observability, provider benchmark rollups, and review outcomes. The concrete schema is slightly richer than this sketch and includes defaults-version comparison and top trust-warning summaries.

### 5.3 A/B Defaults Comparison Mode

Phase D adds a lightweight A/B test mode for comparing two ProductionDefaults configurations or two visual providers. This is the correct mechanism for validating provider switches. Never switch primary provider based on intuition or a single video.

```ts
interface ABTestConfig {
  enabled:    boolean
  variantAId: string    // ProductionDefaults version or providerId
  variantBId: string
  sampleSize: number    // videos per variant before comparison; minimum 20
  metric:     'approval_rate' | 'cost_per_approved'
  status:     'running' | 'complete'
  result:     ABTestResult | null
}

interface ABTestResult {
  winner:           'a' | 'b' | 'inconclusive'
  aApprovalRate:    number
  bApprovalRate:    number
  aCostPerApproved: number
  bCostPerApproved: number
  recommendation:   string   // plain language
}
```

When A/B mode is active, each new RenderJob alternates between variants. Results surface in WeeklySignalDigest and the ProductionDefaults management UI.

**Implementation note:** `ABTestConfig`, `ABTestResult`, deterministic assignment, render-job tagging, and downstream benchmark attribution are implemented. The current system is strongest at explicit tagging and comparison; not every variant dimension is yet used to actively override runtime choice.

### 5.4 TrustEvaluator as Reusable Service

Phase B: TrustEvaluator as inline call. Phase D: standalone service.

```ts
class TrustEvaluatorService {
  async evaluate(input: TrustEvaluationInput): Promise<TrustEvaluationResult>
  async evaluateBatch(inputs: TrustEvaluationInput[]): Promise<TrustEvaluationResult[]>
  async getViolationHistory(opportunityId: string): Promise<TrustViolation[]>
}
```

**Implementation note:** the current repo implements this as a reusable local module rather than a separate network service. Angle, hook, opportunity, compiled-plan, and final assembled-script trust evaluation are all routed through shared trust functions in `lib/trust-evaluator.ts`.

#### Final-Script Trust Pass

Phase D adds trust evaluation of the complete assembled NarrationSpec script. This catches cumulative tone drift — a softClose that sounds fine in isolation can sound pushier when appended to scriptBeat3.

```ts
// Added to Prompt Compiler, after script assembly, before job creation:
const finalScriptResult = await trustEvaluator.evaluate({
  text:     narrationSpec.scriptText,
  context:  'script',
  audience: 'teacher'
})

if (!finalScriptResult.passed) {
  // Surface as blocking amber warning in brief review
  // Do not auto-regenerate at script level — founder must see this and edit the brief
  brief.finalScriptTrustScore = finalScriptResult.score
  brief.reviewStatus = 'needs-edit'
}
```

Enforcement at script level surfaces to the founder rather than auto-regenerating, because the correction needed is brief editing, not prompt regeneration.

**Implementation note:** the final assembled-script trust pass is now live and persisted on `VideoBrief.finalScriptTrustScore`, the compiled production plan, run ledger entries, review summaries, and export/package surfaces.

### 5.5 Prompt Improvement Loop

PromptFeedback and pre-triage correlations from Phase C accumulate in Firestore. Phase D adds rule-based Prompt Compiler overrides keyed by `painPointCategory`:

```ts
interface PromptOverride {
  painPointCategory:  string    // e.g. 'parent-complaint-emails'
  sceneIndex:         number
  overrides: {
    defaultBroll?:    string
    moodOverride?:    string
    extraContext?:    string
  }
  createdFromJobIds:  string[]
  approvedAt:         string
}
```

Overrides are proposed by the system based on aggregated PromptFeedback patterns, then approved by the founder. Not auto-applied. This keeps the feedback loop under intentional control.

**Implementation note:** the current implementation uses deterministic stored override rules keyed by pain-point category, trust/risk context, review reasons, quality failures, and performance signals. These rules are applied during prompt compilation without introducing LLM-generated rule creation.

### 5.6 Opportunity Deduplication

```ts
interface DeduplicationResult {
  isDuplicate: boolean
  matchedId:   string | null
  confidence:  number
  action:      'merge' | 'supersede' | 'archive' | 'create_new'
}
// merge:      add new signals to existing opportunity
// supersede:  new replaces old; old archived with forward link
// archive:    near-duplicate below confidence threshold; not surfaced
// create_new: genuinely new opportunity
```

Deduplication runs at opportunity creation time, not post-hoc.

### 5.7 Thumbnail Enhancement

Phase C: heuristic first-frame or motion-peak selection.

Phase D adds:
- Manual frame override — founder scrubs timeline in review UI and clicks Set Thumbnail
- Optional overlay text (off by default; enabled per-brief)
- `ThumbnailSpec` stored separately from RenderedAsset to allow re-thumbnailing without re-rendering

**Implementation note:** manual override/reset and standalone `ThumbnailSpec` persistence are now implemented. Overlay-text authoring remains narrower than the full target described here.

### 5.8 Music Layer

```ts
interface MusicSpec {
  trackId:         string    // from curated library of 8–12 royalty-free loops in Vercel Blob
  volumeLevel:     number    // default 0.12 — very low under narration
  fadeInDuration:  number    // default 0.5s
  fadeOutDuration: number    // default 1.0s
  mood:            'calm' | 'warm' | 'focused'
}
```

```bash
ffmpeg -i video_with_narration.mp4 -stream_loop -1 -i music_loop.mp3 \
  -filter_complex "[1:a]volume=0.12,afade=t=in:d=0.5,afade=t=out:st=28:d=1[music];
                   [0:a][music]amix=inputs=2:duration=first[aout]" \
  -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k output_with_music.mp4
```

Track selection defaults to `warm`. If the opportunity `trustRisk` is `high`, use `calm`. Tracks are stored in Vercel Blob, not fetched per-job.

### 5.9 Reference Image for Visual Consistency

`referenceImageUrl` was added to ProductionDefaults in Phase C as a null field. Phase D is when it becomes meaningful.

The founder selects a representative reference image (a "Zaza teacher" character or classroom environment), stores it in Vercel Blob, and sets the URL in ProductionDefaults. All subsequent scene generations include this reference frame. Character and location consistency across videos improves substantially.

**Implementation note:** the current implementation already persists `referenceImageUrl` in ProductionDefaults and threads it through visual provider prompt assembly. The founder-facing flow is currently a URL field rather than a richer asset-picker workflow.

### 5.10 ElevenLabs v3 Upgrade

Phase D is when the `modelFamily` field becomes actionable.

Process:
1. Run A/B test: variant A uses `eleven_multilingual_v2`, variant B uses `eleven_multilingual_v3`
2. Compare approval rate and regeneration reason breakdown (specifically narration-related reasons)
3. If variant B wins → update `modelFamily` in ProductionDefaults, increment version
4. No code change required

**Implementation note:** `modelFamily` is now persisted in ProductionDefaults and used by the narration provider layer as runtime model-selection metadata. The broader v2→v3 rollout decision remains a configuration and experimentation problem, not a schema gap.

### 5.11 ProductionDefaults Management UI

`/production-defaults` — founder-accessible without developer involvement. Every save increments `version` automatically. Change history shows recent versions, and the current implementation is intentionally compact rather than exposing the full future control surface sketched below.

| Section | Editable |
|---------|----------|
| Voice | Voice ID selector with preview; model family selector; sliders |
| Visual providers | Primary provider selector; fallback provider selector; reference image upload |
| Style anchor | Text editor; version shown |
| Captions | Font, size, colour, position, style |
| Composition | Scene duration; fade transition; mode toggle |
| Music | Enable/disable; mood selector; volume slider |
| Regeneration budget | Max per brief |
| Daily spend cap | USD input |

### 5.12 CDN & Asset Delivery

- `Cache-Control: public, max-age=31536000, immutable` on final video assets
- `Cache-Control: no-store` on `/render-status` polling route
- Intermediate artifacts private in Blob until composition is complete
- Final asset URL pattern: `https://[blob]/assets/[opportunityId]/[jobId]/final.mp4` — Connect can consume without Signal Engine authentication

**Implementation note:** the repo already carries Blob-backed artifact persistence, retention metadata, cleanup-ready selectors, and typed delivery assets that classify outputs as internal-only vs CDN-ready. This is delivery hardening in practice, though not yet a fully separate CDN control plane.

### 5.13 Publish-Ready Package Generation

```ts
interface PublishPackage {
  packageId:    string
  assetId:      string
  videoUrl:     string
  thumbnailUrl: string
  captionsSrt:  string
  captionsTxt:  string
  scriptText:   string
  hashtags:     string[]
  altText:      string
  platforms:    PlatformPackage[]
  createdAt:    string
}
```

**Implementation note:** publish/package export is already implemented via `ProductionPackage`, `connectSummary`, typed delivery bundles, and Phase E handoff packaging. The concrete schema is richer than this original sketch and includes provider/defaults/review metadata for downstream consumers.

### 5.14 Observability & Run Logs

`/factory/runs` — founder-accessible:

- All RenderJobs from the past 30 days; status, duration, step breakdown, artifact links
- Provider call log per job
- Aggregate stats: approval rate, regeneration rate by reason, cost per approved video
- Defaults version comparison table
- A/B test results when active

**Implementation note:** `/factory/runs`, factory health routes, benchmark endpoints, and weekly digest generation are all implemented. The current observability layer is compact and operator-facing rather than a full analytics dashboard.

### 5.15 Phase D Success Criteria

- Regeneration rate below 30% within 60 days of Phase C launch
- PerformanceSignals captured for every terminal action — zero missing records
- TrustEvaluator service blocks at least one violation per 10 opportunities without founder intervention
- Final-script trust pass runs on every approved brief
- Founder updates ProductionDefaults without developer involvement
- At least one A/B test completed and a winner implemented
- Prompt override rules exist for at least 3 recurring pain point categories
- Background music present in all generated videos
- Reference image set and measurably improving visual consistency
- Cost-per-approved-video trend visible and decreasing

---

## 6. Phase E — Batch Production, Connect Handoff & Scaled Distribution

> **E scales and delivers.**
> The system operates at throughput without the founder as a production bottleneck.

### 6.1 Gate Condition

Phase E must not begin until Phase D feedback loops are operational and the regeneration rate is below 30%. Scaling a system with a 40–50% regeneration rate amplifies cost and burden, not throughput.

### 6.2 Batch Generation

**Implementation note:** `BatchRenderJob` persistence, summary building, approval assessment, and parent linkage onto render jobs are implemented. Fully autonomous batch execution remains intentionally narrow.

```ts
interface BatchRenderJob {
  batchId:                string
  briefIds:               string[]
  jobIds:                 string[]
  status:                 BatchStatus
  priority:               'score-desc' | 'fifo'
  throttle:               number        // default 3
  createdAt:              string
  completedAt:            string | null
  totalEstimatedCostUsd:  number        // shown before batch is approved
  summary: {
    total:        number
    completed:    number
    failed:       number
    approved:     number
    totalCostUsd: number
  }
}
```

Phase E constraints:
- Maximum 10 briefs per batch initially
- Maximum 3 concurrent RenderJobs
- Failed jobs do not block the batch
- Batch approval always requires founder action
- Total estimated batch cost confirmed before batch starts

### 6.3 Auto-Approve High-Confidence Opportunities (with Safety Rails)

**Implementation note:** `AutoApproveConfig` and bounded auto-approval are now implemented. The mandatory-review safety rail remains enforced; the current workflow is governed rather than unconstrained.

```ts
interface AutoApproveConfig {
  enabled:               boolean    // false by default
  confidenceThreshold:   number     // 85
  requiresTrustPass:     boolean    // true — TrustEvaluator must pass
  maxPerDay:             number     // 5
  mandatoryReviewEveryN: number     // 5 — every 5th auto-approved brief held for founder review
}
```

The `mandatoryReviewEveryN` safety rail is non-negotiable. Even at confidence above 95, every fifth auto-approved brief is held for review. This catches silent drift in the scoring model before it affects a large batch. Without this rail, auto-approve is a trust liability.

### 6.4 Content Mix Engine

Prevents output from becoming repetitive. Soft blocking — not just a warning.

**Implementation note:** the repo implements a broader `ContentMixTarget` than this original content-type-only sketch. Targets, observed mix summaries, and gap indicators now cover format, audience, effect, CTA, and platform as well as content type.

```ts
interface ContentMixTarget {
  pain:       number    // 0.40
  validation: number    // 0.25
  solution:   number    // 0.25
  story:      number    // 0.10
}
```

When a batch deviates more than 30% from the target mix, batch approval shows a prominent warning requiring a one-click override to proceed. Soft block, not hard block. Friction is intentional — repetition kills social accounts faster than mediocre quality.

### 6.5 Connect Asset Handoff

Connect never accesses Signal Engine internals. Only the typed handoff package.

**Implementation note:** `ConnectHandoffPackage`, stored Connect performance signals, and an inbound Connect performance route are all implemented. The remaining work is operational hardening and deeper product workflow, not core contract coverage.

```ts
interface ConnectHandoffPackage {
  packageId:             string
  opportunityId:         string
  opportunityTitle:      string
  primaryPainPoint:      string
  angle:                 string
  contentType:           ContentType
  videoUrl:              string
  thumbnailUrl:          string
  publishPackages:       PlatformPackage[]
  suggestedCampaignType: 'influencer' | 'paid' | 'organic' | 'email'
  audienceProfile:       string
  trustGuardrails:       string[]
  productDestination:    string
  readyAt:               string
}
```

Connect performance signals flow back to Signal Engine, closing the distribution feedback loop:

```ts
interface ConnectPerformanceSignal extends PerformanceSignal {
  source:         'connect'
  campaignType:   string
  connectOutcome: 'influencer_accepted' | 'influencer_declined' | 'campaign_launched' | 'underperformed'
  connectNotes:   string | null
}
```

### 6.6 Creator & Influencer Handoff Packages

**Implementation note:** `CreatorBrief` is implemented and persisted today as part of the Phase E orchestration layer.

```ts
interface CreatorBrief {
  briefId:           string
  campaignName:      string
  painPointSummary:  string
  angle:             string
  suggestedHooks:    string[]
  scriptReference:   string      // reference only — not verbatim read
  doNotUse:          string[]
  brandVoiceNotes:   string
  referenceVideoUrl: string | null
  productLink:       string
  callToAction:      string
  deliverables:      string[]
  deadline:          string | null
}
```

### 6.7 Channel-Specific Packaging

| Platform | Adjustments |
|----------|-------------|
| TikTok | Captions burned in; hook within first 2 seconds; CTA at 80% mark; max 60s |
| Instagram Reels | Cover frame selected; caption truncated to 2,200 chars; hashtags appended |
| YouTube Shorts | Title card added; end screen placeholder; description with chapters |
| LinkedIn | Optional 1:1 or 4:5 aspect ratio; professional caption tone; reduced hashtag density |

**Implementation note:** the repo already stores platform package metadata, delivery assets, and packaging notes per channel. Full per-platform render transforms are still thinner than the complete target above.

### 6.8 Content Series & Asset Families

**Implementation note:** `ContentSeries` now exists as a persisted Phase E object and is synced from production-package export workflows.

```ts
interface ContentSeries {
  seriesId:  string
  name:      string
  angle:     string
  assetIds:  string[]
  platforms: Platform[]
  status:    'building' | 'ready' | 'in-distribution'
  createdAt: string
}
```

### 6.9 Phase E Success Criteria

- 10+ videos queued and exported per week without founder as production bottleneck
- Connect consumes handoff packages without accessing Signal Engine internals
- CreatorBrief packages produced from approved assets without additional founder input
- At least two content series assembled and distributed
- Channel-specific packaging working for at least three platforms
- Connect performance signals flowing back into opportunity scoring
- Content mix engine preventing output homogeneity
- Auto-approve running with mandatory review safety rail in place

---

## 7. Cross-Phase Data Model

| Object | Introduced | Evolves In |
|--------|------------|------------|
| `ContentOpportunity` | B | C populates `historicalCostAvg` / `historicalApprovalRate`; D adds deduplication and PerformanceSignal linkage |
| `MessageAngle` | B | D adds TrustEvaluator score history and PromptFeedback linkage |
| `HookSet` | B | D adds per-hook TrustEvaluator enforcement |
| `VideoBrief` | B | C adds generation trigger; D adds `finalScriptTrustScore` and approval audit trail |
| `VisualProvider` interface | C | D adds A/B comparison; E adds batch routing |
| `ProductionDefaults` | C | D adds versioning UI, reference image, music, prompt overrides, narration model family |
| `NarrationSpec` | C | D gains `modelFamily` field |
| `ScenePlan` | C | D gains continuity learning from PromptFeedback |
| `ScenePrompt` | C | D gains override rules per pain point category |
| `RenderJob` | C | D adds A/B variant tag; E adds BatchRenderJob parent link |
| `StepRecord` | C | Stable |
| `QueueJob` | C | E adds batch priority and throttle config |
| `CostEstimate` | C | D gains cost-per-approved-video trend analysis |
| `JobCostRecord` | C | D feeds WeeklySignalDigest and providerComparison |
| `IdempotencyKey` | C | Stable |
| `QualityCheckResult` | C | D gains baseline comparison across defaults versions |
| `PreTriageConcern` | C | D adds correlation analysis against regeneration reasons |
| `RenderedAsset` | C | D adds PublishPackage child; E adds ContentSeries membership |
| `PerformanceSignal` | D | E gains Connect outcome extension |
| `TrustEvaluationResult` | B (inline) | D promotes to standalone service with final-script pass |
| `ABTestConfig` / `ABTestResult` | D | E gains provider comparison extension |
| `WeeklySignalDigest` | D | E gains Connect outcome data |
| `PublishPackage` | D | E adds channel-specific packaging |
| `ThumbnailSpec` | C (basic) | D adds manual override and overlay text |
| `MusicSpec` | D | Stable |
| `PromptOverride` | D | E gains auto-generated rule proposals from aggregated feedback |
| `ConnectHandoffPackage` | E | Stable |
| `ConnectPerformanceSignal` | E | Stable |
| `BatchRenderJob` | E | Stable |
| `CreatorBrief` | E | Stable |
| `ContentSeries` | E | Stable |
| `ContentMixTarget` | E | Stable |
| `AutoApproveConfig` | E | Stable |

---

## 8. Provider Strategy & Multi-Provider Abstraction

### 8.1 Design Rule

The `VisualProvider` interface defined in Section 4.4 must be implemented before any provider-specific code is written. All provider logic lives in a registered implementation. The pipeline calls the interface; it never calls a provider directly.

### 8.2 Current Provider Landscape (Q1 2026)

| Provider | Status | Notes |
|----------|--------|-------|
| Runway Gen-4 | Default primary | Solid API; good style control; reliable async; best developer experience currently |
| Kling 2.x | Default fallback | Faster; strong photorealistic humans; trending social styles; accessible via aggregators |
| Google Veo 3.x | Register now; evaluate in Phase D | Strong vertical support; good character consistency; dual-tier pricing; API stability improving |
| ElevenLabs v2 | Default narration | Reliable; well-tested; fixed voice ID |
| ElevenLabs v3 | Phase D upgrade path | Expressive tags; better multilingual; fewer pronunciation errors |
| AssemblyAI | Default captions | Word-level timestamps; SRT; accurate on synthesised speech |
| OpenAI Whisper | Caption fallback | Slightly lower timestamp precision; acceptable |
| OpenAI TTS (`onyx`) | Narration fallback | Lower consistency than ElevenLabs; log all uses |
| ffmpeg | Composition | Self-hosted; deterministic; no per-call cost |

### 8.3 Aggregator API Evaluation

Services like WaveSpeedAI proxy multiple visual generation models (Kling, Wan, Veo, Runway, open-source variants) behind a single API. Because the `VisualProvider` interface abstracts all provider calls, adding an aggregator is a single new implementation file — register a `VisualProvider` that calls the aggregator's API.

Evaluate at least one aggregator in Phase D. Benefits: single integration point for experimentation; automatic fallback across multiple underlying models; simpler cost comparison.

### 8.4 Provider Selection Principle

Never switch primary provider based on intuition or a single video comparison. The process is:

1. Register candidate provider in the `VisualProvider` registry
2. Run A/B test in Phase D with at least 20 videos per variant
3. Compare approval rate, regeneration rate, cost per approved video
4. Switch primary only if the challenger wins; update ProductionDefaults version

### 8.5 Provider Evaluation Schedule

| Phase | Activity |
|-------|----------|
| C | Runway primary; Kling registered as fallback; Veo registered but inactive; ElevenLabs v2 |
| D | A/B test Runway vs Kling; evaluate Veo 3 API stability; test ElevenLabs v3 via A/B; evaluate one aggregator |
| E | Primary provider confirmed by A/B data; fallback chain optimised; aggregator integrated if Phase D evaluation passed |

---

## 9. Cost Awareness Architecture

### 9.1 Approximate Per-Video Costs (Q1 2026)

Validate against live provider pricing at implementation time.

| Step | Provider | Fast Mode | Quality Mode |
|------|----------|-----------|--------------|
| Narration (30–60s) | ElevenLabs v2 | $0.10–0.18 | $0.12–0.24 |
| 3 × scene generation | Runway Gen-4 | $0.18–0.30 | $0.30–0.50 |
| Captions | AssemblyAI | $0.02–0.04 | $0.02–0.04 |
| Composition | ffmpeg | ~$0.00 | ~$0.00 |
| **Total per video** | | **~$0.30–0.52** | **~$0.44–0.78** |

Kling as visual provider is approximately 20–30% cheaper than Runway at comparable quality. This cost difference becomes material at Phase E volumes.

### 9.2 Cost Control Rules

- Cost estimate generated and shown before every job starts
- Daily spend cap configurable in ProductionDefaults (default: $20/day)
- If a job would exceed the daily cap, founder is warned and must explicitly override
- Regeneration budget cap enforced per brief (default: 3)
- Batch jobs surface total estimated cost before batch approval
- Weekly cost summary in Phase D observability view

### 9.3 Cost Intelligence (Phase D)

The most valuable insight is **cost per approved video by angle and pain point category**. The system will eventually surface: *"Pain points in 'parent complaint' cost €0.45/approved with 78% approval rate; 'assessment anxiety' costs €0.72 with 41% approval rate."*

This is only possible if `JobCostRecord` and `PerformanceSignal` are both collected from Phase C. Do not defer cost recording.

---

## 10. Queue & Async Orchestration

### 10.1 Queue Engine: Inngest

Correct choice for Phase C and D on Next.js / Vercel. See Section 4.10 for implementation.

**Implementation note:** the current repo uses a local queue runner plus an Inngest-compatible dispatch payload and webhook contract. Native Inngest orchestration remains one of the few material infrastructure gaps between implementation and this spec target.

Migration path if needed:
- **BullMQ** — if Redis is added and Inngest rate limits become a constraint
- **Temporal** — if Phase E batch orchestration complexity outgrows Inngest workflows

### 10.2 Concurrency Limits by Phase

| Phase | Max Concurrent Jobs | Rationale |
|-------|---------------------|-----------|
| C | 3 | Provider rate limits; controlled cost; predictable timing |
| D | 3 | Unchanged — quality over throughput until regeneration rate is below 30% |
| E | Configurable (3–10) | Informed by Phase D provider data; raise only when rate limits confirmed safe |

---

## 11. Non-Goals & Deferral Register

| Deferred Item | Rationale |
|---------------|-----------|
| Auto-posting to social platforms | Requires platform API relationships, rate limit handling, and compliance review |
| Scheduling and content calendar | Operational complexity before distribution strategy is validated |
| ML-based prompt optimisation | Rule-based improvement in Phase D is sufficient; ML requires data volume not yet available |
| BI warehouse / analytics stack | WeeklySignalDigest is sufficient at current scale |
| Fully automated distribution loops | Human approval must remain in the loop until brand trust is proven at scale |
| Video A/B testing at platform level | Requires platform integration and statistical rigor beyond current scope |
| Multi-language video generation | Single language first; localisation is a separate product decision |
| Paid advertising integration | Connect handles campaign strategy; ad platform integration is a Connect concern |
| Avatar-style video (D-ID, HeyGen) | Incompatible with Zaza brand tone |
| Open-source model self-hosting (Wan 2.x, Seedance) | Correct at Phase E scale; infrastructure overhead unjustified before then |
| Multi-preset style library | `mode` field provides two-tier alternative; multi-preset adds complexity before single preset is proven |

---

## 12. Glossary

| Term | Definition |
|------|------------|
| `VisualProvider` | A typed interface abstracting all visual generation providers. All provider-specific logic lives in a registered implementation, never in the pipeline. |
| `ContentOpportunity` | A structured, founder-reviewable decision object representing a commercially relevant content opportunity derived from market signals. |
| `MessageAngle` | A specific framing or stance for a ContentOpportunity; defines how the pain point is positioned. |
| `HookSet` | Platform-ready opening lines supporting a MessageAngle. |
| `VideoBrief` | The primary production artifact; complete enough to generate from without additional input. |
| `NarrationSpec` | ElevenLabs API input, assembled deterministically from approved VideoBrief fields. |
| `ScenePlan` | A structured mapping of script beats to visual scenes with continuity hints. |
| `ScenePrompt` | A visual provider input for one scene, assembled from brief fields and ProductionDefaults. |
| `RenderJob` | The lifecycle record for a single generation attempt; tracks all steps, artifacts, errors, costs, and provider calls. |
| `StepRecord` | Status record for one step within a RenderJob. |
| `RenderedAsset` | The final output video asset from a completed RenderJob. |
| `PerformanceSignal` | A record of the founder's terminal action on a RenderedAsset. |
| `ProductionDefaults` | A versioned, frozen configuration snapshot applied at job creation; includes provider IDs, voice settings, visual style, and regeneration budget. |
| `styleAnchor` | The fixed prefix string on every scene prompt; the primary visual consistency mechanism. |
| `referenceImageUrl` | Optional single reference frame stored in ProductionDefaults; improves character and location consistency across videos. |
| `modelFamily` | ProductionDefaults field enabling ElevenLabs model upgrade (v2 → v3) without code change. |
| `TrustEvaluator` | A service scoring content objects for trust-safety; runs at angle, hook, and (Phase D) final-script level. |
| `CostEstimate` | Pre-generation cost projection shown to founder before generation begins. |
| `JobCostRecord` | Actual cost per provider step, recorded after job completion. |
| `IdempotencyKey` | SHA-256 hash preventing duplicate jobs from the same brief and defaults combination. |
| `QualityCheckResult` | Automated sanity validation of the composed video before founder review. |
| `PreTriageConcern` | Founder's pre-generation concern selection; stored on RenderJob and correlated against regeneration reasons in Phase D. |
| `RegenerationReason` | Required classification captured when a founder clicks Regenerate. |
| `SkipReason` | Required classification captured when a founder skips an opportunity. |
| `QueueJob` | Inngest-managed execution record with concurrency control and per-step retry. |
| `PublishPackage` | A platform-ready export package generated from an approved RenderedAsset. |
| `ConnectHandoffPackage` | Typed contract object passed from Signal Engine to Connect; Connect never accesses Signal Engine internals. |
| `ConnectPerformanceSignal` | PerformanceSignal extension capturing campaign outcomes from Connect; closes the distribution feedback loop. |
| `BatchRenderJob` | Phase E orchestration object managing multiple RenderJobs with throttling and priority. |
| `CreatorBrief` | Externally-facing brief document for influencer and creator partnerships. |
| `ContentSeries` | Group of approved RenderedAssets sharing an angle and strategic purpose. |
| `WeeklySignalDigest` | Computed summary of generation outcomes, approval rates, cost trends, and provider comparison data. |
| `ContentMixTarget` | Phase E configuration enforcing distribution across contentType values; soft-blocked when batch deviates more than 30%. |
| `AutoApproveConfig` | Phase E configuration enabling high-confidence opportunity auto-approval, with mandatory periodic review safety rail. |
| `PromptOverride` | Rule-based Prompt Compiler adjustment for a specific pain point category, derived from aggregated PromptFeedback and founder-approved. |
| `ABTestConfig` | Phase D configuration for comparing two ProductionDefaults versions or visual providers; the correct mechanism for validating provider switches. |
| `MusicSpec` | Background music configuration; royalty-free loops stored in Vercel Blob, selected by mood. |

---

*Zaza Technologies — Confidential Internal Build Document*
*Revision 3 — Phases B through E — all reviewer feedback incorporated*
*Phase C implementation begins with Slice 1: VisualProvider interface + lifecycle state machine, before any provider-specific code.*
