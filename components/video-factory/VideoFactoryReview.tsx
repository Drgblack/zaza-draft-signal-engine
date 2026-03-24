"use client"

import * as React from "react"
import { useState } from "react"
import { Check, X, ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type {
  CostEstimate,
  PublishOutcomeSummary,
  PreTriageConcern,
  RegenerationReason,
  RenderJobProgress,
  VideoBriefSummary,
} from "@/lib/video-factory-review-model"

export interface VideoFactoryReviewProps {
  brief: VideoBriefSummary
  job: RenderJobProgress | null
  publishOutcome?: PublishOutcomeSummary | null
  onGenerate: (preTriage: PreTriageConcern) => void
  onApprove: () => void
  onReject: () => void
  onRegenerate: (reason: RegenerationReason) => void
  onEditBrief: () => void
  onDiscard: () => void
  actionsDisabled?: boolean
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
      {children}
    </p>
  )
}

function TrustGuardrailChip({ children }: { children: React.ReactNode }) {
  return (
    <span 
      className="inline-flex items-center rounded-md px-2.5 py-1 text-xs"
      style={{ 
        backgroundColor: '#FEF08A', 
        color: '#713F12',
        border: '1px solid #EAB308',
        fontWeight: 500
      }}
    >
      {children}
    </span>
  )
}

function StepIndicator({ status }: { status: "pending" | "running" | "done" | "failed" }) {
  if (status === "done") {
    return (
      <div 
        className="flex h-5 w-5 items-center justify-center rounded-full"
        style={{ backgroundColor: '#6366f1' }}
      >
        <Check className="h-3 w-3 text-white" />
      </div>
    )
  }
  if (status === "running") {
    return (
      <div className="flex h-5 w-5 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#6366f1' }} />
      </div>
    )
  }
  if (status === "failed") {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-600">
        <X className="h-3 w-3" />
      </div>
    )
  }
  return (
    <div 
      className="h-5 w-5 rounded-full border-2"
      style={{ borderColor: '#9CA3AF' }}
    />
  )
}

function SectionDivider() {
  return <hr className="border-t my-2" style={{ borderColor: '#E5E7EB' }} />
}

function formatLabel(value: string | null | undefined) {
  if (!value) {
    return "Not available"
  }

  return value.replaceAll("_", " ")
}

