import type { AutoAdvanceAssessment } from "@/lib/auto-advance";
import { buildSignalAssetBundle } from "@/lib/assets";
import { evaluateApprovalPackageCompleteness, type ApprovalPackageCompleteness } from "@/lib/completeness";
import { buildEditPatternSuggestions, inferEditPatternHistory } from "@/lib/edit-patterns";
import type { ConversionIntentAssessment } from "@/lib/conversion-intent";
import type { ManualExperiment } from "@/lib/experiments";
import {
  buildSignalPublishPrepBundle,
  getPrimaryLinkVariant,
  getPublishPrepPackageForPlatform,
  getSelectedCtaText,
  getSelectedHookText,
  parsePublishPrepBundle,
  stringifyPublishPrepBundle,
  type PublishPrepBundle,
  type PublishPrepPackage,
  type PublishPrepPlatform,
} from "@/lib/publish-prep";
import type { PostingOutcome } from "@/lib/outcomes";
import type { PostingLogEntry } from "@/lib/posting-memory";
import { buildRevisionGuidance } from "@/lib/revision-guidance";
import { getSiteLinkById } from "@/lib/site-links";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import type { SignalRecord } from "@/types/signal";

export const PACKAGE_AUTOFILL_FIELDS = [
  "hook",
  "cta",
  "destination",
  "timing",
  "asset_direction",
  "asset_selection",
  "revision_guidance",
  "edit_pattern",
] as const;

export type PackageAutofillField = (typeof PACKAGE_AUTOFILL_FIELDS)[number];

export interface PackageAutofillNote {
  field: PackageAutofillField;
  label: string;
  value: string;
  reason: string;
}

export interface PackageAutofillResult {
  eligible: boolean;
  mode: "applied" | "suggested" | "blocked";
  signal: SignalRecord;
  notes: PackageAutofillNote[];
  appliedFields: PackageAutofillField[];
  completenessBefore: ApprovalPackageCompleteness;
  completenessAfter: ApprovalPackageCompleteness;
}

function uniqueNote(notes: PackageAutofillNote[], note: PackageAutofillNote) {
  if (notes.some((entry) => entry.field === note.field && entry.value === note.value)) {
    return;
  }

  notes.push(note);
}

