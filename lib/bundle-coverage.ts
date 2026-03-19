import type { AuditEvent } from "@/lib/audit";
import type { SignalFeedback } from "@/lib/feedback-definitions";
import type { PatternFeedbackEntry } from "@/lib/pattern-feedback-definitions";
import { buildPatternCoverageRecords, type PatternCoverageRecord } from "@/lib/pattern-coverage";
import type { PatternBundle } from "@/lib/pattern-bundles";
import type { SignalPattern } from "@/lib/pattern-definitions";
import {
  buildPatternEffectivenessSummaries,
  isPatternActive,
  type PatternEffectivenessSummary,
} from "@/lib/patterns";
import type { SignalRecord } from "@/types/signal";

export type BundleCoverageStrength =
  | "strong_coverage"
  | "partial_coverage"
  | "thin_bundle"
  | "inactive_bundle";

export const BUNDLE_COVERAGE_STRENGTH_LABELS: Record<BundleCoverageStrength, string> = {
  strong_coverage: "Strong coverage",
  partial_coverage: "Partial coverage",
  thin_bundle: "Thin bundle",
  inactive_bundle: "Inactive bundle",
};

type BundleFamilyDefinition = {
  label: string;
  description: string;
  keywords: string[];
  gapTypes?: string[];
};

const BUNDLE_FAMILY_DEFINITIONS: BundleFamilyDefinition[] = [
  {
    label: "Parent complaint / de-escalation",
    description: "Difficult parent communication where the teacher needs calm de-escalation, clarity, and safe response language.",
    keywords: ["parent complaint", "parent", "complaint", "de-escalat", "delayed repl", "difficult parent", "after-hours", "reply window"],
    gapTypes: ["Boundary-setting without escalation"],
  },
  {
    label: "Complaint clarification / misunderstanding response",
    description: "Messages that clarify expectations, untangle misunderstanding, or reset unclear communication without becoming defensive.",
    keywords: ["clarif", "misunderstand", "unclear", "confus", "mixed messages", "expectation", "follow-up clarification"],
    gapTypes: ["Parent confusion / unclear communication"],
  },
  {
    label: "Behaviour incident communication",
    description: "Teacher-facing or parent-facing communication about incidents, repeated behaviour, and calm follow-up.",
    keywords: ["behaviour", "behavior", "incident", "classroom incident", "conduct", "follow-up", "disruption", "escalat"],
    gapTypes: ["Low-level behaviour concern messaging", "Incident explanation and follow-up"],
  },
  {
    label: "Neutral factual documentation",
    description: "Reusable documentation patterns that prioritise neutral, factual, evidence-safe wording.",
    keywords: ["document", "documentation", "factual", "neutral", "objective", "record", "reporting", "evidence-led"],
    gapTypes: ["Documentation clarity and neutral reporting"],
  },
  {
    label: "Progress concern / difficult feedback",
    description: "Communication around student progress, emerging concern, and difficult conversations before the full evidence picture is complete.",
    keywords: ["progress", "feedback", "concern", "evidence", "intervention", "achievement", "support concern", "data incomplete"],
    gapTypes: ["Student progress concern without evidence"],
  },
  {
    label: "Boundary-setting / expectation management",
    description: "Messages that set clear communication boundaries, availability limits, and response expectations without escalation.",
    keywords: ["boundary", "availability", "response window", "expectation", "tone under pressure", "always-on", "after-hours"],
  },
  {
    label: "Planning reset / workload calm-down",
    description: "Families of patterns that reframe planning overload into calmer reusable systems and expectations.",
    keywords: ["planning", "lesson plan", "routine", "weekly", "workload", "structure", "reset", "cognitive load"],
  },
  {
    label: "Policy translation / compliance communication",
    description: "Situations where policy, procedure, or compliance language needs translating into clear teacher-safe communication.",
    keywords: ["policy", "procedure", "protocol", "district", "guidance", "compliance", "rule"],
    gapTypes: ["Policy-to-practice translation"],
  },
];

export interface BundleCoverageAssessment {
  bundleId: string;
  name: string;
  familyLabel: string | null;
  familyDescription: string | null;
  coverageStrength: BundleCoverageStrength;
  note: string;
  suggestedAction: string;
  totalPatternCount: number;
  activePatternCount: number;
  retiredPatternCount: number;
  usedCount: number;
  effectivePatternCount: number;
  weakOrRefinementPatternCount: number;
  relatedSignalCount: number;
  uncoveredRelatedCount: number;
  partiallyCoveredRelatedCount: number;
  gapCandidateCount: number;
}

