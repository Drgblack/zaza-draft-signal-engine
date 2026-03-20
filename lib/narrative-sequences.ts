import type { CampaignStrategy } from "@/lib/campaigns";
import { getSignalContentContextSummary } from "@/lib/campaigns";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import type { PostingOutcome } from "@/lib/outcomes";
import type { PostingLogEntry, PostingPlatform } from "@/lib/posting-memory";
import {
  buildSignalPublishPrepBundle,
  getPublishPrepPackageForPlatform,
  getSelectedCtaText,
} from "@/lib/publish-prep";
import { buildSignalRepurposingBundle } from "@/lib/repurposing";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import type { FunnelStage, SignalRecord } from "@/types/signal";

export const NARRATIVE_SEQUENCE_ROLES = [
  "awareness_hook",
  "reflection",
  "discussion",
  "trust_builder",
  "conversion_prompt",
  "follow_up",
] as const;

export type NarrativeSequenceRole = (typeof NARRATIVE_SEQUENCE_ROLES)[number];

export interface NarrativeSequenceStep {
  stepId: string;
  order: number;
  signalId: string;
  platform: PostingPlatform;
  contentRole: NarrativeSequenceRole;
  rationale: string;
  href: string;
}

export interface NarrativeSequence {
  sequenceId: string;
  narrativeLabel: string;
  signalIds: string[];
  orderedSteps: NarrativeSequenceStep[];
  sequenceGoal: string;
  sequenceReason: string;
  suggestedCadenceNotes: string;
}

export interface NarrativeSequenceStepMatch {
  sequenceId: string;
  narrativeLabel: string;
  sequenceGoal: string;
  sequenceReason: string;
  suggestedCadenceNotes: string;
  stepId: string;
  stepNumber: number;
  totalSteps: number;
  platform: PostingPlatform;
  contentRole: NarrativeSequenceRole;
  rationale: string;
}

export interface NarrativeSequenceInsights {
  sequenceCount: number;
  sequencedSignalCount: number;
  sequencedPostedCount: number;
  strongOutcomeCount: number;
  topRolePlatformRows: Array<{
    key: string;
    label: string;
    count: number;
  }>;
  summary: string;
}

function roleLabel(role: NarrativeSequenceRole) {
  switch (role) {
    case "awareness_hook":
      return "Awareness hook";
    case "reflection":
      return "Reflection";
    case "discussion":
      return "Discussion";
    case "trust_builder":
      return "Trust builder";
    case "conversion_prompt":
      return "Conversion prompt";
    case "follow_up":
    default:
      return "Follow-up";
  }
}

export function getNarrativeSequenceRoleLabel(role: NarrativeSequenceRole) {
  return roleLabel(role);
}

function narrativeRoleWeight(role: NarrativeSequenceRole) {
  switch (role) {
    case "awareness_hook":
      return 1;
    case "reflection":
      return 2;
    case "discussion":
      return 3;
    case "trust_builder":
      return 4;
    case "conversion_prompt":
      return 5;
    case "follow_up":
    default:
      return 6;
  }
}

function platformWeight(platform: PostingPlatform) {
  switch (platform) {
    case "x":
      return 1;
    case "linkedin":
      return 2;
    case "reddit":
    default:
      return 3;
  }
}

function shortTitle(sourceTitle: string) {
  const trimmed = sourceTitle.trim();
  if (trimmed.length <= 54) {
    return trimmed;
  }

  return `${trimmed.slice(0, 51).trimEnd()}...`;
}

function normalizeNarrativeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function inferContentRole(input: {
  platform: PostingPlatform;
  funnelStage: FunnelStage | null;
  ctaText: string | null;
  destinationLabel: string | null;
  hasCampaignContext: boolean;
  editorialModeLabel: string | null;
}): NarrativeSequenceRole {
  const joinedContext = [input.ctaText, input.destinationLabel, input.editorialModeLabel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    input.funnelStage === "Conversion" ||
    joinedContext.includes("pricing") ||
    joinedContext.includes("get started") ||
    joinedContext.includes("book") ||
    joinedContext.includes("demo")
  ) {
    return "conversion_prompt";
  }

  if (input.platform === "reddit") {
    return input.hasCampaignContext ? "follow_up" : "discussion";
  }

  if (
    input.platform === "linkedin" &&
    (input.funnelStage === "Trust" ||
      input.funnelStage === "Consideration" ||
      joinedContext.includes("overview") ||
      joinedContext.includes("proof") ||
      joinedContext.includes("trust"))
  ) {
    return "trust_builder";
  }

  if (input.platform === "linkedin") {
    return "reflection";
  }

  if (
    input.platform === "x" &&
    (input.hasCampaignContext || input.funnelStage === "Awareness" || input.funnelStage === "Consideration")
  ) {
    return "awareness_hook";
  }

  return "follow_up";
}

