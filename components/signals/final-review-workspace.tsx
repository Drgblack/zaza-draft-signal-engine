"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildSignalAssetBundle,
  buildGeneratedImagePlaceholderUrl,
  getAssetPrimaryImage,
  getAssetPrimaryVideo,
  parseAssetBundle,
  stringifyAssetBundle,
  type AssetBundle,
  type AssetPrimaryType,
} from "@/lib/assets";
import {
  buildRepurposingBundleSummary,
  buildSignalRepurposingBundle,
  parseRepurposingBundle,
  parseSelectedRepurposedOutputIds,
  stringifyRepurposingBundle,
  stringifySelectedRepurposedOutputIds,
  type RepurposedOutput,
  type RepurposingBundle,
} from "@/lib/repurposing";
import {
  buildPublishPrepBundleSummary,
  buildSignalPublishPrepBundle,
  getPublishPrepPackageForPlatform,
  getPublishPrepPackageLabel,
  getSelectedCtaText,
  getSelectedHookText,
  parsePublishPrepBundle,
  stringifyPublishPrepBundle,
  type PublishPrepBundle,
  type PublishPrepPackage,
} from "@/lib/publish-prep";
import { getAutoRepairLabel, getLatestAutoRepairEntry } from "@/lib/auto-repair";
import {
  applyFounderVoiceToText,
  FOUNDER_VOICE_LABEL,
  getFounderVoiceModeLabel,
  isFounderVoiceOn,
} from "@/lib/founder-voice";
import type { EvergreenCandidate } from "@/lib/evergreen";
import { getOutcomeQualityLabel, getReuseRecommendationLabel } from "@/lib/outcome-memory";
import { PlaybookPackSuggestions } from "@/components/playbook/playbook-pack-suggestions";
import { buildDraftDiffSummary } from "@/lib/review-command-center";
import {
  REVIEW_MACROS,
  appendReviewMacroNote,
  formatReviewMacroActions,
  softenCtaText,
  softenToneText,
  type AppliedReviewMacro,
  type ReviewMacroId,
} from "@/lib/review-macros";
import type { ConversionIntentAssessment } from "@/lib/conversion-intent";
import type { PlaybookPackMatch } from "@/lib/playbook-packs";
import { getStrategicValueLabel } from "@/lib/strategic-outcome-memory";
import { ReviewStateBadge } from "@/components/signals/review-state-badge";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import type { CandidateHypothesis } from "@/lib/hypotheses";
import { evaluateApprovalPackageCompleteness } from "@/lib/completeness";
import { buildFinalReviewSummary } from "@/lib/final-review";
import {
  buildSignalPostingSummary,
  getPostingPlatformLabel,
  type PostingLogEntry,
  type PostingPlatform,
} from "@/lib/posting-memory";
import type { PackageAutofillNote } from "@/lib/package-filler";
import { getPlatformIntentProfile } from "@/lib/platform-profiles";
import { formatDateTime } from "@/lib/utils";
import type { PostingAssistantActionResponse } from "@/types/api";
import type { FounderVoiceMode, SignalDataSource, SignalRecord } from "@/types/signal";
import type { AutomationConfidenceAssessment } from "@/lib/confidence";
import type { ConflictAssessment } from "@/lib/conflicts";
import type { StaleQueueAssessment } from "@/lib/stale-queue";

type ReviewFormState = {
  finalXDraft: string;
  finalLinkedInDraft: string;
  finalRedditDraft: string;
  xReviewStatus: "" | "ready" | "needs_edit" | "skip";
  linkedInReviewStatus: "" | "ready" | "needs_edit" | "skip";
  redditReviewStatus: "" | "ready" | "needs_edit" | "skip";
  finalReviewNotes: string;
  imagePrompt: string;
  videoScript: string;
  assetBundleJson: string;
  preferredAssetType: "" | AssetPrimaryType;
  selectedImageAssetId: string;
  selectedVideoConceptId: string;
  generatedImageUrl: string;
  repurposingBundleJson: string;
  publishPrepBundleJson: string;
  selectedRepurposedOutputIdsJson: string;
};

type PostingFormState = {
  postedAt: string;
  finalPostedText: string;
  postUrl: string;
  note: string;
};

type EditSuggestionOption = {
  key: string;
  label: string;
  summary: string;
  reason: string;
  platform: "x" | "linkedin" | "reddit";
  patternType: "shortened_hook" | "softened_tone" | "removed_claim" | "changed_cta";
  frequency: number | null;
};

type RevisionGuidanceInsight = {
  platform: "x" | "linkedin" | "reddit";
  headline: string;
  positive: string | null;
  caution: string | null;
  evidenceCount: number;
};

type DraftDiffRow = {
  before: string;
  after: string;
};

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function buildDraftDiffRows(generatedValue: string, finalValue: string, limit = 4): DraftDiffRow[] {
  const generatedLines = generatedValue.split(/\r?\n/);
  const finalLines = finalValue.split(/\r?\n/);
  const maxLength = Math.max(generatedLines.length, finalLines.length);
  const rows: DraftDiffRow[] = [];

  for (let index = 0; index < maxLength; index += 1) {
    const before = generatedLines[index]?.trim() ?? "";
    const after = finalLines[index]?.trim() ?? "";
    if (before === after) {
      continue;
    }

    rows.push({
      before,
      after,
    });

    if (rows.length >= limit) {
      break;
    }
  }

  return rows;
}

function replaceFirstNonEmptyLine(text: string, updater: (line: string) => string): string {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trim().length > 0);
  if (index < 0) {
    return text;
  }

  const nextLine = updater(lines[index].trim());
  if (!nextLine || nextLine === lines[index].trim()) {
    return text;
  }

  lines[index] = nextLine;
  return lines.join("\n");
}

function tightenHookDraft(text: string): string {
  return replaceFirstNonEmptyLine(text, (line) => {
    const sentence = line.split(/(?<=[.!?])\s+/)[0]?.trim() ?? line;
    const clause = sentence.split(/[;,:]/)[0]?.trim() ?? sentence;
    const words = clause.split(/\s+/).filter(Boolean);
    if (words.length < 13) {
      return line;
    }

    const nextLead = `${words.slice(0, 12).join(" ").replace(/[.?!]+$/g, "")}.`;
    return line === sentence ? nextLead : line.replace(sentence, nextLead);
  });
}

function applyEditSuggestionTransform(
  text: string,
  patternType: EditSuggestionOption["patternType"],
): string {
  switch (patternType) {
    case "shortened_hook":
      return tightenHookDraft(text);
    case "softened_tone":
      return softenToneText(text);
    case "removed_claim":
      return softenToneText(text);
    case "changed_cta":
    default:
      return softenCtaText(text);
  }
}

function toneClasses(tone: "success" | "warning" | "error") {
  switch (tone) {
    case "success":
      return "bg-emerald-50 text-emerald-700";
    case "warning":
      return "bg-amber-50 text-amber-700";
    case "error":
    default:
      return "bg-rose-50 text-rose-700";
  }
}

function staleStateLabel(state: StaleQueueAssessment["state"]): string {
  switch (state) {
    case "fresh":
      return "Fresh";
    case "aging":
      return "Aging";
    case "stale_but_reusable":
      return "Stale but reusable";
    case "stale_needs_refresh":
      return "Needs refresh";
    case "stale":
    default:
      return "Stale";
  }
}

function staleOperatorActionLabel(action: NonNullable<StaleQueueAssessment["operatorAction"]>): string {
  switch (action) {
    case "keep_anyway":
      return "Keep anyway";
    case "refresh_requested":
      return "Refresh requested";
    case "move_to_evergreen_later":
      return "Evergreen later";
    case "suppress":
    default:
      return "Suppressed";
  }
}

function automationConfidenceTone(
  level: AutomationConfidenceAssessment["level"],
): "high_confidence" | "medium_confidence" | "low_confidence" {
  if (level === "high") {
    return "high_confidence";
  }

  if (level === "low") {
    return "low_confidence";
  }

  return "medium_confidence";
}

function conflictLabel(type: NonNullable<ConflictAssessment["topConflicts"][number]>["conflictType"]): string {
  switch (type) {
    case "cta_destination_mismatch":
      return "CTA / destination mismatch";
    case "mode_funnel_mismatch":
      return "Mode / funnel mismatch";
    case "platform_tone_mismatch":
      return "Platform / tone mismatch";
    case "hypothesis_package_mismatch":
      return "Hypothesis / package mismatch";
    case "campaign_context_mismatch":
      return "Campaign context mismatch";
    case "expected_outcome_mismatch":
      return "Expected outcome mismatch";
    case "destination_overreach":
      return "Destination overreach";
    case "reddit_promo_conflict":
    default:
      return "Reddit promo conflict";
  }
}

function conflictTone(severity: NonNullable<ConflictAssessment["highestSeverity"]>): "neutral" | "aging" | "stale" {
  if (severity === "high") {
    return "stale";
  }

  if (severity === "medium") {
    return "aging";
  }

  return "neutral";
}

function conversionIntentLabel(posture: ConversionIntentAssessment["posture"]): string {
  switch (posture) {
    case "awareness_first":
      return "Awareness-first";
    case "trust_first":
      return "Trust-first";
    case "soft_conversion":
      return "Soft conversion";
    case "direct_conversion":
    default:
      return "Direct conversion";
  }
}

function createFormState(signal: SignalRecord): ReviewFormState {
  const assetBundleJson = signal.assetBundleJson ?? stringifyAssetBundle(buildSignalAssetBundle(signal)) ?? "";
  const repurposingBundle = buildSignalRepurposingBundle(signal);
  const repurposingBundleJson = signal.repurposingBundleJson ?? stringifyRepurposingBundle(repurposingBundle) ?? "";
  const publishPrepBundleJson =
    signal.publishPrepBundleJson ?? stringifyPublishPrepBundle(buildSignalPublishPrepBundle(signal)) ?? "";
  const selectedRepurposedOutputIdsJson =
    signal.selectedRepurposedOutputIdsJson ??
    stringifySelectedRepurposedOutputIds(repurposingBundle?.recommendedSubset ?? []) ??
    "";

  return {
    finalXDraft: signal.finalXDraft ?? signal.xDraft ?? "",
    finalLinkedInDraft: signal.finalLinkedInDraft ?? signal.linkedInDraft ?? "",
    finalRedditDraft: signal.finalRedditDraft ?? signal.redditDraft ?? "",
    xReviewStatus: signal.xReviewStatus ?? "",
    linkedInReviewStatus: signal.linkedInReviewStatus ?? "",
    redditReviewStatus: signal.redditReviewStatus ?? "",
    finalReviewNotes: signal.finalReviewNotes ?? "",
    imagePrompt: signal.imagePrompt ?? "",
    videoScript: signal.videoScript ?? "",
    assetBundleJson,
    preferredAssetType: signal.preferredAssetType ?? "",
    selectedImageAssetId: signal.selectedImageAssetId ?? "",
    selectedVideoConceptId: signal.selectedVideoConceptId ?? "",
    generatedImageUrl: signal.generatedImageUrl ?? "",
    repurposingBundleJson,
    publishPrepBundleJson,
    selectedRepurposedOutputIdsJson,
  };
}

function statusLabel(value: ReviewFormState["xReviewStatus"]): string {
  switch (value) {
    case "ready":
      return "Ready";
    case "needs_edit":
      return "Needs edit";
    case "skip":
      return "Skip";
    default:
      return "Needs review";
  }
}

function postingStateLabel(state: ReturnType<typeof buildSignalPostingSummary>["platformRows"][number]["state"]): string {
  switch (state) {
    case "posted":
      return "Posted";
    case "ready_not_posted":
      return "Ready, not posted";
    case "skip":
      return "Skipped";
    case "needs_edit":
      return "Needs edit";
    case "not_reviewed":
    default:
      return "No post logged";
  }
}