export interface MissingKitCandidate {
  familyLabel: string;
  familyDescription: string;
  count: number;
  reason: string;
  suggestedAction: string;
  exampleSignalIds: string[];
  relatedBundleIds: string[];
  relatedBundleNames: string[];
}

export interface BundleCoverageSummary {
  bundleCount: number;
  strongCoverageCount: number;
  partialCoverageCount: number;
  thinBundleCount: number;
  inactiveBundleCount: number;
  bundles: BundleCoverageAssessment[];
  missingKitCandidates: MissingKitCandidate[];
}

export interface SignalBundleCoverageHint {
  familyLabel: string | null;
  familyDescription: string | null;
  relatedBundleId: string | null;
  relatedBundleName: string | null;
  relatedBundleStrength: BundleCoverageStrength | null;
  missingKitCandidate: MissingKitCandidate | null;
  note: string | null;
}

type FamilySignalRecord = {
  signalId: string;
  familyLabel: string;
  familyDescription: string;
  status: PatternCoverageRecord["status"];
  gapCandidate: boolean;
};

function buildCombinedText(values: Array<string | null | undefined>): string {
  return values
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function countKeywordHits(text: string, keywords: string[]): number {
  return keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? 1 : 0), 0);
}

function getDefinitionForGapType(gapType: string | null | undefined): BundleFamilyDefinition | null {
  if (!gapType) {
    return null;
  }

  return (
    BUNDLE_FAMILY_DEFINITIONS.find((definition) => definition.gapTypes?.includes(gapType)) ?? null
  );
}

function inferFamilyFromText(text: string): BundleFamilyDefinition | null {
  let bestMatch: { definition: BundleFamilyDefinition; score: number } | null = null;

  for (const definition of BUNDLE_FAMILY_DEFINITIONS) {
    const score = countKeywordHits(text, definition.keywords);

    if (score === 0) {
      continue;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        definition,
        score,
      };
    }
  }

  return bestMatch?.definition ?? null;
}

function inferSignalFamily(
  signal: SignalRecord,
  coverageRecord: PatternCoverageRecord | null | undefined,
): BundleFamilyDefinition | null {
  const gapDefinition = getDefinitionForGapType(coverageRecord?.gapType);
  if (gapDefinition) {
    return gapDefinition;
  }

  const combined = buildCombinedText([
    signal.sourceTitle,
    signal.manualSummary,
    signal.rawExcerpt,
    signal.scenarioAngle,
    signal.signalSubtype,
    signal.teacherPainPoint,
    signal.contentAngle,
    signal.sourceType,
    signal.sourcePublisher,
    signal.signalCategory,
  ]);

  return inferFamilyFromText(combined);
}

function inferBundleFamily(
  bundle: PatternBundle,
  includedPatterns: SignalPattern[],
): BundleFamilyDefinition | null {
  const combined = buildCombinedText([
    bundle.name,
    bundle.description,
    ...includedPatterns.flatMap((pattern) => [
      pattern.name,
      pattern.description,
      pattern.exampleScenarioAngle,
      pattern.exampleSignalSummary,
      pattern.exampleOutput,
      pattern.sourceContext,
      pattern.tags.join(" "),
    ]),
  ]);

  return inferFamilyFromText(combined);
}

function toEffectivenessById(
  summaries: PatternEffectivenessSummary[],
): Record<string, PatternEffectivenessSummary> {
  return Object.fromEntries(summaries.map((summary) => [summary.patternId, summary]));
}

function buildFamilySignalRecords(
  signals: SignalRecord[],
  coverageRecords: PatternCoverageRecord[],
): FamilySignalRecord[] {
  const coverageBySignalId = new Map(coverageRecords.map((record) => [record.signalId, record]));

  return signals
    .map((signal) => {
      const coverageRecord = coverageBySignalId.get(signal.recordId) ?? null;
      const family = inferSignalFamily(signal, coverageRecord);

      if (!coverageRecord || !family) {
        return null;
      }

      return {
        signalId: signal.recordId,
        familyLabel: family.label,
        familyDescription: family.description,
        status: coverageRecord.status,
        gapCandidate: coverageRecord.gapCandidate,
      };
    })
    .filter((record): record is FamilySignalRecord => record !== null);
}