function buildStepRationale(platform: PostingPlatform, role: NarrativeSequenceRole) {
  if (platform === "x" && role === "awareness_hook") {
    return "Open with reach and a compact hook before deeper context appears elsewhere.";
  }

  if (platform === "linkedin" && role === "reflection") {
    return "Use LinkedIn for a more reflective explanation after the first hook lands.";
  }

  if (platform === "linkedin" && role === "trust_builder") {
    return "Use LinkedIn to add trust, clarity, and practical product context before the stronger CTA lands.";
  }

  if (platform === "reddit" && role === "discussion") {
    return "Use Reddit later for the deeper discussion step rather than the opening hook.";
  }

  if (role === "conversion_prompt") {
    return "Keep the stronger CTA later in the arc once awareness and trust have already done some work.";
  }

  return "Use this step as a light follow-up so the arc does not collapse into one isolated post.";
}

function buildSequenceGoal(roles: NarrativeSequenceRole[]) {
  if (roles.includes("conversion_prompt")) {
    return "Move from awareness into trust and a bounded conversion ask.";
  }

  if (roles.includes("discussion") && roles.includes("trust_builder")) {
    return "Open attention, deepen trust, and let the theme travel across discussion-heavy channels.";
  }

  return "Turn one strong signal into a compact cross-platform arc instead of isolated posts.";
}

function buildSequenceReason(steps: NarrativeSequenceStep[]) {
  const labels = steps.map((step) => `${step.order}. ${roleLabel(step.contentRole)} on ${step.platform === "linkedin" ? "LinkedIn" : step.platform === "x" ? "X" : "Reddit"}`);
  return `${labels.join(" -> ")} keeps the story progressing instead of repeating the same framing on every platform.`;
}

function buildCadenceNotes(stepCount: number) {
  return `Treat this as a ${stepCount}-step weekly arc. Spread the steps across the week with the harder CTA later. No schedule is applied automatically.`;
}

function getAvailablePlatforms(signal: SignalRecord) {
  const candidates: PostingPlatform[] = [];

  if ((signal.finalXDraft ?? signal.xDraft)?.trim()) {
    candidates.push("x");
  }
  if ((signal.finalLinkedInDraft ?? signal.linkedInDraft)?.trim()) {
    candidates.push("linkedin");
  }
  if ((signal.finalRedditDraft ?? signal.redditDraft)?.trim()) {
    candidates.push("reddit");
  }

  return candidates;
}

export function buildSignalNarrativeSequence(input: {
  signal: SignalRecord;
  strategy?: CampaignStrategy;
}): NarrativeSequence | null {
  const availablePlatforms = getAvailablePlatforms(input.signal);
  if (availablePlatforms.length < 2) {
    return null;
  }

  const repurposingBundle = buildSignalRepurposingBundle(input.signal);
  const publishPrepBundle = buildSignalPublishPrepBundle(input.signal);
  const context = input.strategy ? getSignalContentContextSummary(input.signal, input.strategy) : null;
  const editorialModeLabel = input.signal.editorialMode
    ? getEditorialModeDefinition(input.signal.editorialMode).label
    : null;
  const supportSignals = [
    context?.campaignName ? 1 : 0,
    context?.funnelStage ? 1 : 0,
    editorialModeLabel ? 1 : 0,
    (repurposingBundle?.outputs.length ?? 0) >= 3 ? 1 : 0,
    availablePlatforms.length >= 3 ? 1 : 0,
  ].filter(Boolean).length;

  if (supportSignals < 2) {
    return null;
  }

  const unsortedSteps = availablePlatforms.map((platform) => {
    const publishPrepPackage = getPublishPrepPackageForPlatform(publishPrepBundle, platform);
    const ctaText = publishPrepPackage ? getSelectedCtaText(publishPrepPackage) : null;
    const destinationLabel = publishPrepPackage?.siteLinkLabel ?? null;
    const contentRole = inferContentRole({
      platform,
      funnelStage: context?.funnelStage ?? null,
      ctaText,
      destinationLabel,
      hasCampaignContext: Boolean(context?.campaignName),
      editorialModeLabel,
    });

    return {
      platform,
      contentRole,
      rationale: buildStepRationale(platform, contentRole),
      href: `/signals/${input.signal.recordId}/review`,
    };
  });

  const orderedSteps = unsortedSteps
    .sort(
      (left, right) =>
        narrativeRoleWeight(left.contentRole) - narrativeRoleWeight(right.contentRole) ||
        platformWeight(left.platform) - platformWeight(right.platform),
    )
    .map((step, index) => ({
      stepId: `${input.signal.recordId}:${step.platform}`,
      order: index + 1,
      signalId: input.signal.recordId,
      platform: step.platform,
      contentRole: step.contentRole,
      rationale: step.rationale,
      href: step.href,
    }));

  const narrativeLabel =
    context?.campaignName
      ? `${context.campaignName} arc`
      : editorialModeLabel
        ? `${editorialModeLabel} cross-platform arc`
        : `${shortTitle(input.signal.sourceTitle)} arc`;

  return {
    sequenceId: `narrative:${input.signal.recordId}:${normalizeNarrativeKey(narrativeLabel)}`,
    narrativeLabel,
    signalIds: [input.signal.recordId],
    orderedSteps,
    sequenceGoal: buildSequenceGoal(orderedSteps.map((step) => step.contentRole)),
    sequenceReason: buildSequenceReason(orderedSteps),
    suggestedCadenceNotes: buildCadenceNotes(orderedSteps.length),
  };
}