function toDateTimeLocalValue(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const offset = parsed.getTimezoneOffset();
  return new Date(parsed.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function createPostingFormState(
  signal: SignalRecord,
  platform: PostingPlatform,
  latestEntry: PostingLogEntry | null,
): PostingFormState {
  const draftValue =
    platform === "x"
      ? signal.finalXDraft ?? signal.xDraft ?? ""
      : platform === "linkedin"
        ? signal.finalLinkedInDraft ?? signal.linkedInDraft ?? ""
        : signal.finalRedditDraft ?? signal.redditDraft ?? "";

  return {
    postedAt: toDateTimeLocalValue(latestEntry?.postedAt ?? new Date().toISOString()),
    finalPostedText: latestEntry?.finalPostedText ?? draftValue,
    postUrl: latestEntry?.postUrl ?? "",
    note: latestEntry?.note ?? "",
  };
}

export function FinalReviewWorkspace({
  signal,
  source,
  appliedPatternName,
  editSuggestions,
  revisionGuidance,
  guidanceConfidenceLevel,
  automationConfidence,
  hypothesis,
  packageAutofillMode,
  packageAutofillNotes,
  conversionIntent,
  experimentContexts,
  initialPostingEntries,
  weeklyPlanContext,
  evergreenContext,
  staleContext,
  conflicts,
  playbookPackMatches,
  narrativeSequenceSteps,
  navigation,
}: {
  signal: SignalRecord;
  source: SignalDataSource;
  appliedPatternName: string | null;
  editSuggestions: Record<"x" | "linkedin" | "reddit", EditSuggestionOption[]>;
  revisionGuidance: Record<"x" | "linkedin" | "reddit", RevisionGuidanceInsight>;
  guidanceConfidenceLevel: "high" | "moderate" | "low";
  automationConfidence: AutomationConfidenceAssessment;
  hypothesis: CandidateHypothesis;
  packageAutofillMode?: "applied" | "suggested" | "blocked";
  packageAutofillNotes?: PackageAutofillNote[];
  conversionIntent?: ConversionIntentAssessment | null;
  experimentContexts?: Array<{
    name: string;
    statusLabel: string;
    learningGoal: string | null;
    comparisonTarget: string | null;
    variantLabels: string[];
  }>;
  initialPostingEntries: PostingLogEntry[];
  weeklyPlanContext?: {
    weekLabel: string;
    theme: string | null;
    summary: string;
    boosts: string[];
    cautions: string[];
  } | null;
  evergreenContext?: EvergreenCandidate | null;
  staleContext?: StaleQueueAssessment | null;
  conflicts?: ConflictAssessment | null;
  playbookPackMatches?: PlaybookPackMatch[];
  narrativeSequenceSteps?: Partial<
    Record<
      PostingPlatform,
      {
        sequenceId: string;
        narrativeLabel: string;
        sequenceGoal: string;
        sequenceReason: string;
        suggestedCadenceNotes: string;
        stepId: string;
        stepNumber: number;
        totalSteps: number;
        platform: PostingPlatform;
        contentRole: string;
        roleLabel: string;
        rationale: string;
      }
    >
  > | null;
  navigation?: {
    previousHref: string | null;
    nextHref: string | null;
    index: number;
    total: number;
  } | null;
}) {
  const [currentSignal, setCurrentSignal] = useState(signal);
  const [formState, setFormState] = useState<ReviewFormState>(() => createFormState(signal));
  const [savedState, setSavedState] = useState<ReviewFormState>(() => createFormState(signal));
  const [postingEntries, setPostingEntries] = useState<PostingLogEntry[]>(initialPostingEntries);
  const [activePostingPlatform, setActivePostingPlatform] = useState<PostingPlatform | null>(null);
  const [activeDraftPlatform, setActiveDraftPlatform] = useState<PostingPlatform>(() => {
    if (signal.xReviewStatus !== "ready") return "x";
    if (signal.linkedInReviewStatus !== "ready") return "linkedin";
    return "reddit";
  });
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [founderVoiceMode, setFounderVoiceMode] = useState<FounderVoiceMode>(signal.founderVoiceMode ?? "founder_voice_on");
  const [founderVoiceAppliedAt, setFounderVoiceAppliedAt] = useState<string | null>(signal.founderVoiceAppliedAt ?? null);
  const [postingForms, setPostingForms] = useState<Record<PostingPlatform, PostingFormState>>(() => ({
    x: createPostingFormState(signal, "x", initialPostingEntries.find((entry) => entry.platform === "x") ?? null),
    linkedin: createPostingFormState(signal, "linkedin", initialPostingEntries.find((entry) => entry.platform === "linkedin") ?? null),
    reddit: createPostingFormState(signal, "reddit", initialPostingEntries.find((entry) => entry.platform === "reddit") ?? null),
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [appliedEditSuggestions, setAppliedEditSuggestions] = useState<
    Array<Pick<EditSuggestionOption, "key" | "platform" | "patternType" | "label">>
  >([]);
  const [appliedReviewMacros, setAppliedReviewMacros] = useState<AppliedReviewMacro[]>([]);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    body: string;
  } | null>(null);
  const [showSupportDetail, setShowSupportDetail] = useState(false);

  const xProfile = useMemo(() => getPlatformIntentProfile("x"), []);
  const linkedInProfile = useMemo(() => getPlatformIntentProfile("linkedin"), []);
  const redditProfile = useMemo(() => getPlatformIntentProfile("reddit"), []);
  const draftPanels = useMemo(
    () => [
      {
        key: "x" as const,
        label: "X Draft",
        helper: xProfile.helperNote,
        structure: xProfile.structure,
        generatedValue: currentSignal.xDraft ?? "",
        finalValue: formState.finalXDraft,
        statusValue: formState.xReviewStatus,
      },
      {
        key: "linkedin" as const,
        label: "LinkedIn Draft",
        helper: linkedInProfile.helperNote,
        structure: linkedInProfile.structure,
        generatedValue: currentSignal.linkedInDraft ?? "",
        finalValue: formState.finalLinkedInDraft,
        statusValue: formState.linkedInReviewStatus,
      },
      {
        key: "reddit" as const,
        label: "Reddit Draft",
        helper: redditProfile.helperNote,
        structure: redditProfile.structure,
        generatedValue: currentSignal.redditDraft ?? "",
        finalValue: formState.finalRedditDraft,
        statusValue: formState.redditReviewStatus,
      },
    ],
    [
      currentSignal.linkedInDraft,
      currentSignal.redditDraft,
      currentSignal.xDraft,
      formState.finalLinkedInDraft,
      formState.finalRedditDraft,
      formState.finalXDraft,
      formState.linkedInReviewStatus,
      formState.redditReviewStatus,
      formState.xReviewStatus,
      linkedInProfile.helperNote,
      linkedInProfile.structure,
      redditProfile.helperNote,
      redditProfile.structure,
      xProfile.helperNote,
      xProfile.structure,
    ],
  );
  const isDirty = useMemo(
    () => JSON.stringify(formState) !== JSON.stringify(savedState),
    [formState, savedState],
  );
  const founderVoiceEnabled = isFounderVoiceOn(founderVoiceMode);
  const reviewState = useMemo(
    () => {
      const previewSignal = {
        ...currentSignal,
        finalXDraft:
          formState.finalXDraft !== savedState.finalXDraft ? formState.finalXDraft.trim() || null : currentSignal.finalXDraft,
        finalLinkedInDraft:
          formState.finalLinkedInDraft !== savedState.finalLinkedInDraft
            ? formState.finalLinkedInDraft.trim() || null
            : currentSignal.finalLinkedInDraft,
        finalRedditDraft:
          formState.finalRedditDraft !== savedState.finalRedditDraft
            ? formState.finalRedditDraft.trim() || null
            : currentSignal.finalRedditDraft,
        xReviewStatus: formState.xReviewStatus !== savedState.xReviewStatus ? formState.xReviewStatus || null : currentSignal.xReviewStatus,
        linkedInReviewStatus:
          formState.linkedInReviewStatus !== savedState.linkedInReviewStatus
            ? formState.linkedInReviewStatus || null
            : currentSignal.linkedInReviewStatus,
        redditReviewStatus:
          formState.redditReviewStatus !== savedState.redditReviewStatus
            ? formState.redditReviewStatus || null
            : currentSignal.redditReviewStatus,
        finalReviewNotes:
          formState.finalReviewNotes !== savedState.finalReviewNotes
            ? formState.finalReviewNotes.trim() || null
            : currentSignal.finalReviewNotes,
        imagePrompt: formState.imagePrompt !== savedState.imagePrompt ? formState.imagePrompt.trim() || null : currentSignal.imagePrompt,
        videoScript: formState.videoScript !== savedState.videoScript ? formState.videoScript.trim() || null : currentSignal.videoScript,
        assetBundleJson:
          formState.assetBundleJson !== savedState.assetBundleJson ? formState.assetBundleJson.trim() || null : currentSignal.assetBundleJson,
        preferredAssetType:
          formState.preferredAssetType !== savedState.preferredAssetType ? formState.preferredAssetType || null : currentSignal.preferredAssetType,
        selectedImageAssetId:
          formState.selectedImageAssetId !== savedState.selectedImageAssetId
            ? formState.selectedImageAssetId.trim() || null
            : currentSignal.selectedImageAssetId,
        selectedVideoConceptId:
          formState.selectedVideoConceptId !== savedState.selectedVideoConceptId
            ? formState.selectedVideoConceptId.trim() || null
            : currentSignal.selectedVideoConceptId,
        generatedImageUrl:
          formState.generatedImageUrl !== savedState.generatedImageUrl
            ? formState.generatedImageUrl.trim() || null
            : currentSignal.generatedImageUrl,
        repurposingBundleJson:
          formState.repurposingBundleJson !== savedState.repurposingBundleJson
            ? formState.repurposingBundleJson.trim() || null
            : currentSignal.repurposingBundleJson,
        publishPrepBundleJson:
          formState.publishPrepBundleJson !== savedState.publishPrepBundleJson
            ? formState.publishPrepBundleJson.trim() || null
            : currentSignal.publishPrepBundleJson,
        selectedRepurposedOutputIdsJson:
          formState.selectedRepurposedOutputIdsJson !== savedState.selectedRepurposedOutputIdsJson
            ? formState.selectedRepurposedOutputIdsJson.trim() || null
            : currentSignal.selectedRepurposedOutputIdsJson,
      };

      return {
        reviewSummary: buildFinalReviewSummary(previewSignal),
        completeness: evaluateApprovalPackageCompleteness({
          signal: previewSignal,
          guidanceConfidenceLevel,
        }),
      };
    },
    [currentSignal, formState, guidanceConfidenceLevel, savedState],
  );
  const postingSummary = useMemo(
    () => buildSignalPostingSummary(currentSignal, postingEntries),
    [currentSignal, postingEntries],
  );
  const activeNarrativeStep = narrativeSequenceSteps?.[activeDraftPlatform] ?? null;
  const assetBundle = useMemo(() => parseAssetBundle(formState.assetBundleJson), [formState.assetBundleJson]);
  const primaryImageAsset = useMemo(
    () => getAssetPrimaryImage(assetBundle, formState.selectedImageAssetId || null),
    [assetBundle, formState.selectedImageAssetId],
  );
  const primaryVideoConcept = useMemo(
    () => getAssetPrimaryVideo(assetBundle, formState.selectedVideoConceptId || null),
    [assetBundle, formState.selectedVideoConceptId],
  );
  const repurposingBundle = useMemo(
    () => parseRepurposingBundle(formState.repurposingBundleJson),
    [formState.repurposingBundleJson],
  );
  const publishPrepBundle = useMemo(
    () => parsePublishPrepBundle(formState.publishPrepBundleJson),
    [formState.publishPrepBundleJson],
  );
  const selectedRepurposedOutputIds = useMemo(
    () => parseSelectedRepurposedOutputIds(formState.selectedRepurposedOutputIdsJson),
    [formState.selectedRepurposedOutputIdsJson],
  );
  const repurposingSummary = useMemo(
    () => buildRepurposingBundleSummary(repurposingBundle),
    [repurposingBundle],
  );
  const publishPrepSummary = useMemo(
    () => buildPublishPrepBundleSummary(publishPrepBundle),
    [publishPrepBundle],
  );
  const latestAutoRepair = useMemo(() => getLatestAutoRepairEntry(currentSignal), [currentSignal]);
  const activeTopSuggestion = useMemo(
    () => editSuggestions[activeDraftPlatform]?.[0] ?? null,
    [activeDraftPlatform, editSuggestions],
  );
  const activePlatformPackage = useMemo(
    () => getPublishPrepPackageForPlatform(publishPrepBundle, activeDraftPlatform),
    [activeDraftPlatform, publishPrepBundle],
  );
  const activePlatformDiff = useMemo(
    () =>
      buildDraftDiffSummary(
        activeDraftPlatform === "x"
          ? currentSignal.xDraft ?? ""
          : activeDraftPlatform === "linkedin"
            ? currentSignal.linkedInDraft ?? ""
            : currentSignal.redditDraft ?? "",
        activeDraftPlatform === "x"
          ? formState.finalXDraft
          : activeDraftPlatform === "linkedin"
            ? formState.finalLinkedInDraft
            : formState.finalRedditDraft,
      ),
    [activeDraftPlatform, currentSignal.linkedInDraft, currentSignal.redditDraft, currentSignal.xDraft, formState.finalLinkedInDraft, formState.finalRedditDraft, formState.finalXDraft],
  );

  function updateField<K extends keyof ReviewFormState>(key: K, value: ReviewFormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function updateDraftForPlatform(
    platform: PostingPlatform,
    updater: (currentValue: string) => string,
  ) {
    setFormState((current) => {
      if (platform === "x") {
        return { ...current, finalXDraft: updater(current.finalXDraft) };
      }
      if (platform === "linkedin") {
        return { ...current, finalLinkedInDraft: updater(current.finalLinkedInDraft) };
      }
      return { ...current, finalRedditDraft: updater(current.finalRedditDraft) };
    });
  }

  function appendReviewNote(text: string) {
    setFormState((current) => ({
      ...current,
      finalReviewNotes: appendReviewMacroNote(current.finalReviewNotes, text),
    }));
  }

  function recordAppliedMacro(macroId: ReviewMacroId, platform: PostingPlatform) {
    setAppliedReviewMacros((current) => [
      ...current.filter((entry) => !(entry.macroId === macroId && entry.platform === platform)),
      {
        macroId,
        platform,
        appliedAt: new Date().toISOString(),
      },
    ]);
  }

  const setReviewStatusForPlatform = useCallback((platform: PostingPlatform, value: ReviewFormState["xReviewStatus"]) => {
    setActiveDraftPlatform(platform);
    setFormState((current) => {
      if (platform === "x") {
        return { ...current, xReviewStatus: value };
      }
      if (platform === "linkedin") {
        return { ...current, linkedInReviewStatus: value };
      }
      return { ...current, redditReviewStatus: value };
    });
  }, []);

  const applyEditSuggestion = useCallback((suggestion: EditSuggestionOption) => {
    const currentValue =
      suggestion.platform === "x"
        ? formState.finalXDraft
        : suggestion.platform === "linkedin"
          ? formState.finalLinkedInDraft
          : formState.finalRedditDraft;
    const nextValue = applyEditSuggestionTransform(currentValue, suggestion.patternType);
    if (nextValue === currentValue) {
      setFeedback({
        tone: "warning",
        title: "Suggestion left draft unchanged",
        body: "This suggestion did not find a safe, explainable edit to apply to the current draft.",
      });
      return;
    }

    setFormState((current) => {
      if (suggestion.platform === "x") {
        return { ...current, finalXDraft: nextValue };
      }
      if (suggestion.platform === "linkedin") {
        return { ...current, finalLinkedInDraft: nextValue };
      }
      return { ...current, finalRedditDraft: nextValue };
    });
    setAppliedEditSuggestions((current) => {
      const next = current.filter((entry) => entry.key !== suggestion.key);
      next.push({
        key: suggestion.key,
        platform: suggestion.platform,
        patternType: suggestion.patternType,
        label: suggestion.label,
      });
      return next;
    });
    setFeedback({
      tone: "success",
      title: "Suggestion applied",
      body: `${suggestion.label} updated the ${getPostingPlatformLabel(suggestion.platform)} draft. Review the edit before saving.`,
    });
  }, [formState.finalLinkedInDraft, formState.finalRedditDraft, formState.finalXDraft]);

  const applyFirstSuggestionForPlatform = useCallback((platform: PostingPlatform) => {
    const suggestion = editSuggestions[platform][0];
    if (!suggestion) {
      setFeedback({
        tone: "warning",
        title: "No suggestion available",
      body: `No learned edit suggestion is currently available for ${getPostingPlatformLabel(platform)}.`,
      });
      return;
    }

    applyEditSuggestion(suggestion);
  }, [applyEditSuggestion, editSuggestions]);

  function handleConflictHoldForFix() {
    setReviewStatusForPlatform(activeDraftPlatform, "needs_edit");
    setFeedback({
      tone: "warning",
      title: "Held for package fix",
      body: `${getPostingPlatformLabel(activeDraftPlatform)} was marked needs edit so the conflict can be resolved before approval.`,
    });
  }

  function handleConflictSoftenCta() {
    const currentValue =
      activeDraftPlatform === "x"
        ? formState.finalXDraft
        : activeDraftPlatform === "linkedin"
          ? formState.finalLinkedInDraft
          : formState.finalRedditDraft;
    const nextValue = softenCtaText(currentValue);

    if (nextValue !== currentValue) {
      if (activeDraftPlatform === "x") {
        updateField("finalXDraft", nextValue);
      } else if (activeDraftPlatform === "linkedin") {
        updateField("finalLinkedInDraft", nextValue);
      } else {
        updateField("finalRedditDraft", nextValue);
      }
    }

    if (activePlatformPackage?.id) {
      const softenedCta = softenCtaText(getSelectedCtaText(activePlatformPackage) ?? activePlatformPackage.primaryCta ?? "");
      updatePublishPrepPackage(activePlatformPackage.id, {
        primaryCta: softenedCta || activePlatformPackage.primaryCta,
      });
    }

    setFeedback({
      tone: "success",
      title: "CTA softened",
      body: `Softened the ${getPostingPlatformLabel(activeDraftPlatform)} CTA language in the focused draft and publish prep package.`,
    });
  }

  function handleConflictSwitchDestination() {
    if (!activePlatformPackage?.id || activePlatformPackage.linkVariants.length < 2) {
      setFeedback({
        tone: "warning",
        title: "No alternate destination",
        body: "This package does not currently have another saved destination variant to switch to.",
      });
      return;
    }

    const currentIndex = activePlatformPackage.linkVariants.findIndex(
      (variant) => variant.siteLinkId === activePlatformPackage.siteLinkId,
    );
    const nextVariant =
      activePlatformPackage.linkVariants[
        currentIndex >= 0
          ? (currentIndex + 1) % activePlatformPackage.linkVariants.length
          : 1
      ];

    updatePublishPrepPackage(activePlatformPackage.id, {
      siteLinkId: nextVariant.siteLinkId ?? null,
      siteLinkLabel: nextVariant.destinationLabel ?? nextVariant.label,
      siteLinkReason: `Switched during conflict review from ${activePlatformPackage.siteLinkLabel ?? "current destination"} to ${nextVariant.destinationLabel ?? nextVariant.label}.`,
    });
    setFeedback({
      tone: "success",
      title: "Destination switched",
      body: `Switched the focused package destination to ${nextVariant.destinationLabel ?? nextVariant.label}. Save when the rest of the package looks aligned.`,
    });
  }

  function applyFounderVoiceToActiveDraft() {
    const currentValue =
      activeDraftPlatform === "x"
        ? formState.finalXDraft
        : activeDraftPlatform === "linkedin"
          ? formState.finalLinkedInDraft
          : formState.finalRedditDraft;
    const nextValue = applyFounderVoiceToText(currentValue, "founder_voice_on");

    updateDraftForPlatform(activeDraftPlatform, () => nextValue);
    setFounderVoiceMode("founder_voice_on");
    setFounderVoiceAppliedAt(new Date().toISOString());
    appendReviewNote(`Applied founder voice pass to ${getPostingPlatformLabel(activeDraftPlatform)}.`);
    setFeedback({
      tone: nextValue === currentValue ? "warning" : "success",
      title: nextValue === currentValue ? "Founder voice already close" : "Founder voice rewrite staged",
      body:
        nextValue === currentValue
          ? `${getPostingPlatformLabel(activeDraftPlatform)} was already close to the founder voice constraints, so only the mode flag and review note were staged.`
          : `${getPostingPlatformLabel(activeDraftPlatform)} was rewritten into the calmer founder voice. Review the visible edit, then save if it still fits.`,
    });
  }

  function applyReviewMacro(macroId: ReviewMacroId) {
    const platformLabel = getPostingPlatformLabel(activeDraftPlatform);

    switch (macroId) {
      case "approve_keep_package":
        setReviewStatusForPlatform(activeDraftPlatform, "ready");
        recordAppliedMacro(macroId, activeDraftPlatform);
        setFeedback({
          tone: "success",
          title: "Approve and keep package staged",
          body: `${platformLabel} is marked ready with the current package unchanged. Save to persist the macro decision.`,
        });
        return;
      case "approve_soften_cta":
        handleConflictSoftenCta();
        setReviewStatusForPlatform(activeDraftPlatform, "ready");
        recordAppliedMacro(macroId, activeDraftPlatform);
        setFeedback({
          tone: "success",
          title: "Approve but soften CTA staged",
          body: `${platformLabel} CTA language was softened and the draft is marked ready. Review the edit, then save.`,
        });
        return;
      case "hold_for_destination_fix":
        handleConflictHoldForFix();
        appendReviewNote(`Hold ${platformLabel} for destination fix.`);
        recordAppliedMacro(macroId, activeDraftPlatform);
        setFeedback({
          tone: "warning",
          title: "Hold for destination fix staged",
          body: `${platformLabel} is marked needs edit and a destination-fix note was added. Save to persist it.`,
        });
        return;
      case "convert_to_experiment":
        setReviewStatusForPlatform(activeDraftPlatform, "needs_edit");
        appendReviewNote(`Convert ${platformLabel} into an experiment instead of forcing final approval.`);
        recordAppliedMacro(macroId, activeDraftPlatform);
        setFeedback({
          tone: "warning",
          title: "Convert to experiment staged",
          body: `${platformLabel} is marked needs edit and experiment intent was added to the review note. Save, then open experiments to create the test.`,
        });
        return;
      case "evergreen_later":
        setReviewStatusForPlatform(activeDraftPlatform, "skip");
        appendReviewNote(`Keep ${platformLabel} as an evergreen-later candidate.`);
        recordAppliedMacro(macroId, activeDraftPlatform);
        setFeedback({
          tone: "warning",
          title: "Evergreen later staged",
          body: `${platformLabel} is marked skip for this cycle and tagged for later reuse in the review note. Save to persist the decision.`,
        });
        return;
      case "approve_with_safe_tone": {
        const currentValue =
          activeDraftPlatform === "x"
            ? formState.finalXDraft
            : activeDraftPlatform === "linkedin"
              ? formState.finalLinkedInDraft
              : formState.finalRedditDraft;
        const nextValue = softenToneText(currentValue);
        updateDraftForPlatform(activeDraftPlatform, () => nextValue);
        setReviewStatusForPlatform(activeDraftPlatform, "ready");
        recordAppliedMacro(macroId, activeDraftPlatform);
        setFeedback({
          tone: "success",
          title: "Approve with safer tone staged",
          body:
            nextValue === currentValue
              ? `${platformLabel} was already fairly restrained, so the macro only marked it ready. Save if that still fits the decision.`
              : `${platformLabel} tone was softened and the draft is marked ready. Review the phrasing, then save.`,
        });
        return;
      }
      default:
        return;
    }
  }

  async function handleUsePlaybookPack(match: PlaybookPackMatch) {
    try {
      await fetch("/api/playbook-packs/use", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          packId: match.pack.packId,
          signalId: currentSignal.recordId,
          context: "review",
        }),
      });
    } catch {
      // Best-effort audit only.
    }

    appendReviewNote(`Referenced reusable playbook pack: ${match.pack.name}.`);
    setFeedback({
      tone: "success",
      title: "Playbook pack referenced",
      body: `${match.pack.name} was added to the review note as a reusable structure hint. Save to persist it.`,
    });
  }

  function updateAssetBundle(mutator: (bundle: AssetBundle) => AssetBundle) {
    setFormState((current) => {
      const bundle = parseAssetBundle(current.assetBundleJson);
      if (!bundle) {
        return current;
      }

      return {
        ...current,
        assetBundleJson: stringifyAssetBundle(mutator(bundle)) ?? "",
      };
    });
  }

  function updateRepurposingBundle(mutator: (bundle: RepurposingBundle) => RepurposingBundle) {
    setFormState((current) => {
      const bundle = parseRepurposingBundle(current.repurposingBundleJson);
      if (!bundle) {
        return current;
      }

      const nextBundle = mutator(bundle);
      const selectedIds = parseSelectedRepurposedOutputIds(current.selectedRepurposedOutputIdsJson).filter((id) =>
        nextBundle.outputs.some((output) => output.id === id),
      );

      return {
        ...current,
        repurposingBundleJson: stringifyRepurposingBundle(nextBundle) ?? "",
        selectedRepurposedOutputIdsJson: stringifySelectedRepurposedOutputIds(selectedIds) ?? "",
      };
    });
  }

  function updatePublishPrepBundle(mutator: (bundle: PublishPrepBundle) => PublishPrepBundle) {
    setFormState((current) => {
      const bundle = parsePublishPrepBundle(current.publishPrepBundleJson);
      if (!bundle) {
        return current;
      }

      return {
        ...current,
        publishPrepBundleJson: stringifyPublishPrepBundle(mutator(bundle)) ?? "",
      };
    });
  }

  function toggleRepurposedOutput(outputId: string) {
    const nextIds = selectedRepurposedOutputIds.includes(outputId)
      ? selectedRepurposedOutputIds.filter((id) => id !== outputId)
      : [...selectedRepurposedOutputIds, outputId];
    updateField("selectedRepurposedOutputIdsJson", stringifySelectedRepurposedOutputIds(nextIds) ?? "");
  }

  function updateRepurposedOutput(outputId: string, patch: Partial<RepurposedOutput>) {
    updateRepurposingBundle((bundle) => ({
      ...bundle,
      outputs: bundle.outputs.map((output) => (output.id === outputId ? { ...output, ...patch } : output)),
    }));
  }

  function removeRepurposedOutput(outputId: string) {
    updateRepurposingBundle((bundle) => ({
      ...bundle,
      outputs: bundle.outputs.filter((output) => output.id !== outputId),
      recommendedSubset: (bundle.recommendedSubset ?? []).filter((id) => id !== outputId),
    }));
    updatePublishPrepBundle((bundle) => ({
      ...bundle,
      packages: bundle.packages.filter((pkg) => pkg.targetId !== outputId),
    }));
  }

  function updatePublishPrepPackage(packageId: string, patch: Partial<PublishPrepPackage>) {
    updatePublishPrepBundle((bundle) => ({
      ...bundle,
      packages: bundle.packages.map((pkg) => (pkg.id === packageId ? { ...pkg, ...patch } : pkg)),
    }));
  }

  function applyHookVariant(packageId: string, hookId: string) {
    const pkg = publishPrepBundle?.packages.find((entry) => entry.id === packageId);
    const variant = pkg?.hookVariants.find((entry) => entry.id === hookId);
    if (!pkg || !variant) {
      return;
    }

    updatePublishPrepPackage(packageId, {
      selectedHookId: hookId,
      primaryHook: variant.text,
    });
  }

  function applyCtaVariant(packageId: string, ctaId: string) {
    const pkg = publishPrepBundle?.packages.find((entry) => entry.id === packageId);
    const variant = pkg?.ctaVariants.find((entry) => entry.id === ctaId);
    if (!pkg || !variant) {
      return;
    }

    updatePublishPrepPackage(packageId, {
      selectedCtaId: ctaId,
      primaryCta: variant.text,
    });
  }

  function handleHookEdit(packageId: string, value: string) {
    const pkg = publishPrepBundle?.packages.find((entry) => entry.id === packageId);
    if (!pkg) {
      return;
    }

    updatePublishPrepPackage(packageId, {
      primaryHook: value,
      hookVariants: pkg.hookVariants.map((variant) =>
        variant.id === pkg.selectedHookId ? { ...variant, text: value } : variant,
      ),
    });
  }

  function handleCtaEdit(packageId: string, value: string) {
    const pkg = publishPrepBundle?.packages.find((entry) => entry.id === packageId);
    if (!pkg) {
      return;
    }

    updatePublishPrepPackage(packageId, {
      primaryCta: value,
      ctaVariants: pkg.ctaVariants.map((variant) =>
        variant.id === pkg.selectedCtaId ? { ...variant, text: value } : variant,
      ),
    });
  }

  function handleImageSelection(imageAssetId: string) {
    updateField("selectedImageAssetId", imageAssetId);
    const selected = assetBundle?.imageAssets.find((asset) => asset.id === imageAssetId);
    if (selected) {
      updateField("imagePrompt", selected.imagePrompt);
    }
  }

  function handleVideoSelection(videoConceptId: string) {
    updateField("selectedVideoConceptId", videoConceptId);
    const selected = assetBundle?.videoConcepts.find((concept) => concept.id === videoConceptId);
    if (selected) {
      updateField("videoScript", selected.scriptShort);
    }
  }

  function handleImagePromptEdit(value: string) {
    updateField("imagePrompt", value);
    if (!formState.selectedImageAssetId) {
      return;
    }

    updateAssetBundle((bundle) => ({
      ...bundle,
      imageAssets: bundle.imageAssets.map((asset) =>
        asset.id === formState.selectedImageAssetId ? { ...asset, imagePrompt: value } : asset,
      ),
    }));
  }

  function handleVideoScriptEdit(value: string) {
    updateField("videoScript", value);
    if (!formState.selectedVideoConceptId) {
      return;
    }

    updateAssetBundle((bundle) => ({
      ...bundle,
      videoConcepts: bundle.videoConcepts.map((concept) =>
        concept.id === formState.selectedVideoConceptId ? { ...concept, scriptShort: value } : concept,
      ),
    }));
  }

  function handleGenerateImagePlaceholder() {
    if (!formState.selectedImageAssetId) {
      return;
    }

    updateField("generatedImageUrl", buildGeneratedImagePlaceholderUrl(currentSignal.recordId, formState.selectedImageAssetId));
    setFeedback({
      tone: "warning",
      title: "Placeholder image generated",
      body: "A mock generated-image reference was attached so the preferred visual can travel with final review.",
    });
  }

  function updatePostingField(platform: PostingPlatform, key: keyof PostingFormState, value: string) {
    setPostingForms((current) => ({
      ...current,
      [platform]: {
        ...current[platform],
        [key]: value,
      },
    }));
  }

  const openPostingForm = useCallback((platform: PostingPlatform) => {
    const latestEntry = postingEntries.find((entry) => entry.platform === platform) ?? null;
    setPostingForms((current) => ({
      ...current,
      [platform]: createPostingFormState(currentSignal, platform, latestEntry),
    }));
    setActiveDraftPlatform(platform);
    setActivePostingPlatform((current) => (current === platform ? null : platform));
  }, [currentSignal, postingEntries]);

  const handleSave = useCallback(async () => {
    setFeedback(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/signals/${currentSignal.recordId}/review`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          finalXDraft: formState.finalXDraft,
          finalLinkedInDraft: formState.finalLinkedInDraft,
          finalRedditDraft: formState.finalRedditDraft,
          xReviewStatus: formState.xReviewStatus || null,
          linkedInReviewStatus: formState.linkedInReviewStatus || null,
          redditReviewStatus: formState.redditReviewStatus || null,
          finalReviewNotes: formState.finalReviewNotes,
          imagePrompt: formState.imagePrompt,
          videoScript: formState.videoScript,
          assetBundleJson: formState.assetBundleJson || null,
          preferredAssetType: formState.preferredAssetType || null,
          selectedImageAssetId: formState.selectedImageAssetId || null,
          selectedVideoConceptId: formState.selectedVideoConceptId || null,
          generatedImageUrl: formState.generatedImageUrl || null,
          repurposingBundleJson: formState.repurposingBundleJson || null,
          publishPrepBundleJson: formState.publishPrepBundleJson || null,
          selectedRepurposedOutputIdsJson: formState.selectedRepurposedOutputIdsJson || null,
          evergreenCandidateId: evergreenContext?.id ?? null,
          appliedEditSuggestions,
          appliedReviewMacros,
          founderVoiceMode,
          founderVoiceAppliedAt,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        source?: SignalDataSource;
        signal?: SignalRecord | null;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.success || !data.signal) {
        throw new Error(data.error ?? "Unable to save final review.");
      }

      const nextState = createFormState(data.signal);
      setCurrentSignal(data.signal);
      setFormState(nextState);
      setSavedState(nextState);
      setFounderVoiceMode(data.signal.founderVoiceMode ?? "founder_voice_on");
      setFounderVoiceAppliedAt(data.signal.founderVoiceAppliedAt ?? null);
      setAppliedEditSuggestions([]);
      setAppliedReviewMacros([]);
      setFeedback({
        tone: data.source === "airtable" ? "success" : "warning",
        title: data.source === "airtable" ? "Saved to Airtable" : "Saved in mock mode",
        body: data.message ?? "Final review saved.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Save failed",
        body: error instanceof Error ? error.message : "Unable to save final review.",
      });
    } finally {
      setIsSaving(false);
    }
  }, [appliedEditSuggestions, appliedReviewMacros, currentSignal.recordId, evergreenContext?.id, formState, founderVoiceAppliedAt, founderVoiceMode]);

  async function handlePostingSave(platform: PostingPlatform) {
    setFeedback(null);
    setIsPosting(true);

    try {
      const form = postingForms[platform];
      const response = await fetch(`/api/signals/${currentSignal.recordId}/posting-log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform,
          postedAt: form.postedAt,
          finalPostedText: form.finalPostedText,
          postUrl: form.postUrl,
          note: form.note,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        entry?: PostingLogEntry | null;
        entries?: PostingLogEntry[];
        signal?: SignalRecord | null;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.success || !data.entry || !Array.isArray(data.entries)) {
        throw new Error(data.error ?? "Unable to log posted draft.");
      }

      setPostingEntries(data.entries);
      if (data.signal) {
        setCurrentSignal(data.signal);
      }
      setActivePostingPlatform(null);
      setFeedback({
        tone: "success",
        title: "Post logged",
        body: data.message ?? `${getPostingPlatformLabel(platform)} post recorded.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Posting log failed",
        body: error instanceof Error ? error.message : "Unable to save posting log.",
      });
    } finally {
      setIsPosting(false);
    }
  }

  async function handleStageForPosting(platform: PostingPlatform) {
    setFeedback(null);
    setIsPosting(true);

    try {
      const finalCaption =
        platform === "x"
          ? formState.finalXDraft
          : platform === "linkedin"
            ? formState.finalLinkedInDraft
            : formState.finalRedditDraft;
      const response = await fetch("/api/posting-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "stage_package",
          signalId: currentSignal.recordId,
          platform,
          finalCaption,
          publishPrepBundleJson: formState.publishPrepBundleJson,
          assetBundleJson: formState.assetBundleJson,
          preferredAssetType: formState.preferredAssetType || null,
          selectedImageAssetId: formState.selectedImageAssetId || null,
          selectedVideoConceptId: formState.selectedVideoConceptId || null,
          generatedImageUrl: formState.generatedImageUrl || null,
          readinessReason: `Final ${getPostingPlatformLabel(platform)} package staged from final review for manual posting confirmation.`,
        }),
      });

      const data = (await response.json().catch(() => null)) as PostingAssistantActionResponse | null;
      if (!response.ok || !data?.success) {
        throw new Error(data?.error ?? "Unable to stage posting package.");
      }

      setFeedback({
        tone: "success",
        title: "Posting package staged",
        body: `${data.message} Open the posting assistant when you are ready to copy and confirm the manual post.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Unable to stage package",
        body: error instanceof Error ? error.message : "Unable to stage posting package.",
      });
    } finally {
      setIsPosting(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        void handleSave();
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      const activeIndex = draftPanels.findIndex((panel) => panel.key === activeDraftPlatform);
      const nextIndex =
        activeIndex < 0
          ? 0
          : key === "]"
            ? (activeIndex + 1) % draftPanels.length
            : key === "["
              ? (activeIndex - 1 + draftPanels.length) % draftPanels.length
              : activeIndex;

      if (key === "?") {
        event.preventDefault();
        setShowShortcutHelp((current) => !current);
        return;
      }

      if (key === "e") {
        event.preventDefault();
        setShowSupportDetail((current) => !current);
        return;
      }

      if (key === "1") {
        event.preventDefault();
        setActiveDraftPlatform("x");
        return;
      }

      if (key === "2") {
        event.preventDefault();
        setActiveDraftPlatform("linkedin");
        return;
      }

      if (key === "3") {
        event.preventDefault();
        setActiveDraftPlatform("reddit");
        return;
      }

      if (key === "[" || key === "]") {
        event.preventDefault();
        setActiveDraftPlatform(draftPanels[nextIndex]?.key ?? "linkedin");
        return;
      }

      if (key === "a") {
        event.preventDefault();
        setReviewStatusForPlatform(activeDraftPlatform, "ready");
        return;
      }

      if (key === "h") {
        event.preventDefault();
        setReviewStatusForPlatform(activeDraftPlatform, "needs_edit");
        return;
      }

      if (key === "g") {
        event.preventDefault();
        applyFirstSuggestionForPlatform(activeDraftPlatform);
        return;
      }

      if (key === "j" && navigation?.nextHref) {
        event.preventDefault();
        window.location.href = navigation.nextHref;
        return;
      }

      if (key === "k" && navigation?.previousHref) {
        event.preventDefault();
        window.location.href = navigation.previousHref;
        return;
      }

      if (key === "p") {
        event.preventDefault();
        openPostingForm(activeDraftPlatform);
        return;
      }

      if (key === "x") {
        event.preventDefault();
        window.location.href = "/experiments";
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeDraftPlatform,
    applyFirstSuggestionForPlatform,
    draftPanels,
    handleSave,
    navigation,
    openPostingForm,
    setReviewStatusForPlatform,
  ]);

  return (
    <div className="space-y-6 pb-36">
      <Card>
        <CardHeader>
          <CardTitle>Final Review Workspace</CardTitle>
          <CardDescription>
            Compare platform drafts, make final edits, and record which outputs are ready, need more work, or should be skipped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Review readiness</p>
              <p className="mt-2 text-sm font-medium text-slate-950">{reviewState.reviewSummary.summary}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Ready now</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{reviewState.reviewSummary.readyCount}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Needs edit</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{reviewState.reviewSummary.needsEditCount}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Skipped</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{reviewState.reviewSummary.skipCount}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <ReviewStateBadge tone={reviewState.reviewSummary.readyCount > 0 ? "ready" : "neutral"}>
                    {reviewState.reviewSummary.readyCount} ready
                  </ReviewStateBadge>
                  <ReviewStateBadge tone={reviewState.completeness.completenessState === "complete" ? "complete" : reviewState.completeness.completenessState === "mostly_complete" ? "mostly_complete" : "partial"}>
                    {reviewState.completeness.completenessState.replaceAll("_", " ")}
                  </ReviewStateBadge>
                  <ReviewStateBadge tone={automationConfidenceTone(automationConfidence.level)}>
                    {automationConfidence.summary}
                  </ReviewStateBadge>
                  {conversionIntent ? (
                    <ReviewStateBadge tone={conversionIntent.posture === "direct_conversion" ? "high_value" : conversionIntent.posture === "soft_conversion" ? "medium_value" : "neutral"}>
                      {conversionIntentLabel(conversionIntent.posture)}
                    </ReviewStateBadge>
                  ) : null}
                  <ReviewStateBadge tone={founderVoiceEnabled ? "high_confidence" : "neutral"}>
                    {founderVoiceEnabled ? FOUNDER_VOICE_LABEL : "Founder voice off"}
                  </ReviewStateBadge>
                  {packageAutofillNotes && packageAutofillNotes.length > 0 ? (
                    <ReviewStateBadge tone="autofill">
                      {packageAutofillNotes.length} {packageAutofillMode === "suggested" ? "autofill suggestions" : "autofill notes"}
                    </ReviewStateBadge>
                  ) : null}
                  {experimentContexts && experimentContexts.length > 0 ? (
                    <ReviewStateBadge tone="experiment">{experimentContexts.length} experiments</ReviewStateBadge>
                  ) : null}
                  {activePlatformDiff.changed ? (
                    <ReviewStateBadge tone="medium_confidence">{activePlatformDiff.changedWordCount} changed words</ReviewStateBadge>
                  ) : (
                    <ReviewStateBadge tone="neutral">No edits yet</ReviewStateBadge>
                  )}
                </div>
                <p>
                  Active platform: <span className="font-medium text-slate-900">{getPostingPlatformLabel(activeDraftPlatform)}</span>.
                  {activeTopSuggestion ? ` Top suggestion ready: ${activeTopSuggestion.label}.` : " No suggestion is queued for this draft right now."}
                </p>
                <p className="text-xs text-slate-500">
                  {automationConfidence.reasons[0] ?? automationConfidence.summary}
                </p>
                {conversionIntent?.whyChosen[0] ? (
                  <p className="text-xs text-slate-500">{conversionIntent.whyChosen[0]}</p>
                ) : null}
                <p className="text-xs text-slate-500">
                  {getFounderVoiceModeLabel(founderVoiceMode)}
                  {founderVoiceAppliedAt ? ` · last applied ${formatDateTime(founderVoiceAppliedAt)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowSupportDetail((current) => !current)}
                  className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-200"
                >
                  {showSupportDetail ? "Collapse detail" : "Expand detail"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowShortcutHelp((current) => !current)}
                  className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-200"
                >
                  {showShortcutHelp ? "Hide shortcuts" : "Show shortcuts"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">Founder voice</p>
                <p className="mt-1">
                  Calm authority. Teacher empathy. Trust-first language. This pass keeps the draft away from hype without flattening the platform fit.
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={applyFounderVoiceToActiveDraft}>
                Rewrite in founder voice
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ReviewStateBadge tone={founderVoiceEnabled ? "high_confidence" : "neutral"}>
                {getFounderVoiceModeLabel(founderVoiceMode)}
              </ReviewStateBadge>
              <Badge className="bg-white/90 text-slate-700 ring-slate-200">short sentences</Badge>
              <Badge className="bg-white/90 text-slate-700 ring-slate-200">low hype</Badge>
              <Badge className="bg-white/90 text-slate-700 ring-slate-200">teacher-first</Badge>
            </div>
          </div>

          <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-medium text-slate-900">Review macros</p>
                <p className="mt-1">
                  One-click decisions for the focused draft. Macros change visible state immediately, but nothing persists until you save.
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {automationConfidence.allowMacroSuggestions
                    ? automationConfidence.level === "high"
                      ? "This package is in the high-confidence lane, so macro suggestions are safe accelerators."
                      : "This package is in the medium-confidence lane, so macros stay suggestive rather than automatic."
                    : "This package is in the low-confidence lane. Macros remain available, but use direct judgement before applying them."}
                </p>
              </div>
              {appliedReviewMacros.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {appliedReviewMacros.map((macro) => (
                    <ReviewStateBadge key={`${macro.macroId}:${macro.platform}:${macro.appliedAt}`} tone="neutral">
                      {REVIEW_MACROS.find((entry) => entry.macroId === macro.macroId)?.label ?? macro.macroId}
                    </ReviewStateBadge>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {REVIEW_MACROS.map((macro) => (
                <div key={macro.macroId} className="rounded-2xl border border-black/8 bg-slate-50/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{macro.label}</p>
                      <p className="mt-1 text-sm text-slate-600">{macro.description}</p>
                    </div>
                    <Button type="button" variant={macro.macroId === "approve_keep_package" ? "primary" : "secondary"} size="sm" onClick={() => applyReviewMacro(macro.macroId)}>
                      Apply
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {formatReviewMacroActions(macro.actions).map((action) => (
                      <Badge key={`${macro.macroId}:${action}`} className="bg-white/90 text-slate-700 ring-slate-200">
                        {action}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {playbookPackMatches && playbookPackMatches.length > 0 ? (
            <PlaybookPackSuggestions
              title="Reusable playbook packs"
              description="Repeated winners promoted into compact review-stage reuse hints. Reference one when the current package matches a proven structure."
              matches={playbookPackMatches}
              onUse={handleUsePlaybookPack}
            />
          ) : null}

          {showSupportDetail ? (
            <div className="space-y-5">

          <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">Approval package checklist</p>
                <p className="mt-1 text-xs text-slate-500">
                  {reviewState.completeness.completenessState.replaceAll("_", " ")} · score {reviewState.completeness.completenessScore}
                </p>
              </div>
              {reviewState.completeness.missingElements.length > 0 ? (
                <p className="text-xs text-slate-500">Missing: {reviewState.completeness.missingElements.join(" · ")}</p>
              ) : (
                <p className="text-xs text-emerald-700">No major package gaps detected.</p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {reviewState.completeness.checklist.map((item) => (
                <span
                  key={item.key}
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                    item.ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          {packageAutofillNotes && packageAutofillNotes.length > 0 ? (
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">
                {packageAutofillMode === "suggested" ? "Approval autopilot suggestions" : "Approval autopilot"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {packageAutofillMode === "suggested"
                  ? "Medium confidence only. These bounded package changes are suggested, not silently applied."
                  : packageAutofillMode === "blocked"
                    ? "Autofill is blocked in the current confidence lane."
                    : "High confidence allowed bounded package autofill before final review."}
              </p>
              <div className="mt-3 space-y-2">
                {packageAutofillNotes.slice(0, 4).map((note) => (
                  <div key={`${note.field}:${note.value}`} className="rounded-2xl bg-slate-50/80 px-3 py-3">
                    <p className="font-medium text-slate-900">
                      {note.label}: {note.value}
                    </p>
                    <p className="mt-2 text-slate-500">{note.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">Post hypothesis</p>
            <p className="mt-2">
              <span className="font-medium text-slate-900">Objective:</span> {hypothesis.objective}
            </p>
            <p className="mt-2">
              <span className="font-medium text-slate-900">Why it may work:</span> {hypothesis.whyItMayWork}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {hypothesis.keyLevers.map((lever) => (
                <span key={lever} className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {lever}
                </span>
              ))}
            </div>
            {hypothesis.riskNote ? <p className="mt-3 text-xs text-slate-500">Watch: {hypothesis.riskNote}</p> : null}
          </div>

          {experimentContexts && experimentContexts.length > 0 ? (
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Experiment context</p>
              <div className="mt-3 space-y-3">
                {experimentContexts.map((experiment) => (
                  <div key={`${experiment.name}:${experiment.variantLabels.join("|")}`} className="rounded-2xl bg-slate-50/80 px-3 py-3">
                    <p className="font-medium text-slate-900">
                      {experiment.name} · {experiment.statusLabel}
                    </p>
                    <p className="mt-2">Variants: {experiment.variantLabels.join(" · ")}</p>
                    {experiment.learningGoal ? <p className="mt-2 text-slate-500">Learning goal: {experiment.learningGoal}</p> : null}
                    {experiment.comparisonTarget ? <p className="mt-2 text-slate-500">Compare: {experiment.comparisonTarget}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">Posting memory</p>
            <p className="mt-2">{postingSummary.summary}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
              <span>{postingSummary.totalPosts} posts logged</span>
              <span>{postingSummary.postedPlatformsCount} platforms posted</span>
              {postingSummary.latestPostedAt ? <span>Latest {formatDateTime(postingSummary.latestPostedAt)}</span> : null}
            </div>
          </div>

          {weeklyPlanContext ? (
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Weekly plan context</p>
              <p className="mt-2">
                {weeklyPlanContext.summary}
                {weeklyPlanContext.theme ? ` Theme: ${weeklyPlanContext.theme}.` : ""}
              </p>
              <p className="mt-2 text-xs text-slate-500">Week: {weeklyPlanContext.weekLabel}</p>
              {weeklyPlanContext.boosts.length > 0 ? (
                <p className="mt-2 text-slate-500">Supports: {weeklyPlanContext.boosts.join(" · ")}</p>
              ) : null}
              {weeklyPlanContext.cautions.length > 0 ? (
                <p className="mt-2 text-slate-500">Watch: {weeklyPlanContext.cautions.join(" · ")}</p>
              ) : null}
            </div>
          ) : null}

          {activeNarrativeStep ? (
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <div className="flex flex-wrap items-center gap-2">
                <ReviewStateBadge tone="high_confidence">Narrative sequence</ReviewStateBadge>
                <ReviewStateBadge tone="neutral">
                  Step {activeNarrativeStep.stepNumber} of {activeNarrativeStep.totalSteps}
                </ReviewStateBadge>
                <ReviewStateBadge tone="neutral">
                  {activeNarrativeStep.roleLabel}
                </ReviewStateBadge>
              </div>
              <p className="mt-3 font-medium text-slate-900">{activeNarrativeStep.narrativeLabel}</p>
              <p className="mt-2">{activeNarrativeStep.rationale}</p>
              <p className="mt-2 text-slate-500">{activeNarrativeStep.sequenceReason}</p>
              <p className="mt-2 text-slate-500">{activeNarrativeStep.suggestedCadenceNotes}</p>
            </div>
          ) : null}

          {staleContext && (staleContext.state !== "fresh" || staleContext.operatorAction) ? (
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <div className="flex flex-wrap items-center gap-2">
                <ReviewStateBadge tone={staleContext.state === "aging" ? "aging" : staleContext.state === "stale_but_reusable" ? "stale_reusable" : "stale"}>
                  {staleStateLabel(staleContext.state)}
                </ReviewStateBadge>
                {staleContext.operatorAction ? (
                  <ReviewStateBadge tone={staleContext.operatorAction === "move_to_evergreen_later" ? "stale_reusable" : staleContext.operatorAction === "keep_anyway" ? "neutral" : "stale"}>
                    {staleOperatorActionLabel(staleContext.operatorAction)}
                  </ReviewStateBadge>
                ) : null}
              </div>
              <p className="mt-3 font-medium text-slate-900">Stale queue context</p>
              <p className="mt-2">{staleContext.summary}</p>
              {staleContext.suggestedRefreshNote ? (
                <p className="mt-2 text-slate-500">{staleContext.suggestedRefreshNote}</p>
              ) : null}
              {staleContext.reasons.length > 1 ? (
                <p className="mt-2 text-slate-500">
                  Also watch: {staleContext.reasons.slice(1, 3).map((reason) => reason.summary).join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}

          {conversionIntent ? (
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <div className="flex flex-wrap items-center gap-2">
                <ReviewStateBadge tone={conversionIntent.posture === "direct_conversion" ? "high_value" : conversionIntent.posture === "soft_conversion" ? "medium_value" : "neutral"}>
                  Conversion posture: {conversionIntentLabel(conversionIntent.posture)}
                </ReviewStateBadge>
              </div>
              <p className="mt-3 font-medium text-slate-900">Conversion-intent guidance</p>
              <p className="mt-2">{conversionIntent.whyChosen[0] ?? "No conversion-posture note surfaced."}</p>
              {conversionIntent.cautionNotes[0] ? (
                <p className="mt-2 text-slate-500">{conversionIntent.cautionNotes[0]}</p>
              ) : null}
            </div>
          ) : null}

          {conflicts && conflicts.topConflicts.length > 0 ? (
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <div className="flex flex-wrap items-center gap-2">
                <ReviewStateBadge tone={conflictTone(conflicts.highestSeverity ?? "low")}>
                  {conflicts.highestSeverity === "high" ? "high conflict" : conflicts.highestSeverity === "medium" ? "alignment caution" : "alignment note"}
                </ReviewStateBadge>
                {conflicts.requiresJudgement ? (
                  <ReviewStateBadge tone="aging">needs judgement</ReviewStateBadge>
                ) : null}
              </div>
              <p className="mt-3 font-medium text-slate-900">Conflict detector</p>
              <div className="mt-3 space-y-3">
                {conflicts.topConflicts.map((conflict) => (
                  <div key={`${conflict.conflictType}-${conflict.platform ?? "all"}`} className="rounded-2xl bg-slate-50/80 px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <ReviewStateBadge tone={conflictTone(conflict.severity)}>{conflict.severity} conflict</ReviewStateBadge>
                      <span className="font-medium text-slate-900">{conflictLabel(conflict.conflictType)}</span>
                    </div>
                    <p className="mt-2">{conflict.reason}</p>
                    {conflict.suggestedFix ? <p className="mt-2 text-slate-500">{conflict.suggestedFix}</p> : null}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={handleConflictHoldForFix}>
                  Hold for destination fix
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={handleConflictSoftenCta}>
                  Soften CTA
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={handleConflictSwitchDestination}>
                  Switch destination
                </Button>
                <Link href="/experiments" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Convert to experiment
                </Link>
              </div>
            </div>
          ) : null}

          {evergreenContext ? (
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Evergreen resurfacing</p>
              <p className="mt-2">
                Resurfaced from a prior {evergreenContext.surfacedPlatform === "linkedin" ? "LinkedIn" : evergreenContext.surfacedPlatform === "reddit" ? "Reddit" : "X"} post on{" "}
                {formatDateTime(evergreenContext.priorPostDate)}.
              </p>
              <p className="mt-2 text-slate-500">
                {evergreenContext.reuseMode === "reuse_directly" ? "Direct reuse is recommended." : "Adapt before reuse is recommended."}
              </p>
              <p className="mt-2 text-slate-500">
                {getOutcomeQualityLabel(evergreenContext.priorOutcomeQuality)} · {getReuseRecommendationLabel(evergreenContext.priorReuseRecommendation)}
                {evergreenContext.strategicValue ? ` · ${getStrategicValueLabel(evergreenContext.strategicValue)}` : ""}
              </p>
              <p className="mt-2 text-slate-500">
                {[...evergreenContext.reasons, ...evergreenContext.weeklyGapReasons].slice(0, 3).join(" · ")}
              </p>
            </div>
          ) : null}

          {latestAutoRepair ? (
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Auto-repair note</p>
              <p className="mt-2">{getAutoRepairLabel(latestAutoRepair)}</p>
              {latestAutoRepair.notes.length > 0 ? (
                <p className="mt-2 text-slate-500">{latestAutoRepair.notes.join(" · ")}</p>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
            Drafts are reviewed here with the current Scenario Angle, interpretation, optional applied pattern, editorial mode, and platform profile already in mind.
            {appliedPatternName ? ` Last applied pattern: ${appliedPatternName}.` : ""}
          </div>

          {assetBundle ? (
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Asset review</p>
              <p className="mt-2">
                Primary asset is currently {formState.preferredAssetType === "image" ? "image-first" : formState.preferredAssetType === "video" ? "video-first" : "text-first"}.
              </p>
              <p className="mt-2">
                Image concept: {primaryImageAsset?.conceptTitle ?? "Not selected"} · Video concept: {primaryVideoConcept?.conceptTitle ?? "Not selected"}
              </p>
            </div>
          ) : null}

          {repurposingBundle ? (
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Repurposing bundle</p>
              <p className="mt-2">
                Repurposed into {repurposingSummary?.count ?? repurposingBundle.outputs.length} variants with {repurposingSummary?.primaryPlatformLabel ?? "LinkedIn"} as the primary platform.
              </p>
              <p className="mt-2">
                Selected variants: {selectedRepurposedOutputIds.length > 0 ? selectedRepurposedOutputIds.length : repurposingBundle.recommendedSubset?.length ?? 0}
              </p>
            </div>
          ) : null}

          {publishPrepBundle ? (
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Publish prep</p>
              <p className="mt-2">
                {publishPrepSummary
                  ? `${publishPrepSummary.packageCount} publish-ready package${publishPrepSummary.packageCount === 1 ? "" : "s"} prepared${publishPrepSummary.primaryPlatformLabel ? ` with ${publishPrepSummary.primaryPlatformLabel} as the leading platform` : ""}.`
                  : "Publish-prep packaging has not been generated yet."}
              </p>
              {publishPrepSummary?.previewLabels.length ? (
                <p className="mt-2">Preview: {publishPrepSummary.previewLabels.join(" · ")}</p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Scenario Angle</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{currentSignal.scenarioAngle ?? "Not set"}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Interpretation</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{currentSignal.contentAngle ?? currentSignal.interpretationNotes ?? "Not set"}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Editorial Mode</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {currentSignal.editorialMode ? getEditorialModeDefinition(currentSignal.editorialMode).label : "Not set"}
              </p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Review state</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {reviewState.reviewSummary.started ? "Final review started" : "Final review not started"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {source === "airtable" ? "Live Airtable review state" : "Mock review state"} · {isDirty ? "Unsaved changes" : "All review fields saved"}
              </p>
            </div>
          </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        {draftPanels.map((panel) => {
          const diffRows = buildDraftDiffRows(panel.generatedValue, panel.finalValue);

          return (
          <Card key={panel.key} className={activeDraftPlatform === panel.key ? "ring-2 ring-[color:var(--accent)]/30" : undefined}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{panel.label}</CardTitle>
                  {activeDraftPlatform === panel.key ? (
                    <span className="inline-flex rounded-full bg-slate-950 px-2.5 py-1 text-xs font-medium text-white">Active</span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ReviewStateBadge tone={panel.statusValue === "ready" ? "ready" : panel.statusValue === "skip" ? "skip" : panel.statusValue === "needs_edit" ? "needs_edit" : "neutral"}>
                    {statusLabel(panel.statusValue)}
                  </ReviewStateBadge>
                  <ReviewStateBadge tone={(postingSummary.platformRows.find((row) => row.platform === panel.key)?.state ?? "not_reviewed") === "posted" ? "posted" : (postingSummary.platformRows.find((row) => row.platform === panel.key)?.state ?? "not_reviewed") === "ready_not_posted" ? "ready" : "neutral"}>
                    {postingStateLabel(postingSummary.platformRows.find((row) => row.platform === panel.key)?.state ?? "not_reviewed")}
                  </ReviewStateBadge>
                </div>
              </div>
              <CardDescription>
                {panel.helper}. {panel.structure}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant={activeDraftPlatform === panel.key ? "primary" : "secondary"} size="sm" onClick={() => setActiveDraftPlatform(panel.key)}>
                  {activeDraftPlatform === panel.key ? "Focused draft" : "Focus draft"}
                </Button>
                <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  [{panel.key === "x" ? "X" : panel.key === "linkedin" ? "L" : "R"}] in shortcut cycle
                </span>
              </div>
              <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
                <p className="font-medium text-slate-900">Generated draft</p>
                <p className="mt-2 whitespace-pre-wrap">{panel.generatedValue || "No generated draft saved."}</p>
              </div>
              <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600 ring-1 ring-inset ring-black/5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">Edit delta</p>
                  <span className="text-xs text-slate-500">Generated vs final</span>
                </div>
                {diffRows.length === 0 ? (
                  <p className="mt-2">No meaningful edit delta yet.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {diffRows.map((row, index) => (
                      <div key={`${panel.key}-diff-${index}`} className="grid gap-2 rounded-2xl bg-slate-50/80 px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Before</p>
                        <p className="text-sm text-slate-500">{row.before || "Removed line"}</p>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">After</p>
                        <p className="text-sm text-slate-900">{row.after || "Removed in final draft"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {revisionGuidance[panel.key].positive || revisionGuidance[panel.key].caution ? (
                <div className="rounded-2xl bg-sky-50/80 px-4 py-4 text-sm text-sky-950">
                  <p className="font-medium">{revisionGuidance[panel.key].headline}</p>
                  {revisionGuidance[panel.key].positive ? (
                    <p className="mt-2">
                      <span className="font-medium">Posts like this performed better when...</span>{" "}
                      {revisionGuidance[panel.key].positive}
                    </p>
                  ) : null}
                  {revisionGuidance[panel.key].caution ? (
                    <p className="mt-2">
                      <span className="font-medium">This pattern underperforms when...</span>{" "}
                      {revisionGuidance[panel.key].caution}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-sky-800">
                    Advisory only. Grounded in {revisionGuidance[panel.key].evidenceCount} comparable posted draft
                    {revisionGuidance[panel.key].evidenceCount === 1 ? "" : "s"} with outcome data.
                  </p>
                </div>
              ) : null}
              {(editSuggestions[panel.key] ?? []).length > 0 ? (
                <div className="rounded-2xl bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Edit learning</p>
                      <p className="mt-1 text-xs text-emerald-800">
                        Suggestions only. Nothing applies unless you click it.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-3">
                    {editSuggestions[panel.key].map((suggestion) => (
                      <div key={suggestion.key} className="rounded-2xl bg-white/80 px-3 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900">{suggestion.label}</p>
                            <p className="mt-1 text-sm text-slate-700">{suggestion.summary}</p>
                            <p className="mt-1 text-xs text-slate-500">{suggestion.reason}</p>
                          </div>
                          <Button type="button" variant="secondary" size="sm" onClick={() => applyEditSuggestion(suggestion)}>
                            Apply
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor={`${panel.key}-final`}>Final editable draft</Label>
                <Textarea
                  id={`${panel.key}-final`}
                  value={panel.finalValue}
                  onChange={(event) => {
                    setActiveDraftPlatform(panel.key);
                    if (panel.key === "x") {
                      updateField("finalXDraft", event.target.value);
                    } else if (panel.key === "linkedin") {
                      updateField("finalLinkedInDraft", event.target.value);
                    } else {
                      updateField("finalRedditDraft", event.target.value);
                    }
                  }}
                  className="min-h-[220px]"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${panel.key}-status`}>Final decision</Label>
                <Select
                  id={`${panel.key}-status`}
                  value={panel.statusValue}
                  onChange={(event) => {
                    setActiveDraftPlatform(panel.key);
                    const nextValue = event.target.value as ReviewFormState["xReviewStatus"];
                    if (panel.key === "x") {
                      updateField("xReviewStatus", nextValue);
                    } else if (panel.key === "linkedin") {
                      updateField("linkedInReviewStatus", nextValue);
                    } else {
                      updateField("redditReviewStatus", nextValue);
                    }
                  }}
                >
                  <option value="">Needs review</option>
                  <option value="ready">Ready</option>
                  <option value="needs_edit">Needs edit</option>
                  <option value="skip">Skip</option>
                </Select>
              </div>
              <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium text-slate-900">Posting memory</p>
                  <Button type="button" variant="secondary" size="sm" onClick={() => openPostingForm(panel.key)}>
                    {postingSummary.platformRows.find((row) => row.platform === panel.key)?.latestEntry ? "Log another posted entry" : "Mark as posted"}
                  </Button>
                </div>
                {postingSummary.platformRows.find((row) => row.platform === panel.key)?.latestEntry ? (
                  <div className="mt-3 space-y-2">
                    <p>
                      Latest logged post: {formatDateTime(postingSummary.platformRows.find((row) => row.platform === panel.key)?.latestEntry?.postedAt ?? null)}
                    </p>
                    <p className="line-clamp-4 whitespace-pre-wrap">
                      {postingSummary.platformRows.find((row) => row.platform === panel.key)?.latestEntry?.finalPostedText}
                    </p>
                    {postingSummary.platformRows.find((row) => row.platform === panel.key)?.latestEntry?.postUrl ? (
                      <Link
                        href={postingSummary.platformRows.find((row) => row.platform === panel.key)?.latestEntry?.postUrl ?? "#"}
                        target="_blank"
                        className="text-[color:var(--accent)] underline underline-offset-4"
                      >
                        Open live URL
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3">
                    No external publishing entry logged for {getPostingPlatformLabel(panel.key)} yet.
                  </p>
                )}
              </div>
              {activePostingPlatform === panel.key ? (
                <div className="space-y-4 rounded-2xl border border-black/8 bg-white/80 p-4">
                  <div className="grid gap-2">
                    <Label htmlFor={`${panel.key}-posted-at`}>Posted date and time</Label>
                    <Input
                      id={`${panel.key}-posted-at`}
                      type="datetime-local"
                      value={postingForms[panel.key].postedAt}
                      onChange={(event) => updatePostingField(panel.key, "postedAt", event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${panel.key}-posted-text`}>Final posted text</Label>
                    <Textarea
                      id={`${panel.key}-posted-text`}
                      value={postingForms[panel.key].finalPostedText}
                      onChange={(event) => updatePostingField(panel.key, "finalPostedText", event.target.value)}
                      className="min-h-[160px]"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${panel.key}-post-url`}>Post URL</Label>
                    <Input
                      id={`${panel.key}-post-url`}
                      placeholder="https://..."
                      value={postingForms[panel.key].postUrl}
                      onChange={(event) => updatePostingField(panel.key, "postUrl", event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${panel.key}-post-note`}>Posting note</Label>
                    <Textarea
                      id={`${panel.key}-post-note`}
                      value={postingForms[panel.key].note}
                      onChange={(event) => updatePostingField(panel.key, "note", event.target.value)}
                      className="min-h-[100px]"
                      placeholder="Anything worth remembering about what was actually posted?"
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button type="button" onClick={() => handlePostingSave(panel.key)} disabled={isPosting}>
                      {isPosting ? "Saving..." : "Save posting log"}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setActivePostingPlatform(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )})}
      </div>

      {assetBundle ? (
        <Card>
          <CardHeader>
            <CardTitle>Asset Concepts</CardTitle>
            <CardDescription>
              Lightweight final review for the preferred visual or short-form video support. This stays prompt-and-script level only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="review-primary-asset-type">Primary asset type</Label>
                <Select
                  id="review-primary-asset-type"
                  value={formState.preferredAssetType}
                  onChange={(event) => updateField("preferredAssetType", event.target.value as ReviewFormState["preferredAssetType"])}
                >
                  <option value="">Text-first</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="text_first">Text-first</option>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="review-image-concept">Image concept</Label>
                <Select id="review-image-concept" value={formState.selectedImageAssetId} onChange={(event) => handleImageSelection(event.target.value)}>
                  <option value="">No image concept</option>
                  {assetBundle.imageAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.conceptTitle}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="review-video-concept">Video concept</Label>
                <Select id="review-video-concept" value={formState.selectedVideoConceptId} onChange={(event) => handleVideoSelection(event.target.value)}>
                  <option value="">No video concept</option>
                  {assetBundle.videoConcepts.map((concept) => (
                    <option key={concept.id} value={concept.id}>
                      {concept.conceptTitle}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
                <p className="font-medium text-slate-900">Selected image concept</p>
                <p className="mt-2">{primaryImageAsset?.conceptTitle ?? "No image concept selected"}</p>
                <p className="mt-2 leading-6">{primaryImageAsset?.conceptDescription}</p>
                {primaryImageAsset ? (
                  <>
                    <p className="mt-2">Style: {primaryImageAsset.visualStyle} · Ratio: {primaryImageAsset.aspectRatio}</p>
                    <p className="mt-2">Platforms: {primaryImageAsset.platformSuggestions.join(" · ")}</p>
                    {primaryImageAsset.textOverlay ? <p className="mt-2">Text overlay: {primaryImageAsset.textOverlay}</p> : null}
                  </>
                ) : null}
              </div>
              <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
                <p className="font-medium text-slate-900">Selected video concept</p>
                <p className="mt-2">{primaryVideoConcept?.conceptTitle ?? "No video concept selected"}</p>
                <p className="mt-2 leading-6">{primaryVideoConcept?.conceptDescription}</p>
                {primaryVideoConcept ? (
                  <>
                    <p className="mt-2">Hook: {primaryVideoConcept.hook}</p>
                    <p className="mt-2">Platforms: {primaryVideoConcept.platformSuggestions.join(" · ")}</p>
                    <div className="mt-3 space-y-1">
                      {primaryVideoConcept.shotList.map((shot) => (
                        <p key={shot}>- {shot}</p>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="review-image-prompt">Editable image prompt</Label>
                <Textarea id="review-image-prompt" value={formState.imagePrompt} onChange={(event) => handleImagePromptEdit(event.target.value)} className="min-h-[180px]" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="review-video-script">Editable video script</Label>
                <Textarea id="review-video-script" value={formState.videoScript} onChange={(event) => handleVideoScriptEdit(event.target.value)} className="min-h-[180px]" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={handleGenerateImagePlaceholder}>
                Generate image
              </Button>
              <p className="text-sm text-slate-500">
                Provider-agnostic placeholder only for now. It stores a mock generated-image reference on the signal.
              </p>
            </div>
            {formState.generatedImageUrl ? (
              <div className="rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-900">Generated image reference</p>
                <p className="mt-2 break-all">{formState.generatedImageUrl}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {repurposingBundle ? (
        <Card>
          <CardHeader>
            <CardTitle>Repurposed Outputs</CardTitle>
            <CardDescription>
              One strong idea expanded into a few bounded platform variants. Select the ones worth keeping, edit them, or remove weak variants.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Bundle summary</p>
              <p className="mt-2">
                {repurposingSummary
                  ? `Repurposed into ${repurposingSummary.count} variants. Primary platform: ${repurposingSummary.primaryPlatformLabel}.`
                  : "No repurposing summary available."}
              </p>
              {repurposingSummary?.previewLabels.length ? (
                <p className="mt-2">Top previews: {repurposingSummary.previewLabels.join(" · ")}</p>
              ) : null}
            </div>

            <div className="space-y-4">
              {repurposingBundle.outputs.map((output) => {
                const selected = selectedRepurposedOutputIds.includes(output.id);
                const platformLabel =
                  output.platform === "x"
                    ? "X"
                    : output.platform === "linkedin"
                      ? "LinkedIn"
                      : output.platform === "reddit"
                        ? "Reddit"
                        : output.platform === "email"
                          ? "Email"
                          : output.platform === "video"
                            ? "Video"
                            : output.platform === "carousel"
                              ? "Carousel"
                              : "Founder thought";

                return (
                  <div key={output.id} className="rounded-2xl bg-slate-50/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full bg-slate-950 px-2.5 py-1 text-xs font-medium text-white">{platformLabel}</span>
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{output.formatType}</span>
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                          <input type="checkbox" checked={selected} onChange={() => toggleRepurposedOutput(output.id)} />
                          Select
                        </label>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeRepurposedOutput(output.id)}>
                        Remove variant
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor={`${output.id}-title`}>Title</Label>
                        <Input
                          id={`${output.id}-title`}
                          value={output.title ?? ""}
                          onChange={(event) => updateRepurposedOutput(output.id, { title: event.target.value || null })}
                          placeholder="Optional title"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`${output.id}-hook`}>Hook</Label>
                        <Input
                          id={`${output.id}-hook`}
                          value={output.hook ?? ""}
                          onChange={(event) => updateRepurposedOutput(output.id, { hook: event.target.value || null })}
                          placeholder="Optional hook"
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2">
                      <Label htmlFor={`${output.id}-content`}>Content</Label>
                      <Textarea
                        id={`${output.id}-content`}
                        value={output.content}
                        onChange={(event) => updateRepurposedOutput(output.id, { content: event.target.value })}
                        className="min-h-[180px]"
                      />
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor={`${output.id}-cta`}>CTA</Label>
                        <Input
                          id={`${output.id}-cta`}
                          value={output.CTA ?? ""}
                          onChange={(event) => updateRepurposedOutput(output.id, { CTA: event.target.value || null })}
                          placeholder="Optional CTA"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`${output.id}-notes`}>Notes</Label>
                        <Input
                          id={`${output.id}-notes`}
                          value={output.notes ?? ""}
                          onChange={(event) => updateRepurposedOutput(output.id, { notes: event.target.value || null })}
                          placeholder="Optional operator note"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {publishPrepBundle ? (
        <Card>
          <CardHeader>
            <CardTitle>Publish Prep</CardTitle>
            <CardDescription>
              Lightweight posting packages for each platform or distinct repurposed output. Choose the strongest hook and CTA, then edit only what you need before posting manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Package summary</p>
              <p className="mt-2">
                {publishPrepSummary
                  ? `${publishPrepSummary.packageCount} package${publishPrepSummary.packageCount === 1 ? "" : "s"} ready${publishPrepSummary.primaryPlatformLabel ? ` with ${publishPrepSummary.primaryPlatformLabel} as the leading platform` : ""}.`
                  : "No publish-prep bundle is available yet."}
              </p>
              {publishPrepSummary?.previewLabels.length ? (
                <p className="mt-2">Top packages: {publishPrepSummary.previewLabels.join(" · ")}</p>
              ) : null}
            </div>

            <div className="space-y-4">
              {publishPrepBundle.packages.map((pkg) => (
                <div key={pkg.id} className="rounded-2xl bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-slate-950 px-2.5 py-1 text-xs font-medium text-white">
                        {pkg.platform === "x"
                          ? "X"
                          : pkg.platform === "linkedin"
                            ? "LinkedIn"
                            : pkg.platform === "reddit"
                              ? "Reddit"
                              : pkg.platform === "email"
                                ? "Email"
                                : pkg.platform === "video"
                                  ? "Video"
                                  : pkg.platform === "carousel"
                                    ? "Carousel"
                                    : "Founder thought"}
                      </span>
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {pkg.outputKind === "primary_draft" ? "Primary draft" : "Repurposed output"}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-700">{getPublishPrepPackageLabel(pkg)}</p>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <div className="space-y-3">
                      <div className="grid gap-2">
                        <Label htmlFor={`${pkg.id}-hook-choice`}>Hook variant</Label>
                        <Select
                          id={`${pkg.id}-hook-choice`}
                          value={pkg.selectedHookId ?? ""}
                          onChange={(event) => applyHookVariant(pkg.id, event.target.value)}
                        >
                          <option value="">Keep current hook</option>
                          {pkg.hookVariants.map((variant) => (
                            <option key={variant.id} value={variant.id}>
                              {variant.styleLabel}: {variant.text}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`${pkg.id}-hook-text`}>Preferred hook</Label>
                        <Textarea
                          id={`${pkg.id}-hook-text`}
                          value={getSelectedHookText(pkg) ?? ""}
                          onChange={(event) => handleHookEdit(pkg.id, event.target.value)}
                          className="min-h-[100px]"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="grid gap-2">
                        <Label htmlFor={`${pkg.id}-cta-choice`}>CTA variant</Label>
                        <Select
                          id={`${pkg.id}-cta-choice`}
                          value={pkg.selectedCtaId ?? ""}
                          onChange={(event) => applyCtaVariant(pkg.id, event.target.value)}
                        >
                          <option value="">Keep current CTA</option>
                          {pkg.ctaVariants.map((variant) => (
                            <option key={variant.id} value={variant.id}>
                              {variant.goalLabel}: {variant.text}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`${pkg.id}-cta-text`}>Preferred CTA</Label>
                        <Textarea
                          id={`${pkg.id}-cta-text`}
                          value={getSelectedCtaText(pkg) ?? ""}
                          onChange={(event) => handleCtaEdit(pkg.id, event.target.value)}
                          className="min-h-[100px]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor={`${pkg.id}-keywords`}>{pkg.platform === "reddit" ? "Keywords" : "Hashtags / keywords"}</Label>
                      <Input
                        id={`${pkg.id}-keywords`}
                        value={pkg.hashtagsOrKeywords.items.join(", ")}
                        onChange={(event) =>
                          updatePublishPrepPackage(pkg.id, {
                            hashtagsOrKeywords: {
                              ...pkg.hashtagsOrKeywords,
                              items: event.target.value
                                .split(",")
                                .map((item) => item.trim())
                                .filter(Boolean)
                                .slice(0, 8),
                            },
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`${pkg.id}-posting-time`}>Suggested posting time</Label>
                      <Input
                        id={`${pkg.id}-posting-time`}
                        value={pkg.suggestedPostingTime ?? ""}
                        onChange={(event) => updatePublishPrepPackage(pkg.id, { suggestedPostingTime: event.target.value || null })}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor={`${pkg.id}-alt-text`}>Alt text</Label>
                      <Textarea
                        id={`${pkg.id}-alt-text`}
                        value={pkg.altText?.text ?? ""}
                        onChange={(event) =>
                          updatePublishPrepPackage(pkg.id, {
                            altText: event.target.value.trim() ? { text: event.target.value } : null,
                          })
                        }
                        className="min-h-[100px]"
                        placeholder="Optional alt text for image-backed posts"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`${pkg.id}-comment-prompt`}>Follow-up comment / reply prompt</Label>
                      <Textarea
                        id={`${pkg.id}-comment-prompt`}
                        value={pkg.commentPrompt?.text ?? ""}
                        onChange={(event) =>
                          updatePublishPrepPackage(pkg.id, {
                            commentPrompt: event.target.value.trim() ? { text: event.target.value } : null,
                          })
                        }
                        className="min-h-[100px]"
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {pkg.linkVariants.length > 0 ? (
                      pkg.linkVariants.map((link, index) => (
                        <div key={`${pkg.id}-link-${index}`} className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                              Destination: {link.destinationLabel ?? pkg.siteLinkLabel ?? "Site link"}
                            </span>
                            {link.usedFallback || pkg.siteLinkUsedFallback ? (
                              <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                                Fallback route
                              </span>
                            ) : null}
                          </div>
                          {pkg.siteLinkReason ? <p className="mb-3 text-xs text-slate-500">{pkg.siteLinkReason}</p> : null}
                          <div className="grid gap-3 xl:grid-cols-[1fr_220px]">
                            <div className="grid gap-2">
                              <Label htmlFor={`${pkg.id}-link-url-${index}`}>Link URL</Label>
                              <Input
                                id={`${pkg.id}-link-url-${index}`}
                                value={link.url}
                                onChange={(event) =>
                                  updatePublishPrepPackage(pkg.id, {
                                    linkVariants: pkg.linkVariants.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, url: event.target.value } : entry,
                                    ),
                                  })
                                }
                              />
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor={`${pkg.id}-link-label-${index}`}>Link label</Label>
                              <Input
                                id={`${pkg.id}-link-label-${index}`}
                                value={link.label}
                                onChange={(event) =>
                                  updatePublishPrepPackage(pkg.id, {
                                    linkVariants: pkg.linkVariants.map((entry, entryIndex) =>
                                      entryIndex === index ? { ...entry, label: event.target.value } : entry,
                                    ),
                                  })
                                }
                              />
                            </div>
                          </div>
                          {link.utmParameters ? (
                            <p className="mt-3 text-xs text-slate-500">
                              UTM: {link.utmParameters.utm_source} / {link.utmParameters.utm_medium} / {link.utmParameters.utm_campaign} / {link.utmParameters.utm_content}
                            </p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">No link package needed for this output.</p>
                    )}
                  </div>

                  <div className="mt-4 grid gap-2">
                    <Label htmlFor={`${pkg.id}-notes`}>Package notes</Label>
                    <Textarea
                      id={`${pkg.id}-notes`}
                      value={pkg.notes ?? ""}
                      onChange={(event) => updatePublishPrepPackage(pkg.id, { notes: event.target.value || null })}
                      className="min-h-[80px]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="sticky bottom-4 z-20 rounded-3xl border border-black/8 bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-950">
              Sticky action rail · {getPostingPlatformLabel(activeDraftPlatform)} focused
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Save, stage a ready-to-post package, hold, apply one suggestion, or log posting without leaving the workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setReviewStatusForPlatform(activeDraftPlatform, "ready")}>
              Approve focused draft
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setReviewStatusForPlatform(activeDraftPlatform, "needs_edit")}>
              Hold focused draft
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => applyFirstSuggestionForPlatform(activeDraftPlatform)}>
              Apply suggestion
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => handleStageForPosting(activeDraftPlatform)} disabled={isPosting}>
              {isPosting ? "Staging..." : "Stage for posting"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => openPostingForm(activeDraftPlatform)}>
              Log posting
            </Button>
            <Link href="/posting" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Open posting assistant
            </Link>
            <Link href="/experiments" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Open experiments
            </Link>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowShortcutHelp((current) => !current)}>
              {showShortcutHelp ? "Hide shortcuts" : "Show shortcuts"}
            </Button>
          </div>
        </div>
        {showShortcutHelp ? (
          <div className="mt-3 rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">Keyboard shortcuts</p>
            <p className="mt-2">
              <span className="font-medium">Ctrl/Cmd+S</span> save · <span className="font-medium">J / K</span> next or previous candidate ·{" "}
              <span className="font-medium">[ / ]</span> cycle focused draft · <span className="font-medium">1 / 2 / 3</span> focus X, LinkedIn, or Reddit ·{" "}
              <span className="font-medium">A</span> approve focused draft · <span className="font-medium">H</span> hold focused draft ·{" "}
              <span className="font-medium">G</span> apply first suggestion · <span className="font-medium">P</span> open posting log ·{" "}
              <span className="font-medium">E</span> expand or collapse support detail · <span className="font-medium">X</span> open experiments ·{" "}
              <span className="font-medium">?</span> toggle this help
            </p>
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overall Review Notes</CardTitle>
          <CardDescription>One compact note for the final editorial decision.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={formState.finalReviewNotes}
            onChange={(event) => updateField("finalReviewNotes", event.target.value)}
            className="min-h-[140px]"
            placeholder="What is strongest, what still needs work, and what should be skipped?"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save final review"}
            </Button>
            <Link href={`/signals/${currentSignal.recordId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Back to record
            </Link>
            <Link href="/review" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Back to review queue
            </Link>
            <p className="text-sm text-slate-500">
              Final review saves edited drafts and per-platform decisions without changing manual posting workflow.
            </p>
          </div>
        </CardContent>
      </Card>

      {feedback ? (
        <div className={`rounded-2xl px-4 py-3 text-sm ${toneClasses(feedback.tone)}`}>
          <p className="font-medium">{feedback.title}</p>
          <p className="mt-1">{feedback.body}</p>
        </div>
      ) : null}
    </div>
  );
}