function buildBundleCoverageNote(input: {
  coverageStrength: BundleCoverageStrength;
  activePatternCount: number;
  usedCount: number;
  effectivePatternCount: number;
  uncoveredRelatedCount: number;
  partiallyCoveredRelatedCount: number;
  gapCandidateCount: number;
}): string {
  if (input.coverageStrength === "inactive_bundle") {
    return "This kit has no active patterns, so it is currently reference-only.";
  }

  if (input.coverageStrength === "thin_bundle") {
    if (input.gapCandidateCount > 0) {
      return `This kit exists, but it looks thin: ${input.gapCandidateCount} related signal${input.gapCandidateCount === 1 ? "" : "s"} still surface as gap candidates.`;
    }

    return `This kit looks thin right now with ${input.activePatternCount} active pattern${input.activePatternCount === 1 ? "" : "s"} and ${input.usedCount} recorded uses.`;
  }

  if (input.coverageStrength === "partial_coverage") {
    return `This kit is helping, but related signals still show ${input.uncoveredRelatedCount} uncovered and ${input.partiallyCoveredRelatedCount} partially covered cases.`;
  }

  return `This kit is active and stable with ${input.activePatternCount} active pattern${input.activePatternCount === 1 ? "" : "s"}, ${input.usedCount} recorded uses, and ${input.effectivePatternCount} effective member pattern${input.effectivePatternCount === 1 ? "" : "s"}.`;
}

function getSuggestedAction(coverageStrength: BundleCoverageStrength): string {
  if (coverageStrength === "strong_coverage") {
    return "Keep this bundle active and monitor for drift rather than expanding it by default.";
  }

  if (coverageStrength === "inactive_bundle") {
    return "Reactivate or replace the bundle's patterns before relying on this family again.";
  }

  return "Consider expanding this existing bundle with a stronger or more specific pattern.";
}

function deriveCoverageStrength(input: {
  activePatternCount: number;
  usedCount: number;
  effectivePatternCount: number;
  weakOrRefinementPatternCount: number;
  uncoveredRelatedCount: number;
  partiallyCoveredRelatedCount: number;
  gapCandidateCount: number;
}): BundleCoverageStrength {
  if (input.activePatternCount === 0) {
    return "inactive_bundle";
  }

  if (
    input.activePatternCount <= 1 &&
    (input.gapCandidateCount > 0 ||
      input.uncoveredRelatedCount > 0 ||
      (input.usedCount === 0 && input.effectivePatternCount === 0))
  ) {
    return "thin_bundle";
  }

  if (
    input.uncoveredRelatedCount > 0 ||
    input.gapCandidateCount >= 2 ||
    input.partiallyCoveredRelatedCount >= 2 ||
    input.weakOrRefinementPatternCount > input.effectivePatternCount
  ) {
    return "partial_coverage";
  }

  if (
    input.activePatternCount >= 1 &&
    (input.usedCount > 0 || input.effectivePatternCount > 0) &&
    input.uncoveredRelatedCount === 0 &&
    input.gapCandidateCount === 0
  ) {
    return "strong_coverage";
  }

  return "thin_bundle";
}