export function buildNarrativeSequencesForSignals(input: {
  signals: SignalRecord[];
  strategy?: CampaignStrategy;
  maxSequences?: number;
}) {
  return input.signals
    .map((signal) => buildSignalNarrativeSequence({ signal, strategy: input.strategy }))
    .filter((sequence): sequence is NarrativeSequence => Boolean(sequence))
    .slice(0, input.maxSequences ?? 100);
}

export function findNarrativeSequenceStep(
  sequence: NarrativeSequence | null | undefined,
  platform: PostingPlatform,
): NarrativeSequenceStepMatch | null {
  if (!sequence) {
    return null;
  }

  const step = sequence.orderedSteps.find((candidate) => candidate.platform === platform);
  if (!step) {
    return null;
  }

  return {
    sequenceId: sequence.sequenceId,
    narrativeLabel: sequence.narrativeLabel,
    sequenceGoal: sequence.sequenceGoal,
    sequenceReason: sequence.sequenceReason,
    suggestedCadenceNotes: sequence.suggestedCadenceNotes,
    stepId: step.stepId,
    stepNumber: step.order,
    totalSteps: sequence.orderedSteps.length,
    platform: step.platform,
    contentRole: step.contentRole,
    rationale: step.rationale,
  };
}

export function buildNarrativeSequenceInsights(input: {
  sequences: NarrativeSequence[];
  postingEntries: PostingLogEntry[];
  postingOutcomes: PostingOutcome[];
  strategicOutcomes: StrategicOutcome[];
}): NarrativeSequenceInsights {
  const postingOutcomeByLogId = new Map(input.postingOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const strategicOutcomeByLogId = new Map(input.strategicOutcomes.map((outcome) => [outcome.postingLogId, outcome]));
  const sequenceSignalIds = new Set(input.sequences.flatMap((sequence) => sequence.signalIds));
  const sequencedPostedEntries = input.postingEntries.filter((entry) => sequenceSignalIds.has(entry.signalId));
  const strongOutcomeCount = sequencedPostedEntries.filter((entry) => {
    const postingOutcome = postingOutcomeByLogId.get(entry.id);
    const strategicOutcome = strategicOutcomeByLogId.get(entry.id);
    return postingOutcome?.outcomeQuality === "strong" || strategicOutcome?.strategicValue === "high";
  }).length;

  const rolePlatformCounts = new Map<string, number>();
  for (const sequence of input.sequences) {
    for (const step of sequence.orderedSteps) {
      const key = `${step.contentRole}:${step.platform}`;
      rolePlatformCounts.set(key, (rolePlatformCounts.get(key) ?? 0) + 1);
    }
  }

  const topRolePlatformRows = [...rolePlatformCounts.entries()]
    .map(([key, count]) => {
      const [role, platform] = key.split(":");
      return {
        key,
        count,
        label: `${roleLabel(role as NarrativeSequenceRole)} on ${platform === "linkedin" ? "LinkedIn" : platform === "x" ? "X" : "Reddit"}`,
      };
    })
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 4);

  const summary =
    input.sequences.length === 0
      ? "No compact cross-platform arc is strong enough to surface right now."
      : `${input.sequences.length} compact sequence${input.sequences.length === 1 ? "" : "s"} currently connect ${sequenceSignalIds.size} signal${sequenceSignalIds.size === 1 ? "" : "s"} across multiple platforms.`;

  return {
    sequenceCount: input.sequences.length,
    sequencedSignalCount: sequenceSignalIds.size,
    sequencedPostedCount: sequencedPostedEntries.length,
    strongOutcomeCount,
    topRolePlatformRows,
    summary,
  };
}