function getPrimaryPlatform(signal: SignalRecord): PublishPrepPlatform | null {
  switch (signal.platformPriority) {
    case "X First":
      return "x";
    case "Reddit First":
      return "reddit";
    case "LinkedIn First":
    case "Multi-platform":
      return "linkedin";
    default:
      return null;
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function hasActiveExperimentForField(
  signalId: string,
  experiments: ManualExperiment[] | undefined,
  types: Array<ManualExperiment["experimentType"]>,
): boolean {
  if (!experiments || types.length === 0) {
    return false;
  }

  return experiments.some(
    (experiment) =>
      experiment.status !== "completed" &&
      experiment.experimentType !== null &&
      types.includes(experiment.experimentType) &&
      experiment.variants.some((variant) => variant.linkedSignalIds.includes(signalId)),
  );
}

function patchPrimaryPackage(
  currentBundle: PublishPrepBundle,
  defaultBundle: PublishPrepBundle,
  signal: SignalRecord,
  notes: PackageAutofillNote[],
  conversionIntent: ConversionIntentAssessment | null | undefined,
  experiments?: ManualExperiment[],
): PublishPrepBundle {
  const primaryPlatform = currentBundle.primaryPlatform ?? defaultBundle.primaryPlatform ?? getPrimaryPlatform(signal);
  if (primaryPlatform !== "x" && primaryPlatform !== "linkedin" && primaryPlatform !== "reddit") {
    return currentBundle;
  }

  const currentPackage = getPublishPrepPackageForPlatform(currentBundle, primaryPlatform);
  const defaultPackage = getPublishPrepPackageForPlatform(defaultBundle, primaryPlatform);
  if (!currentPackage || !defaultPackage) {
    return currentBundle;
  }

  const hookBlocked = hasActiveExperimentForField(signal.recordId, experiments, ["hook_variant_test"]);
  const ctaBlocked = hasActiveExperimentForField(signal.recordId, experiments, ["cta_variant_test"]);
  const destinationBlocked = hasActiveExperimentForField(signal.recordId, experiments, ["destination_test"]);

  const nextPrimaryPackage: PublishPrepPackage = { ...currentPackage };

  if (!hookBlocked && !trimOrNull(nextPrimaryPackage.selectedHookId) && trimOrNull(defaultPackage.selectedHookId)) {
    nextPrimaryPackage.selectedHookId = defaultPackage.selectedHookId;
    uniqueNote(notes, {
      field: "hook",
      label: "Auto-filled hook",
      value: getSelectedHookText(nextPrimaryPackage) ?? nextPrimaryPackage.primaryHook ?? "Selected primary hook",
      reason: "The primary publish-prep package already had one clear hook selected.",
    });
  }

  const preferredCtaVariant =
    conversionIntent?.preferredCtaVariant === "soft"
      ? defaultPackage.ctaVariants[1] ?? defaultPackage.ctaVariants[0] ?? null
      : defaultPackage.ctaVariants[0] ?? defaultPackage.ctaVariants[1] ?? null;

  if (
    !ctaBlocked &&
    preferredCtaVariant &&
    trimOrNull(nextPrimaryPackage.selectedCtaId) !== preferredCtaVariant.id
  ) {
    nextPrimaryPackage.selectedCtaId = preferredCtaVariant.id;
    uniqueNote(notes, {
      field: "cta",
      label: "Auto-filled CTA",
      value: getSelectedCtaText(nextPrimaryPackage) ?? nextPrimaryPackage.primaryCta ?? "Selected primary CTA",
      reason:
        conversionIntent?.preferredCtaVariant === "soft"
          ? "Conversion posture kept the CTA trust-first instead of escalating pressure."
          : "Conversion posture supports a clearer conversion-oriented CTA.",
    });
  }

  if (!trimOrNull(nextPrimaryPackage.suggestedPostingTime) && trimOrNull(defaultPackage.suggestedPostingTime)) {
    nextPrimaryPackage.suggestedPostingTime = defaultPackage.suggestedPostingTime;
    uniqueNote(notes, {
      field: "timing",
      label: "Auto-filled timing",
      value: defaultPackage.suggestedPostingTime ?? "Use suggested time",
      reason: "Publish prep already included a bounded timing recommendation.",
    });
  }

  if (!destinationBlocked) {
    const defaultPrimaryLink = getPrimaryLinkVariant(defaultPackage);
    const currentPrimaryLink = getPrimaryLinkVariant(nextPrimaryPackage);
    const postureDestinationId = conversionIntent?.preferredDestinationIds.find((id) => getSiteLinkById(id));
    const postureLink =
      postureDestinationId && defaultPackage.linkVariants.find((variant) => variant.siteLinkId === postureDestinationId);
    const targetPrimaryLink = postureLink ?? defaultPrimaryLink;
    const shouldAdoptLinkFields =
      (!trimOrNull(nextPrimaryPackage.siteLinkId) && !trimOrNull(nextPrimaryPackage.siteLinkLabel)) ||
      !currentPrimaryLink ||
      Boolean(
        postureDestinationId &&
          trimOrNull(nextPrimaryPackage.siteLinkId) &&
          !conversionIntent?.preferredDestinationIds.includes(trimOrNull(nextPrimaryPackage.siteLinkId) ?? ""),
      );
    if (shouldAdoptLinkFields && targetPrimaryLink) {
      nextPrimaryPackage.siteLinkId = targetPrimaryLink.siteLinkId ?? trimOrNull(defaultPackage.siteLinkId);
      nextPrimaryPackage.siteLinkLabel = targetPrimaryLink.destinationLabel ?? trimOrNull(defaultPackage.siteLinkLabel) ?? targetPrimaryLink.label;
      nextPrimaryPackage.siteLinkReason =
        postureLink && conversionIntent
          ? `Conversion posture ${conversionIntent.posture.replaceAll("_", " ")} fits this destination better.`
          : trimOrNull(nextPrimaryPackage.siteLinkReason) ?? trimOrNull(defaultPackage.siteLinkReason);
      nextPrimaryPackage.siteLinkUsedFallback = postureLink ? false : nextPrimaryPackage.siteLinkUsedFallback ?? defaultPackage.siteLinkUsedFallback;
      nextPrimaryPackage.linkVariants =
        postureLink
          ? [
              targetPrimaryLink,
              ...defaultPackage.linkVariants.filter((variant) => variant.siteLinkId !== targetPrimaryLink.siteLinkId),
            ]
          : nextPrimaryPackage.linkVariants.length > 0
            ? nextPrimaryPackage.linkVariants
            : defaultPackage.linkVariants;
      uniqueNote(notes, {
        field: "destination",
        label: "Auto-selected destination",
        value: targetPrimaryLink.label,
        reason:
          postureLink && conversionIntent
            ? `Conversion posture ${conversionIntent.posture.replaceAll("_", " ")} is a better fit for this destination.`
            : "The default destination already matched the current CTA and publish-prep context.",
      });
    }
  }

  if (JSON.stringify(nextPrimaryPackage) === JSON.stringify(currentPackage)) {
    return currentBundle;
  }

  return {
    ...currentBundle,
    primaryPlatform,
    packages: currentBundle.packages.map((pkg) => (pkg.id === currentPackage.id ? nextPrimaryPackage : pkg)),
  };
}

function addAssetAutofill(
  signal: SignalRecord,
  notes: PackageAutofillNote[],
): SignalRecord {
  const assetBundle = buildSignalAssetBundle(signal);
  if (!assetBundle) {
    return signal;
  }

  let nextSignal = signal;
  if (!signal.preferredAssetType) {
    nextSignal = {
      ...nextSignal,
      preferredAssetType: assetBundle.suggestedPrimaryAssetType,
    };
    uniqueNote(notes, {
      field: "asset_direction",
      label: "Auto-selected asset direction",
      value:
        assetBundle.suggestedPrimaryAssetType === "image"
          ? "Image-first"
          : assetBundle.suggestedPrimaryAssetType === "video"
            ? "Video-first"
            : "Text-first",
      reason: "The asset bundle already exposed a preferred primary asset type.",
    });
  }

  if (nextSignal.preferredAssetType === "image" && !nextSignal.selectedImageAssetId && assetBundle.imageAssets[0]) {
    nextSignal = {
      ...nextSignal,
      selectedImageAssetId: assetBundle.imageAssets[0].id,
    };
    uniqueNote(notes, {
      field: "asset_selection",
      label: "Auto-selected asset",
      value: assetBundle.imageAssets[0].conceptTitle,
      reason: "The first image concept matched the preferred asset direction.",
    });
  }

  if (nextSignal.preferredAssetType === "video" && !nextSignal.selectedVideoConceptId && assetBundle.videoConcepts[0]) {
    nextSignal = {
      ...nextSignal,
      selectedVideoConceptId: assetBundle.videoConcepts[0].id,
    };
    uniqueNote(notes, {
      field: "asset_selection",
      label: "Auto-selected asset",
      value: assetBundle.videoConcepts[0].conceptTitle,
      reason: "The first video concept matched the preferred asset direction.",
    });
  }

  return nextSignal;
}

function addRevisionGuidanceAutofill(
  signal: SignalRecord,
  notes: PackageAutofillNote[],
  input: {
    allSignals: SignalRecord[];
    postingEntries: PostingLogEntry[];
    postingOutcomes: PostingOutcome[];
    strategicOutcomes: StrategicOutcome[];
  },
) {
  const primaryPlatform = getPrimaryPlatform(signal) ?? "linkedin";
  if (primaryPlatform !== "x" && primaryPlatform !== "linkedin" && primaryPlatform !== "reddit") {
    return;
  }
  const guidance = buildRevisionGuidance({
    signal,
    allSignals: input.allSignals,
    postingEntries: input.postingEntries,
    postingOutcomes: input.postingOutcomes,
    strategicOutcomes: input.strategicOutcomes,
  }).insightsByPlatform[primaryPlatform];

  if (!guidance || guidance.evidenceCount <= 0) {
    return;
  }

  uniqueNote(notes, {
    field: "revision_guidance",
    label: "Auto-attached revision note",
    value: guidance.caution ?? guidance.positive ?? guidance.headline,
    reason: `${guidance.evidenceCount} similar ${primaryPlatform === "linkedin" ? "LinkedIn" : primaryPlatform === "reddit" ? "Reddit" : "X"} outcomes informed this note.`,
  });
}

function addEditPatternAutofill(
  signal: SignalRecord,
  notes: PackageAutofillNote[],
  allSignals: SignalRecord[],
) {
  const primaryPlatform = getPrimaryPlatform(signal) ?? "linkedin";
  if (primaryPlatform !== "x" && primaryPlatform !== "linkedin" && primaryPlatform !== "reddit") {
    return;
  }
  const history = inferEditPatternHistory(allSignals, {
    excludeSignalId: signal.recordId,
  });
  const suggestion = buildEditPatternSuggestions(signal, history)[primaryPlatform][0];
  if (!suggestion) {
    return;
  }

  uniqueNote(notes, {
    field: "edit_pattern",
    label: "Auto-attached edit pattern",
    value: suggestion.label,
    reason: suggestion.reason,
  });
}

export function applyApprovalPackageAutofill(input: {
  signal: SignalRecord;
  guidanceConfidenceLevel: "high" | "moderate" | "low";
  automationConfidenceLevel: "high" | "medium" | "low";
  conversionIntent?: ConversionIntentAssessment | null;
  assessment?: Pick<AutoAdvanceAssessment, "decision" | "draftQuality"> | null;
  allSignals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
  experiments?: ManualExperiment[];
}): PackageAutofillResult {
  const completenessBefore = evaluateApprovalPackageCompleteness({
    signal: input.signal,
    guidanceConfidenceLevel: input.guidanceConfidenceLevel,
  });

  const nearComplete =
    completenessBefore.completenessState !== "complete" &&
    completenessBefore.completenessScore >= 4 &&
    completenessBefore.missingElements.length <= 4;
  const hasDrafts = Boolean(input.signal.xDraft && input.signal.linkedInDraft && input.signal.redditDraft);
  const eligible =
    hasDrafts &&
    nearComplete &&
    input.automationConfidenceLevel !== "low" &&
    input.assessment?.draftQuality?.label !== "Weak" &&
    (input.assessment ? input.assessment.decision === "approval_ready" : true);

  if (!eligible) {
    return {
      eligible: false,
      mode: "blocked",
      signal: input.signal,
      notes: [],
      appliedFields: [],
      completenessBefore,
      completenessAfter: completenessBefore,
    };
  }

  const notes: PackageAutofillNote[] = [];
  let nextSignal: SignalRecord = { ...input.signal };
  const defaultPublishPrepBundle = buildSignalPublishPrepBundle(nextSignal);
  const currentPublishPrepBundle = parsePublishPrepBundle(nextSignal.publishPrepBundleJson) ?? defaultPublishPrepBundle;
  if (defaultPublishPrepBundle && currentPublishPrepBundle) {
    const nextPublishPrepBundle = patchPrimaryPackage(
      currentPublishPrepBundle,
      defaultPublishPrepBundle,
      nextSignal,
      notes,
      input.conversionIntent,
      input.experiments,
    );

    if (JSON.stringify(nextPublishPrepBundle) !== JSON.stringify(currentPublishPrepBundle) || !nextSignal.publishPrepBundleJson) {
      nextSignal = {
        ...nextSignal,
        publishPrepBundleJson: stringifyPublishPrepBundle(nextPublishPrepBundle),
      };
    }
  }

  nextSignal = addAssetAutofill(nextSignal, notes);
  addRevisionGuidanceAutofill(nextSignal, notes, input);
  addEditPatternAutofill(nextSignal, notes, input.allSignals);

  const completenessAfter = evaluateApprovalPackageCompleteness({
    signal: nextSignal,
    guidanceConfidenceLevel: input.guidanceConfidenceLevel,
  });

  if (input.automationConfidenceLevel === "medium") {
    return {
      eligible: true,
      mode: "suggested",
      signal: input.signal,
      notes,
      appliedFields: [],
      completenessBefore,
      completenessAfter,
    };
  }

  return {
    eligible: true,
    mode: "applied",
    signal: nextSignal,
    notes,
    appliedFields: notes.map((note) => note.field),
    completenessBefore,
    completenessAfter,
  };
}