export function buildBundleCoverageSummary(input: {
  signals: SignalRecord[];
  bundles: PatternBundle[];
  patterns: SignalPattern[];
  auditEvents: AuditEvent[];
  feedbackEntries: SignalFeedback[];
  patternFeedbackEntries: PatternFeedbackEntry[];
}): BundleCoverageSummary {
  const coverageRecords = buildPatternCoverageRecords(
    input.signals,
    input.feedbackEntries,
    input.patterns,
    input.auditEvents,
  );
  const patternById = new Map(input.patterns.map((pattern) => [pattern.id, pattern]));
  const effectivenessById = toEffectivenessById(
    buildPatternEffectivenessSummaries(
      input.patterns,
      input.auditEvents,
      input.patternFeedbackEntries,
      input.feedbackEntries,
    ),
  );
  const familySignalRecords = buildFamilySignalRecords(input.signals, coverageRecords);
  const signalsByFamily = new Map<string, FamilySignalRecord[]>();

  for (const record of familySignalRecords) {
    signalsByFamily.set(record.familyLabel, [...(signalsByFamily.get(record.familyLabel) ?? []), record]);
  }

  const bundleAssessments = input.bundles
    .map((bundle) => {
      const includedPatterns = bundle.patternIds
        .map((patternId) => patternById.get(patternId))
        .filter((pattern): pattern is SignalPattern => Boolean(pattern));
      const family = inferBundleFamily(bundle, includedPatterns);
      const relatedSignals = family ? signalsByFamily.get(family.label) ?? [] : [];
      const activePatterns = includedPatterns.filter((pattern) => isPatternActive(pattern));
      const retiredPatterns = includedPatterns.filter((pattern) => !isPatternActive(pattern));
      const usedCount = includedPatterns.reduce(
        (sum, pattern) => sum + (effectivenessById[pattern.id]?.usedCount ?? 0),
        0,
      );
      const effectivePatternCount = includedPatterns.filter(
        (pattern) => (effectivenessById[pattern.id]?.effectiveCount ?? 0) > 0,
      ).length;
      const weakOrRefinementPatternCount = includedPatterns.filter((pattern) => {
        const effectiveness = effectivenessById[pattern.id];
        return (effectiveness?.weakCount ?? 0) > 0 || (effectiveness?.needsRefinementCount ?? 0) > 0;
      }).length;
      const uncoveredRelatedCount = relatedSignals.filter((signal) => signal.status === "uncovered").length;
      const partiallyCoveredRelatedCount = relatedSignals.filter(
        (signal) => signal.status === "partially_covered",
      ).length;
      const gapCandidateCount = relatedSignals.filter((signal) => signal.gapCandidate).length;
      const coverageStrength = deriveCoverageStrength({
        activePatternCount: activePatterns.length,
        usedCount,
        effectivePatternCount,
        weakOrRefinementPatternCount,
        uncoveredRelatedCount,
        partiallyCoveredRelatedCount,
        gapCandidateCount,
      });

      return {
        bundleId: bundle.id,
        name: bundle.name,
        familyLabel: family?.label ?? null,
        familyDescription: family?.description ?? null,
        coverageStrength,
        note: buildBundleCoverageNote({
          coverageStrength,
          activePatternCount: activePatterns.length,
          usedCount,
          effectivePatternCount,
          uncoveredRelatedCount,
          partiallyCoveredRelatedCount,
          gapCandidateCount,
        }),
        suggestedAction: getSuggestedAction(coverageStrength),
        totalPatternCount: includedPatterns.length,
        activePatternCount: activePatterns.length,
        retiredPatternCount: retiredPatterns.length,
        usedCount,
        effectivePatternCount,
        weakOrRefinementPatternCount,
        relatedSignalCount: relatedSignals.length,
        uncoveredRelatedCount,
        partiallyCoveredRelatedCount,
        gapCandidateCount,
      } satisfies BundleCoverageAssessment;
    })
    .sort((left, right) => {
      if (right.gapCandidateCount !== left.gapCandidateCount) {
        return right.gapCandidateCount - left.gapCandidateCount;
      }

      if (left.coverageStrength !== right.coverageStrength) {
        return left.coverageStrength.localeCompare(right.coverageStrength);
      }

      return left.name.localeCompare(right.name);
    });

  const bundlesByFamily = new Map<string, BundleCoverageAssessment[]>();
  for (const bundle of bundleAssessments) {
    if (!bundle.familyLabel) {
      continue;
    }

    bundlesByFamily.set(bundle.familyLabel, [...(bundlesByFamily.get(bundle.familyLabel) ?? []), bundle]);
  }

  const missingKitCandidates = Array.from(signalsByFamily.entries())
    .map(([familyLabel, records]) => {
      const gapCandidateCount = records.filter((record) => record.gapCandidate).length;
      const uncoveredCount = records.filter((record) => record.status === "uncovered").length;
      const relatedBundles = bundlesByFamily.get(familyLabel) ?? [];
      const strongestBundle = [...relatedBundles].sort((left, right) => {
        const leftScore =
          (left.coverageStrength === "strong_coverage" ? 4 : 0) +
          (left.coverageStrength === "partial_coverage" ? 3 : 0) +
          (left.coverageStrength === "thin_bundle" ? 2 : 0) +
          (left.coverageStrength === "inactive_bundle" ? 1 : 0);
        const rightScore =
          (right.coverageStrength === "strong_coverage" ? 4 : 0) +
          (right.coverageStrength === "partial_coverage" ? 3 : 0) +
          (right.coverageStrength === "thin_bundle" ? 2 : 0) +
          (right.coverageStrength === "inactive_bundle" ? 1 : 0);

        return rightScore - leftScore || left.name.localeCompare(right.name);
      })[0];
      const shouldSurface =
        gapCandidateCount >= 2 ||
        (uncoveredCount >= 2 && (relatedBundles.length === 0 || strongestBundle?.coverageStrength !== "strong_coverage"));

      if (!shouldSurface) {
        return null;
      }

      const familyDescription = records[0]?.familyDescription ?? "Recurring signals in this family are still weakly covered.";
      const hasUsefulBundle =
        strongestBundle &&
        (strongestBundle.coverageStrength === "strong_coverage" ||
          strongestBundle.coverageStrength === "partial_coverage");

      if (hasUsefulBundle && gapCandidateCount < 2) {
        return null;
      }

      const reason =
        relatedBundles.length === 0
          ? "No active bundle currently covers this family well."
          : strongestBundle?.coverageStrength === "thin_bundle" || strongestBundle?.coverageStrength === "inactive_bundle"
            ? `A related bundle exists, but ${strongestBundle.name} still looks thin.`
            : "Signals in this family still point to a missing or underdeveloped kit.";

      return {
        familyLabel,
        familyDescription,
        count: Math.max(gapCandidateCount, uncoveredCount),
        reason,
        suggestedAction:
          relatedBundles.length === 0
            ? "Consider creating a new bundle for this family."
            : "Consider expanding the current bundle or splitting this family more clearly.",
        exampleSignalIds: records
          .filter((record) => record.gapCandidate || record.status !== "covered")
          .slice(0, 3)
          .map((record) => record.signalId),
        relatedBundleIds: relatedBundles.map((bundle) => bundle.bundleId),
        relatedBundleNames: relatedBundles.map((bundle) => bundle.name),
      } satisfies MissingKitCandidate;
    })
    .filter((candidate): candidate is MissingKitCandidate => candidate !== null)
    .sort((left, right) => right.count - left.count || left.familyLabel.localeCompare(right.familyLabel))
    .slice(0, 4);

  return {
    bundleCount: bundleAssessments.length,
    strongCoverageCount: bundleAssessments.filter((bundle) => bundle.coverageStrength === "strong_coverage").length,
    partialCoverageCount: bundleAssessments.filter((bundle) => bundle.coverageStrength === "partial_coverage").length,
    thinBundleCount: bundleAssessments.filter((bundle) => bundle.coverageStrength === "thin_bundle").length,
    inactiveBundleCount: bundleAssessments.filter((bundle) => bundle.coverageStrength === "inactive_bundle").length,
    bundles: bundleAssessments,
    missingKitCandidates,
  };
}