function formatCurrency(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `$${value.toFixed(2)}`
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) {
    return "Not available"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

function buildArtifactLineageSummary(job: RenderJobProgress) {
  const parts = [
    job.narrationAudioUrl ? "Narration ready" : null,
    job.captionTrackUrl ? "Captions ready" : null,
    job.sceneAssetCount > 0 ? `${job.sceneAssetCount} scene asset${job.sceneAssetCount === 1 ? "" : "s"}` : null,
    job.finalVideoUrl ? "Final video ready" : null,
    job.thumbnailUrl ? "Thumbnail ready" : null,
  ].filter((value): value is string => Boolean(value))

  return parts.length > 0 ? parts.join(" · ") : "Artifacts not ready yet"
}

function CompactRunSummaryPanel({
  job,
  publishOutcome,
}: {
  job: RenderJobProgress
  publishOutcome?: PublishOutcomeSummary | null
}) {
  const publishSummary = publishOutcome
    ? publishOutcome.published
      ? [
          publishOutcome.platform ? `Published on ${formatLabel(publishOutcome.platform)}` : "Published",
          publishOutcome.publishDate ? `Date ${formatDateLabel(publishOutcome.publishDate)}` : null,
          publishOutcome.impressions !== null ? `${publishOutcome.impressions} impressions` : null,
          publishOutcome.clicks !== null ? `${publishOutcome.clicks} clicks` : null,
          publishOutcome.signups !== null ? `${publishOutcome.signups} signups` : null,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" · ")
      : "Publish outcome placeholder saved. Not published yet."
    : null

  return (
    <Card className="bg-white border-muted">
      <CardContent className="pt-5 pb-5">
        <SectionLabel>Run summary</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Lifecycle</p>
            <p className="text-sm text-foreground">{formatLabel(job.lifecycleLabel)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Provider stack</p>
            <p className="text-sm text-foreground">{job.providerLabel}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Estimated / actual cost</p>
            <p className="text-sm text-foreground">
              {formatCurrency(job.costEstimate.estimatedTotalUsd)} · {formatCurrency(job.actualCostUsd)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Retry count</p>
            <p className="text-sm text-foreground">{job.retryCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Quality check</p>
            <p className="text-sm text-foreground">{job.qualitySummary ?? "Not available"}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Review outcome</p>
            <p className="text-sm text-foreground">{formatLabel(job.terminalOutcome)}</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Review reasons</p>
            <p className="text-sm text-foreground">
              {job.reviewReasonLabels.length > 0 ? job.reviewReasonLabels.join(" · ") : "No structured reasons recorded"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Artifact lineage</p>
            <p className="text-sm text-foreground">{buildArtifactLineageSummary(job)}</p>
          </div>
          {publishSummary ? (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Publish outcome</p>
              <p className="text-sm text-foreground">{publishSummary}</p>
              {publishOutcome?.publishedUrl ? (
                <a
                  href={publishOutcome.publishedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-[#6366f1] hover:underline"
                >
                  Open published URL
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// STATE 1: PRE-GENERATION
// ============================================================================

interface PreGenerationStateProps {
  brief: VideoBriefSummary
  costEstimate: CostEstimate
  regenerationCount: number
  regenerationBudgetMax: number
  budgetExhausted: boolean
  onGenerate: (preTriage: PreTriageConcern) => void
  onEditBrief: () => void
  onDiscard: () => void
  actionsDisabled: boolean
}

function PreGenerationState({
  brief,
  costEstimate,
  regenerationCount,
  regenerationBudgetMax,
  budgetExhausted,
  onGenerate,
  onEditBrief,
  onDiscard,
  actionsDisabled,
}: PreGenerationStateProps) {
  const [selectedConcern, setSelectedConcern] = useState<PreTriageConcern>("no_concern")

  const concernOptions: { value: PreTriageConcern; label: string }[] = [
    { value: "voice_concern", label: "Voice might feel off" },
    { value: "visual_mood_concern", label: "Visual mood might be wrong" },
    { value: "scene_setting_concern", label: "Scene setting might not match" },
    { value: "pacing_concern", label: "Pacing or timing concern" },
    { value: "trust_concern", label: "Trust or brand safety question" },
    { value: "no_concern", label: "No concerns — looks good" },
  ]

  const beatLabels = ["Problem", "Solution", "Reassurance", "Close"]
  const beats = [brief.scriptBeat1, brief.scriptBeat2, brief.scriptBeat3, brief.softClose]

  return (
    <div className="mx-auto max-w-[680px] space-y-0">
      {/* Brief Summary Card */}
      <div 
        style={{ backgroundColor: '#F8F7FF', borderLeft: '3px solid #6366f1' }}
        className="rounded-lg overflow-hidden"
      >
        <Card>
          <CardContent className="pt-6">
          <SectionLabel>Approved brief</SectionLabel>
          <p className="text-lg font-medium text-foreground mb-4 leading-relaxed">
            {'"'}{brief.primaryHook}{'"'}
          </p>
          <ol className="space-y-3">
            {beats.map((beat, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="text-muted-foreground font-medium min-w-[90px]">
                  {beatLabels[i]}
                </span>
                <span className="text-foreground">{beat}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="text-xs">
                {brief.audience}
              </Badge>
              {brief.finalScriptTrustScore !== null ? (
                <Badge className="text-xs bg-slate-100 text-slate-700 ring-slate-200">
                  Final script trust {brief.finalScriptTrustScore}/100
                </Badge>
              ) : null}
            </div>
          </div>
        </CardContent>
        </Card>
      </div>

      <SectionDivider />

      {/* Trust Guardrails */}
      <Card className="bg-white">
        <CardContent className="pt-6">
          <SectionLabel>Must not appear in video</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {brief.trustGuardrails.map((guardrail, i) => (
              <TrustGuardrailChip key={i}>{guardrail}</TrustGuardrailChip>
            ))}
          </div>
        </CardContent>
      </Card>

      <SectionDivider />

      {/* Cost Estimate Card */}
      <div 
        style={{ backgroundColor: '#EDE9FF' }}
        className="rounded-lg overflow-hidden"
      >
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-semibold text-foreground mb-2">
              Estimated cost: ${costEstimate.estimatedTotalUsd.toFixed(2)}
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              Narration ${costEstimate.narrationCostUsd.toFixed(2)} · 
              Visuals ${costEstimate.visualsCostUsd.toFixed(2)} · 
              Captions ${costEstimate.transcriptionCostUsd.toFixed(2)}
            </p>
            <div className="flex items-center gap-2">
              <Badge className="text-xs">
                {costEstimate.mode === "quality" ? "Quality mode" : "Fast mode"}
              </Badge>
              {costEstimate.mode === "fast" && (
                <span className="text-xs text-muted-foreground">
                  Fast mode uses lower visual quality settings
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <SectionDivider />

      {/* Pre-generation Concern Picker */}
      <Card className="bg-white">
        <CardContent className="pt-6">
          <SectionLabel>Before generating — any concerns with this brief?</SectionLabel>
          <RadioGroup
            value={selectedConcern}
            onValueChange={(value: string) => setSelectedConcern(value as PreTriageConcern)}
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
          >
            {concernOptions.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-colors",
                  selectedConcern === option.value
                    ? "border-2 border-[#6366f1] bg-[#EEF2FF]"
                    : "border border-[#E5E7EB] hover:bg-[#F9FAFB]"
                )}
              >
                <RadioGroupItem 
                  value={option.value}
                  disabled={actionsDisabled}
                  className={cn(
                    selectedConcern === option.value && "border-[#6366f1] text-[#6366f1]"
                  )}
                />
                <span 
                  className="text-sm"
                  style={selectedConcern === option.value ? { color: '#4338CA', fontWeight: 600 } : undefined}
                >
                  {option.label}
                </span>
              </label>
            ))}
          </RadioGroup>
          <p className="text-xs text-muted-foreground mt-3">
            Takes 5 seconds. Helps us learn.
          </p>
        </CardContent>
      </Card>

      {/* Regeneration Budget Indicator */}
      <div className="text-sm text-muted-foreground pt-6">
        <span>Regenerations used: </span>
        <span className={cn(regenerationCount > 0 && "text-amber-600 font-medium")}>
          {regenerationCount}
        </span>
        <span> of {regenerationBudgetMax}</span>
      </div>

      {/* Action Section */}
      {budgetExhausted ? (
        <div 
          className="mt-6 rounded-lg overflow-hidden"
          style={{ 
            backgroundColor: '#FEF3C7',
            borderLeft: '4px solid #F59E0B',
            borderTop: '1px solid #E5E7EB',
            borderRight: '1px solid #E5E7EB',
            borderBottom: '1px solid #E5E7EB',
          }}
        >
          <Card>
            <CardContent className="pt-6">
              <p className="mb-1" style={{ color: '#92400E', fontWeight: 600 }}>
                {"You've generated this brief 3 times."}
              </p>
              <p className="text-sm mb-4" style={{ color: '#92400E' }}>
                To continue, edit the brief or discard it.
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={onEditBrief}>
                  Edit Brief
                </Button>
                <Button variant="ghost" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={onDiscard} disabled={actionsDisabled}>
                  Discard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-6">
          <Button
            className="w-full sm:w-auto shadow-md hover:bg-[#4F46E5]"
            style={{ backgroundColor: '#6366f1' }}
            disabled={actionsDisabled}
            onClick={() => onGenerate(selectedConcern)}
          >
            Approve & Generate
          </Button>
          <p className="text-xs text-muted-foreground text-center sm:text-right sm:absolute sm:mt-12">
            Generation runs in the background. You can close this tab.
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// STATE 2: GENERATING
// ============================================================================

interface GeneratingStateProps {
  job: RenderJobProgress
  brief: VideoBriefSummary
  publishOutcome?: PublishOutcomeSummary | null
  onRetry: () => void
  onEditBrief: () => void
  actionsDisabled: boolean
}

function GeneratingState({ job, brief, publishOutcome, onRetry, onEditBrief, actionsDisabled }: GeneratingStateProps) {
  const stepLabels: Record<keyof RenderJobProgress["steps"], string> = {
    narration: "Narration",
    transcription: "Captions",
    visuals: "Visual scenes",
    qualityCheck: "Quality check",
    composition: "Compositing",
    upload: "Saving",
  }

  const stepOrder: (keyof RenderJobProgress["steps"])[] = [
    "narration",
    "transcription",
    "visuals",
    "qualityCheck",
    "composition",
    "upload",
  ]

  const isFailed = job.status === "failed" || job.status === "failed_permanent"
  const isPermanentFail = job.status === "failed_permanent"

  return (
    <div className="mx-auto max-w-[680px] space-y-6">
      {/* Status Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          {isFailed ? "Generation failed" : "Generating your video"}
        </h1>
        {!isFailed && (
          <p className="text-muted-foreground">
            This takes 2–4 minutes. You can close this tab and come back.
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-2">
          Estimated cost: ${job.costEstimate.estimatedTotalUsd.toFixed(2)}
        </p>
      </div>

      <CompactRunSummaryPanel job={job} publishOutcome={publishOutcome} />

      {/* Step Progress List */}
      <div 
        style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}
        className="rounded-lg overflow-hidden"
      >
        <Card>
          <CardContent className="pt-6">
          <div className="space-y-4">
            {stepOrder.map((step) => {
              const status = job.steps[step]
              const isActive = status === "running"
              const isDone = status === "done"

              return (
                <div
                  key={step}
                  className={cn(
                    "flex items-center gap-3",
                    isDone && "opacity-50",
                    isActive && "font-medium"
                  )}
                >
                  <StepIndicator status={status} />
                  <span 
                    className={cn("text-sm")}
                    style={isActive ? { color: '#6366f1' } : undefined}
                  >
                    {stepLabels[step]}
                  </span>
                </div>
              )
            })}
          </div>
        </CardContent>
        </Card>
      </div>

      {/* Generating From Card */}
      <Card className="bg-white border-muted">
        <CardContent className="pt-4 pb-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Generating from:
          </p>
          <p className="text-sm italic text-foreground">
            {'"'}{brief.primaryHook}{'"'}
          </p>
        </CardContent>
      </Card>

      {/* Regeneration Context */}
      {job.regenerationCount > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          Regeneration {job.regenerationCount} of {job.regenerationBudgetMax}
        </p>
      )}

      {/* Error State */}
      {isFailed && (
        <div 
          className="rounded-lg overflow-hidden"
          style={{ 
            backgroundColor: '#FEF3C7',
            borderLeft: '4px solid #F59E0B',
            borderTop: '1px solid #E5E7EB',
            borderRight: '1px solid #E5E7EB',
            borderBottom: '1px solid #E5E7EB',
          }}
        >
          <Card>
            <CardContent className="pt-6">
              <p style={{ color: '#92400E' }} className="mb-3">
                {job.lastError || "An error occurred during generation."}
              </p>
              {!isPermanentFail ? (
                <div className="flex items-center gap-2" style={{ color: '#92400E' }}>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Retrying automatically...</span>
                </div>
              ) : (
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={onRetry} disabled={actionsDisabled}>
                    Try again
                  </Button>
                  <Button variant="ghost" onClick={onEditBrief} disabled={actionsDisabled}>
                    Edit Brief
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// STATE 3: REVIEW
// ============================================================================

interface ReviewStateProps {
  brief: VideoBriefSummary
  job: RenderJobProgress
  publishOutcome?: PublishOutcomeSummary | null
  onApprove: () => void
  onReject: () => void
  onRegenerate: (reason: RegenerationReason) => void
  onEditBrief: () => void
  onDiscard: () => void
  actionsDisabled: boolean
}

function ReviewState({
  brief,
  job,
  publishOutcome,
  onApprove,
  onReject,
  onRegenerate,
  onEditBrief,
  onDiscard,
  actionsDisabled,
}: ReviewStateProps) {
  const [isBriefOpen, setIsBriefOpen] = useState(false)
  const [checkedGuardrails, setCheckedGuardrails] = useState<Set<number>>(new Set())
  const [showRegenerateReason, setShowRegenerateReason] = useState(false)
  const [selectedReason, setSelectedReason] = useState<RegenerationReason>("wrong_visual_setting")
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [isMuted, setIsMuted] = useState(true)

  const noGuardrailsChecked = checkedGuardrails.size === 0

  const reasonOptions: { value: RegenerationReason; label: string }[] = [
    { value: "wrong_visual_setting", label: "Wrong visual setting" },
    { value: "wrong_mood", label: "Wrong mood or tone" },
    { value: "wrong_subject", label: "Wrong subject in scenes" },
    { value: "poor_narration_quality", label: "Narration quality issue" },
    { value: "trust_concern", label: "Trust or brand concern" },
    { value: "off_brand", label: "Doesn't feel on-brand" },
    { value: "other", label: "Other" },
  ]

  const handleGuardrailToggle = (index: number) => {
    const newChecked = new Set(checkedGuardrails)
    if (newChecked.has(index)) {
      newChecked.delete(index)
    } else {
      newChecked.add(index)
    }
    setCheckedGuardrails(newChecked)
  }

  const handleRegenerate = () => {
    onRegenerate(selectedReason)
    setShowRegenerateReason(false)
  }

  return (
    <div className="mx-auto max-w-[960px]">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Video Player (9:16 portrait) */}
        <div className="space-y-3">
          <div 
            className="relative rounded-lg overflow-hidden bg-black"
            style={{ aspectRatio: '9/16', maxWidth: '280px' }}
          >
            <video
              src={job.finalVideoUrl || undefined}
              poster={job.thumbnailUrl || undefined}
              autoPlay
              muted={isMuted}
              loop
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              controls
            />
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
          </div>
          <CompactRunSummaryPanel job={job} publishOutcome={publishOutcome} />
          <div className="space-y-1">
            <p className="text-xs" style={{ color: '#9CA3AF' }}>
              Attempt {job.currentAttempt || 0} · Prior attempts {job.priorAttemptsCount}
            </p>
            {job.lastUpdatedAt ? (
              <p className="text-xs" style={{ color: '#9CA3AF' }}>
                Updated: {formatDateLabel(job.lastUpdatedAt)}
              </p>
            ) : null}
          </div>
        </div>

        {/* Right Column: Brief and Decision */}
        <div className="space-y-6">
          {/* Brief Recap (Collapsible) */}
          <Collapsible open={isBriefOpen} onOpenChange={setIsBriefOpen}>
            <Card className="bg-white">
              <CardContent className="pt-6">
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
                  {isBriefOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">What was approved</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4 space-y-3">
                  <p className="text-base font-semibold text-foreground leading-snug">
                    {'"'}{brief.primaryHook}{'"'}
                  </p>
                  <div className="space-y-2">
                    <div className="flex gap-3 text-sm">
                      <span className="text-muted-foreground min-w-[90px] shrink-0">Problem</span>
                      <span className="text-foreground">{brief.scriptBeat1}</span>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <span className="text-muted-foreground min-w-[90px] shrink-0">Solution</span>
                      <span className="text-foreground">{brief.scriptBeat2}</span>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <span className="text-muted-foreground min-w-[90px] shrink-0">Reassurance</span>
                      <span className="text-foreground">{brief.scriptBeat3}</span>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <span className="text-muted-foreground min-w-[90px] shrink-0">Close</span>
                      <span className="text-foreground">{brief.softClose}</span>
                    </div>
                  </div>
                </CollapsibleContent>
              </CardContent>
            </Card>
          </Collapsible>

          {/* Trust Guardrail Checklist */}
          <div 
            className="bg-white rounded-lg overflow-hidden"
            style={{ borderTop: '2px solid #6366f1' }}
          >
            <Card>
              <CardContent className="pt-6">
              <SectionLabel>Trust check</SectionLabel>
              {brief.finalScriptTrustScore !== null ? (
                <p className="mb-3 text-xs text-muted-foreground">
                  Final assembled script trust score: {brief.finalScriptTrustScore}/100
                </p>
              ) : null}
              <div className="space-y-1">
                {brief.trustGuardrails.map((guardrail, i) => (
                  <label
                    key={i}
                    className="flex items-center gap-3 cursor-pointer rounded-md px-2 py-2 transition-colors hover:bg-[#F5F3FF]"
                  >
                    <Checkbox
                      checked={checkedGuardrails.has(i)}
                      disabled={actionsDisabled}
                      onCheckedChange={() => handleGuardrailToggle(i)}
                    />
                    <span className="text-sm">{guardrail}</span>
                  </label>
                ))}
              </div>
              {noGuardrailsChecked && (
                <p className="text-xs text-amber-600 mt-3">
                  Check the trust guardrails before approving
                </p>
              )}
              </CardContent>
            </Card>
          </div>

          {/* Decision Actions */}
          <div className="space-y-3">
            {/* Approve Button */}
            <div>
              <div className="space-y-2">
                <Button 
                  className="w-full shadow-md hover:bg-[#4F46E5]"
                  style={{ backgroundColor: '#6366f1' }}
                  disabled={actionsDisabled || noGuardrailsChecked}
                  onClick={onApprove}
                >
                  Approve for use
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={actionsDisabled}
                  onClick={onReject}
                >
                  Reject
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 text-center">
                Approve moves to export queue. Reject keeps the brief and marks this attempt as rejected.
              </p>
            </div>

            {/* Regenerate Button */}
            {!job.budgetExhausted ? (
              <div>
                {!showRegenerateReason ? (
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={actionsDisabled}
                    onClick={() => setShowRegenerateReason(true)}
                  >
                    Regenerate
                  </Button>
                ) : (
                  <Card className="border-border bg-white">
                    <CardContent className="pt-4 pb-4">
                      <RadioGroup
                        value={selectedReason}
                        onValueChange={(value: string) => setSelectedReason(value as RegenerationReason)}
                        disabled={actionsDisabled}
                        className="space-y-2"
                      >
                        {reasonOptions.map((option) => (
                          <label
                            key={option.value}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors",
                              selectedReason === option.value
                                ? "bg-[#EEF2FF]"
                                : "hover:bg-muted/50"
                            )}
                          >
                            <RadioGroupItem value={option.value} disabled={actionsDisabled} />
                            <span className="text-sm">{option.label}</span>
                          </label>
                        ))}
                      </RadioGroup>
                      <div className="flex gap-2 mt-4">
                        <Button 
                          size="sm" 
                          disabled={actionsDisabled}
                          onClick={handleRegenerate}
                          className="hover:bg-[#4F46E5]"
                          style={{ backgroundColor: '#6366f1' }}
                        >
                          Regenerate with this reason
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={actionsDisabled}
                          onClick={() => setShowRegenerateReason(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div 
                className="rounded-lg overflow-hidden"
                style={{ 
                  backgroundColor: '#FEF3C7',
                  borderLeft: '4px solid #F59E0B',
                  borderTop: '1px solid #E5E7EB',
                  borderRight: '1px solid #E5E7EB',
                  borderBottom: '1px solid #E5E7EB',
                }}
              >
                <Card>
                  <CardContent className="py-4">
                    <p className="text-sm" style={{ color: '#92400E', fontWeight: 600 }}>
                      Regeneration budget exhausted
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Divider between action groups */}
            <hr className="border-t my-1" style={{ borderColor: '#E5E7EB' }} />

            {/* Edit Brief Button */}
            <div>
              <Button variant="ghost" className="w-full" onClick={onEditBrief} disabled={actionsDisabled}>
                Edit brief first
              </Button>
              <p className="text-xs text-muted-foreground mt-1 text-center">
                Resets regeneration count
              </p>
            </div>

            {/* Discard Button */}
            {!showDiscardConfirm ? (
              <Button
                variant="ghost"
                className="w-full text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                disabled={actionsDisabled}
                onClick={() => setShowDiscardConfirm(true)}
              >
                Discard
              </Button>
            ) : (
              <Card className="border-border bg-white">
                <CardContent className="py-4">
                  <p className="text-sm text-foreground mb-3">
                    Discard this video? The brief is kept.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                      disabled={actionsDisabled}
                      onClick={onDiscard}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={actionsDisabled}
                      onClick={() => setShowDiscardConfirm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function VideoFactoryReview({
  brief,
  job,
  publishOutcome = null,
  onGenerate,
  onApprove,
  onReject,
  onRegenerate,
  onEditBrief,
  onDiscard,
  actionsDisabled = false,
}: VideoFactoryReviewProps) {
  // Determine which state to show
  const getState = (): "pre-generation" | "generating" | "review" => {
    if (job === null) return "pre-generation"
    return job.viewState
  }

  const state = getState()

  // Default cost estimate for pre-generation state
  const defaultCostEstimate: CostEstimate = {
    estimatedTotalUsd: 0.75,
    narrationCostUsd: 0.18,
    visualsCostUsd: 0.45,
    transcriptionCostUsd: 0.03,
    mode: "quality",
  }

  return (
    <div className="min-h-screen py-8 px-4">
      {state === "pre-generation" && (
        <PreGenerationState
          brief={brief}
          costEstimate={job?.costEstimate || defaultCostEstimate}
          regenerationCount={job?.regenerationCount || 0}
          regenerationBudgetMax={job?.regenerationBudgetMax || 3}
          budgetExhausted={job?.budgetExhausted || false}
          onGenerate={onGenerate}
          onEditBrief={onEditBrief}
          onDiscard={onDiscard}
          actionsDisabled={actionsDisabled}
        />
      )}
      {state === "generating" && job && (
        <GeneratingState
          job={job}
          brief={brief}
          publishOutcome={publishOutcome}
          onRetry={() => onRegenerate("other")}
          onEditBrief={onEditBrief}
          actionsDisabled={actionsDisabled}
        />
      )}
      {state === "review" && job && (
        <ReviewState
          brief={brief}
          job={job}
          publishOutcome={publishOutcome}
          onApprove={onApprove}
          onReject={onReject}
          onRegenerate={onRegenerate}
          onEditBrief={onEditBrief}
          onDiscard={onDiscard}
          actionsDisabled={actionsDisabled}
        />
      )}
    </div>
  )
}

// ============================================================================
// DEMO PROPS
// ============================================================================

export const DEMO_PROPS: VideoFactoryReviewProps = {
  brief: {
    briefId: "brief-001",
    primaryHook: "Every teacher knows the feeling — you send the email and immediately wonder how it sounded.",
    scriptBeat1: "Parent emails are the highest-risk communication teachers send. Tone is invisible in text, and one misread word can escalate instantly.",
    scriptBeat2: "Zaza Draft checks your tone before you send — flagging language that could be misread as aggressive, dismissive, or unprofessional.",
    scriptBeat3: "Thousands of teachers are using it to feel calmer and more confident before every send.",
    softClose: "Try Zaza Draft free — no credit card, no commitment.",
    trustGuardrails: [
      "No urgency language",
      "No fear amplification",
      "No exaggerated claims",
      "Must sound like a teacher, not a brand",
    ],
    audience: "Primary and secondary school teachers",
    finalScriptTrustScore: 91,
  },
  job: {
    jobId: "job-789",
    batchId: null,
    viewState: "review",
    status: "completed",
    regenerationCount: 1,
    retryCount: 0,
    regenerationBudgetMax: 3,
    budgetExhausted: false,
    currentAttempt: 2,
    priorAttemptsCount: 1,
    lifecycleLabel: "review_pending",
    terminalOutcome: "review_pending",
    reviewReasonLabels: ["poor visuals"],
    lastUpdatedAt: "2026-03-23T10:00:00.000Z",
    providerLabel: "Narration elevenlabs | Visuals runway-gen4 | Captions assemblyai | Composition ffmpeg",
    qualitySummary: "Passed",
    costEstimate: {
      estimatedTotalUsd: 0.75,
      narrationCostUsd: 0.18,
      visualsCostUsd: 0.45,
      transcriptionCostUsd: 0.03,
      mode: "quality",
    },
    actualCostUsd: 0.68,
    finalVideoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
    thumbnailUrl: null,
    narrationAudioUrl: "https://example.com/narration.mp3",
    captionTrackUrl: "https://example.com/captions.vtt",
    sceneAssetCount: 4,
    lastError: null,
    steps: {
      narration: "done",
      transcription: "done",
      visuals: "done",
      qualityCheck: "done",
      composition: "done",
      upload: "done",
    },
  },
  publishOutcome: {
    published: false,
    platform: null,
    publishDate: null,
    publishedUrl: null,
    impressions: null,
    clicks: null,
    signups: null,
  },
  onGenerate: (preTriage) => console.log("Generate with triage:", preTriage),
  onApprove: () => console.log("Approved"),
  onReject: () => console.log("Rejected"),
  onRegenerate: (reason) => console.log("Regenerate with reason:", reason),
  onEditBrief: () => console.log("Edit brief"),
  onDiscard: () => console.log("Discarded"),
}