export function getSignalBundleCoverageHint(input: {
  signal: SignalRecord;
  coverageRecord: PatternCoverageRecord | null | undefined;
  summary: BundleCoverageSummary;
}): SignalBundleCoverageHint {
  const family = inferSignalFamily(input.signal, input.coverageRecord);
  if (!family) {
    return {
      familyLabel: null,
      familyDescription: null,
      relatedBundleId: null,
      relatedBundleName: null,
      relatedBundleStrength: null,
      missingKitCandidate: null,
      note: null,
    };
  }

  const relatedBundles = input.summary.bundles.filter((bundle) => bundle.familyLabel === family.label);
  const relatedBundle = [...relatedBundles].sort((left, right) => {
    const weights: Record<BundleCoverageStrength, number> = {
      strong_coverage: 4,
      partial_coverage: 3,
      thin_bundle: 2,
      inactive_bundle: 1,
    };

    return weights[right.coverageStrength] - weights[left.coverageStrength] || left.name.localeCompare(right.name);
  })[0];
  const missingKitCandidate =
    input.summary.missingKitCandidates.find((candidate) => candidate.familyLabel === family.label) ?? null;

  let note: string | null = null;
  if (missingKitCandidate) {
    note = `This may belong to a missing kit: ${missingKitCandidate.familyLabel}.`;
  } else if (
    relatedBundle &&
    (relatedBundle.coverageStrength === "thin_bundle" || relatedBundle.coverageStrength === "partial_coverage")
  ) {
    note = `Related kit exists, but ${relatedBundle.name} still looks ${BUNDLE_COVERAGE_STRENGTH_LABELS[relatedBundle.coverageStrength].toLowerCase()}.`;
  }

  return {
    familyLabel: family.label,
    familyDescription: family.description,
    relatedBundleId: relatedBundle?.bundleId ?? null,
    relatedBundleName: relatedBundle?.name ?? null,
    relatedBundleStrength: relatedBundle?.coverageStrength ?? null,
    missingKitCandidate,
    note,
  };
}
