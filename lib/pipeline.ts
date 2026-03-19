import { z } from "zod";

import { assessApprovalReadiness, assessAutoGenerate, assessAutoInterpret, type ApprovalAssetSuggestion } from "@/lib/auto-advance";
import {
  appendAutoRepairHistory,
  assessAutoRepairPlan,
  buildAutoRepairHistoryEntry,
  getLatestAutoRepairEntry,
} from "@/lib/auto-repair";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import { appendAuditEventsSafe, buildRecommendationEvent, buildScoredEvent, type AuditEventInput } from "@/lib/audit";
import { listSignalsWithFallback, saveSignalWithFallback } from "@/lib/airtable";
import { assignSignalContentContext, buildCampaignCadenceSummary, getCampaignStrategy } from "@/lib/campaigns";
import { buildSignalAssetBundle } from "@/lib/assets";
import { listFeedbackEntries } from "@/lib/feedback";
import { generateDrafts, toGenerationInputFromSignal } from "@/lib/generator";
import { assembleGuidanceForSignal } from "@/lib/guidance";
import { runIngestion } from "@/lib/ingestion/service";
import { interpretSignal, toInterpretationInput } from "@/lib/interpreter";
import { listPostingOutcomes } from "@/lib/outcomes";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { getPipelineGateDecision } from "@/lib/pipeline-rules";
import { listPatterns } from "@/lib/patterns";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { listPostingLogEntries } from "@/lib/posting-log";
import { buildSignalPublishPrepBundle, stringifyPublishPrepBundle } from "@/lib/publish-prep";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import {
  assessRepurposingEligibility,
  buildRepurposingBundle,
  stringifyRepurposingBundle,
  stringifySelectedRepurposedOutputIds,
} from "@/lib/repurposing";
import { SCENARIO_ANGLE_QUALITY_LEVELS, getSavedScenarioAngleReuseDecision } from "@/lib/scenario-angle";
import { scoreSignal } from "@/lib/scoring";
import { getOperatorTuning } from "@/lib/tuning";
import { buildWeeklyPlanState, getCurrentWeeklyPlan } from "@/lib/weekly-plan";
import { hasGeneration, hasInterpretation, hasScoring, isFilteredOutSignal } from "@/lib/workflow";
import type { IngestionRunSummary } from "@/lib/ingestion/types";
import type { ScenarioAngleQuality } from "@/lib/scenario-angle";
import type { SignalDataSource, SignalRecord, SignalScoringResult } from "@/types/signal";

const pipelineRecordStageSchema = z.enum(["Scored", "Interpreted", "Draft Generated"]);

const pipelineRecordSummarySchema = z.object({
  recordId: z.string().trim().min(1),
  sourceTitle: z.string().trim().min(1),
  recommendation: z.enum(["Keep", "Review", "Reject"]),
  qualityGateResult: z.enum(["Pass", "Needs Review", "Fail"]),
  reviewPriority: z.enum(["Low", "Medium", "High", "Urgent"]),
  scenarioAngleQuality: z.enum(SCENARIO_ANGLE_QUALITY_LEVELS).nullable(),
  usedSavedScenarioAngleForInterpretation: z.boolean(),
  usedSavedScenarioAngleForGeneration: z.boolean(),
  stageReached: pipelineRecordStageSchema,
  statusBefore: z.enum(["New", "Interpreted", "Draft Generated", "Reviewed", "Approved", "Scheduled", "Posted", "Archived", "Rejected"]),
  statusAfter: z.enum(["New", "Interpreted", "Draft Generated", "Reviewed", "Approved", "Scheduled", "Posted", "Archived", "Rejected"]),
  decisionSummary: z.string().trim().min(1),
  persisted: z.boolean(),
});

const pipelineScenarioAngleReuseRecordSchema = z.object({
  recordId: z.string().trim().min(1),
  sourceTitle: z.string().trim().min(1),
  quality: z.enum(SCENARIO_ANGLE_QUALITY_LEVELS),
});

const pipelineErrorSchema = z.object({
  stage: z.string().trim().min(1),
  sourceId: z.string().trim().min(1).optional(),
  recordId: z.string().trim().min(1).optional(),
  message: z.string().trim().min(1),
});

const approvalAssetSuggestionSchema = z.object({
  type: z.enum(["image", "carousel", "short_video", "text_first"]),
  label: z.string().trim().min(1),
  summary: z.string().trim().min(1),
});

const autonomousRunRecordSchema = z.object({
  recordId: z.string().trim().min(1),
  sourceTitle: z.string().trim().min(1),
  stage: z.enum(["auto_interpret", "auto_generate", "auto_prepare_for_review"]),
  decision: z.enum(["advance", "hold", "approval_ready"]),
  confidenceLevel: z.enum(["high", "moderate", "low"]).nullable(),
  summary: z.string().trim().min(1),
  reasons: z.array(z.string().trim().min(1)).max(3),
  strongestCaution: z.string().trim().min(1).nullable(),
  draftQualityLabel: z.enum(["Strong", "Needs Review", "Weak"]).nullable(),
  suggestedPlatformPriority: z.string().trim().min(1).nullable(),
  assetSuggestion: approvalAssetSuggestionSchema.nullable(),
  repairType: z
    .enum([
      "scenario_angle_reframe",
      "editorial_mode_shift",
      "pattern_fallback",
      "playbook_supported_reframe",
      "generation_retry",
    ])
    .nullable(),
  repairOutcome: z.enum(["repaired_promoted", "repaired_still_held"]).nullable(),
  repairSummary: z.string().trim().min(1).nullable(),
  persisted: z.boolean(),
});

const autonomousRunCandidateSchema = autonomousRunRecordSchema.extend({
  rankScore: z.number(),
  rankReasons: z.array(z.string().trim().min(1)).max(3),
});

export const pipelineRunSummarySchema = z.object({
  reuseSavedScenarioAnglesEnabled: z.boolean(),
  ingestion: z
    .object({
      sourcesChecked: z.number().int().nonnegative(),
      itemsFetched: z.number().int().nonnegative(),
      itemsImported: z.number().int().nonnegative(),
      itemsSkippedDuplicates: z.number().int().nonnegative(),
    })
    .nullable(),
  candidatesScored: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  reviewOnly: z.number().int().nonnegative(),
  interpreted: z.number().int().nonnegative(),
  generated: z.number().int().nonnegative(),
  scenarioAnglesReused: z.number().int().nonnegative(),
  scenarioAnglesIgnored: z.number().int().nonnegative(),
  recordsInterpretedWithSavedAngle: z.array(pipelineScenarioAngleReuseRecordSchema),
  recordsGeneratedWithSavedAngle: z.array(pipelineScenarioAngleReuseRecordSchema),
  records: z.object({
    rejected: z.array(pipelineRecordSummarySchema),
    reviewOnly: z.array(pipelineRecordSummarySchema),
    interpreted: z.array(pipelineRecordSummarySchema),
    generated: z.array(pipelineRecordSummarySchema),
  }),
  errors: z.array(pipelineErrorSchema),
  touchedRecordIds: z.array(z.string().trim().min(1)),
  message: z.string().trim().min(1),
});

export type PipelineRunSummary = z.infer<typeof pipelineRunSummarySchema>;

export const autonomousRunSummarySchema = z.object({
  ingestion: z
    .object({
      sourcesChecked: z.number().int().nonnegative(),
      itemsFetched: z.number().int().nonnegative(),
      itemsImported: z.number().int().nonnegative(),
      itemsSkippedDuplicates: z.number().int().nonnegative(),
    })
    .nullable(),
  candidatesScored: z.number().int().nonnegative(),
  autoInterpreted: z.number().int().nonnegative(),
  autoGenerated: z.number().int().nonnegative(),
  autoRepairPromoted: z.number().int().nonnegative(),
  autoRepairHeld: z.number().int().nonnegative(),
  approvalReady: z.number().int().nonnegative(),
  held: z.number().int().nonnegative(),
  records: z.object({
    autoInterpreted: z.array(autonomousRunRecordSchema),
    autoGenerated: z.array(autonomousRunRecordSchema),
    repairedPromoted: z.array(autonomousRunRecordSchema),
    repairedHeld: z.array(autonomousRunRecordSchema),
    approvalReady: z.array(autonomousRunCandidateSchema),
    held: z.array(autonomousRunRecordSchema),
  }),
  topCandidates: z.array(autonomousRunCandidateSchema),
  errors: z.array(pipelineErrorSchema),
  touchedRecordIds: z.array(z.string().trim().min(1)),
  message: z.string().trim().min(1),
});

export type AutonomousRunSummary = z.infer<typeof autonomousRunSummarySchema>;

export interface PipelineRunOptions {
  ingestFresh?: boolean;
  sourceIds?: string[];
  maxCandidates?: number;
  reuseSavedScenarioAngles?: boolean;
}

export interface AutonomousRunOptions {
  ingestFresh?: boolean;
  sourceIds?: string[];
  maxCandidates?: number;
  reuseSavedScenarioAngles?: boolean;
}

function buildScoringUpdate(scoring: SignalScoringResult) {
  return {
    signalRelevanceScore: scoring.signalRelevanceScore,
    signalNoveltyScore: scoring.signalNoveltyScore,
    signalUrgencyScore: scoring.signalUrgencyScore,
    brandFitScore: scoring.brandFitScore,
    sourceTrustScore: scoring.sourceTrustScore,
    keepRejectRecommendation: scoring.keepRejectRecommendation,
    whySelected: scoring.whySelected,
    whyRejected: scoring.whyRejected,
    needsHumanReview: scoring.needsHumanReview,
    qualityGateResult: scoring.qualityGateResult,
    reviewPriority: scoring.reviewPriority,
    similarityToExistingContent: scoring.similarityToExistingContent,
    duplicateClusterId: scoring.duplicateClusterId,
  } as const;
}

function buildInterpretationUpdate(signal: SignalRecord) {
  const interpretation = interpretSignal(toInterpretationInput(signal));

  return {
    interpretation,
    update: {
      signalCategory: interpretation.signalCategory,
      severityScore: interpretation.severityScore,
      signalSubtype: interpretation.signalSubtype,
      emotionalPattern: interpretation.emotionalPattern,
      teacherPainPoint: interpretation.teacherPainPoint,
      relevanceToZazaDraft: interpretation.relevanceToZazaDraft,
      riskToTeacher: interpretation.riskToTeacher,
      interpretationNotes: interpretation.interpretationNotes,
      hookTemplateUsed: interpretation.hookTemplateUsed,
      contentAngle: interpretation.contentAngle,
      platformPriority: interpretation.platformPriority,
      suggestedFormatPriority: interpretation.suggestedFormatPriority,
      needsHumanReview: true,
      status: "Interpreted" as const,
    },
  };
}

function buildSummaryRecord(
  signalBefore: SignalRecord,
  signalAfter: SignalRecord,
  scoring: SignalScoringResult,
  stageReached: z.infer<typeof pipelineRecordStageSchema>,
  decisionSummary: string,
  persisted: boolean,
  options?: {
    scenarioAngleQuality?: ScenarioAngleQuality | null;
    usedSavedScenarioAngleForInterpretation?: boolean;
    usedSavedScenarioAngleForGeneration?: boolean;
  },
) {
  return pipelineRecordSummarySchema.parse({
    recordId: signalAfter.recordId,
    sourceTitle: signalAfter.sourceTitle,
    recommendation: scoring.keepRejectRecommendation,
    qualityGateResult: scoring.qualityGateResult,
    reviewPriority: scoring.reviewPriority,
    scenarioAngleQuality: options?.scenarioAngleQuality ?? null,
    usedSavedScenarioAngleForInterpretation: options?.usedSavedScenarioAngleForInterpretation ?? false,
    usedSavedScenarioAngleForGeneration: options?.usedSavedScenarioAngleForGeneration ?? false,
    stageReached,
    statusBefore: signalBefore.status,
    statusAfter: signalAfter.status,
    decisionSummary,
    persisted,
  });
}

function buildIngestionSnapshot(result: IngestionRunSummary | null) {
  if (!result) {
    return null;
  }

  return {
    sourcesChecked: result.sourcesChecked,
    itemsFetched: result.itemsFetched,
    itemsImported: result.itemsImported,
    itemsSkippedDuplicates: result.itemsSkippedDuplicates,
  };
}

function buildPipelineMessage(summary: PipelineRunSummary, source: SignalDataSource): string {
  if (summary.candidatesScored === 0) {
    return source === "airtable"
      ? "Pipeline run completed. No new candidates met the scoring criteria for this bounded pass."
      : "Pipeline run completed in mock mode. No new candidates met the scoring criteria for this bounded pass.";
  }

  const sourcePrefix = source === "airtable" ? "Pipeline run completed." : "Pipeline run completed in mock mode.";
  const scenarioSummary = summary.reuseSavedScenarioAnglesEnabled
    ? ` Saved scenario framing was reused on ${summary.scenarioAnglesReused} records and ignored on ${summary.scenarioAnglesIgnored} records.`
    : " Saved scenario framing reuse was disabled for this run.";

  return `${sourcePrefix} ${summary.generated} records ${source === "airtable" ? "advanced to draft generation" : "reached draft generation"}, ${summary.interpreted} ${source === "airtable" ? "advanced to interpretation only" : "reached interpretation"}, ${summary.reviewOnly} were held for review, and ${summary.rejected} were filtered out.${scenarioSummary}`;
}

function applyScenarioAngleOverride(signal: SignalRecord, scenarioAngle: string | null): SignalRecord {
  return {
    ...signal,
    scenarioAngle,
  };
}

function replaceSignal(signals: SignalRecord[], nextSignal: SignalRecord): SignalRecord[] {
  const index = signals.findIndex((signal) => signal.recordId === nextSignal.recordId);
  if (index === -1) {
    return [nextSignal, ...signals];
  }

  return signals.map((signal) => (signal.recordId === nextSignal.recordId ? nextSignal : signal));
}

function buildContentContextMetadata(signal: SignalRecord) {
  return {
    campaignId: signal.campaignId,
    pillarId: signal.pillarId,
    audienceSegmentId: signal.audienceSegmentId,
    funnelStage: signal.funnelStage,
    ctaGoal: signal.ctaGoal,
  };
}

function sortAutonomousTargets(signals: SignalRecord[]): SignalRecord[] {
  const priorityWeight: Record<NonNullable<SignalRecord["reviewPriority"]>, number> = {
    Urgent: 4,
    High: 3,
    Medium: 2,
    Low: 1,
  };

  return [...signals].sort(
    (left, right) =>
      (priorityWeight[right.reviewPriority ?? "Low"] ?? 0) - (priorityWeight[left.reviewPriority ?? "Low"] ?? 0) ||
      (right.signalUrgencyScore ?? 0) - (left.signalUrgencyScore ?? 0) ||
      new Date(right.createdDate).getTime() - new Date(left.createdDate).getTime() ||
      left.sourceTitle.localeCompare(right.sourceTitle),
  );
}

function buildAutonomousRecord(input: {
  signal: SignalRecord;
  stage: z.infer<typeof autonomousRunRecordSchema>["stage"];
  decision: z.infer<typeof autonomousRunRecordSchema>["decision"];
  summary: string;
  reasons: string[];
  confidenceLevel?: z.infer<typeof autonomousRunRecordSchema>["confidenceLevel"];
  strongestCaution?: string | null;
  draftQualityLabel?: z.infer<typeof autonomousRunRecordSchema>["draftQualityLabel"];
  suggestedPlatformPriority?: string | null;
  assetSuggestion?: ApprovalAssetSuggestion | null;
  repairType?: z.infer<typeof autonomousRunRecordSchema>["repairType"];
  repairOutcome?: z.infer<typeof autonomousRunRecordSchema>["repairOutcome"];
  repairSummary?: string | null;
  persisted: boolean;
}) {
  const latestRepair = getLatestAutoRepairEntry(input.signal);
  return autonomousRunRecordSchema.parse({
    recordId: input.signal.recordId,
    sourceTitle: input.signal.sourceTitle,
    stage: input.stage,
    decision: input.decision,
    confidenceLevel: input.confidenceLevel ?? null,
    summary: input.summary,
    reasons: input.reasons.slice(0, 3),
    strongestCaution: input.strongestCaution ?? null,
    draftQualityLabel: input.draftQualityLabel ?? null,
    suggestedPlatformPriority: input.suggestedPlatformPriority ?? null,
    assetSuggestion: input.assetSuggestion ?? null,
    repairType: input.repairType ?? (latestRepair?.outcome === "not_repairable" ? null : latestRepair?.repairType ?? null),
    repairOutcome: input.repairOutcome ?? (latestRepair?.outcome === "not_repairable" ? null : latestRepair?.outcome ?? null),
    repairSummary: input.repairSummary ?? latestRepair?.summary ?? null,
    persisted: input.persisted,
  });
}

export async function runPipeline(options: PipelineRunOptions = {}): Promise<{
  source: SignalDataSource;
  result: PipelineRunSummary;
}> {
  const shouldIngestFresh = options.ingestFresh ?? true;
  const maxCandidates = Math.min(Math.max(options.maxCandidates ?? 15, 1), 30);
  const reuseSavedScenarioAngles = options.reuseSavedScenarioAngles ?? true;
  const tuning = await getOperatorTuning();

  let source: SignalDataSource = "mock";
  let ingestionResult: IngestionRunSummary | null = null;
  const errors: PipelineRunSummary["errors"] = [];

  if (shouldIngestFresh) {
    const ingestionRun = await runIngestion(options.sourceIds);
    source = ingestionRun.mode;
    ingestionResult = ingestionRun.result;

    for (const sourceResult of ingestionRun.result.sourceResults) {
      for (const message of sourceResult.errors) {
        errors.push(
          pipelineErrorSchema.parse({
            stage: "ingest",
            sourceId: sourceResult.sourceId,
            message,
          }),
        );
      }
    }
  }

  const signalResult = await listSignalsWithFallback({ limit: 500 });
  source = signalResult.source;
  if (signalResult.error) {
    errors.push(
      pipelineErrorSchema.parse({
        stage: "load-signals",
        message: signalResult.error,
      }),
    );
  }

  const targets = signalResult.signals
    .filter((signal) => signal.status === "New")
    .filter((signal) => !hasScoring(signal))
    .slice(0, maxCandidates);

  const rejected: PipelineRunSummary["records"]["rejected"] = [];
  const reviewOnly: PipelineRunSummary["records"]["reviewOnly"] = [];
  const interpreted: PipelineRunSummary["records"]["interpreted"] = [];
  const generated: PipelineRunSummary["records"]["generated"] = [];
  const recordsInterpretedWithSavedAngle: PipelineRunSummary["recordsInterpretedWithSavedAngle"] = [];
  const recordsGeneratedWithSavedAngle: PipelineRunSummary["recordsGeneratedWithSavedAngle"] = [];
  const auditEvents: AuditEventInput[] = [];
  const touchedRecordIds = new Set<string>();
  const reusedScenarioAngleRecordIds = new Set<string>();
  const ignoredScenarioAngleRecordIds = new Set<string>();
  let candidatesScored = 0;

  for (const signal of targets) {
    const scoring = scoreSignal(signal, signalResult.signals, tuning.settings);
    const savedScoring = await saveSignalWithFallback(signal.recordId, buildScoringUpdate(scoring));

    if (!savedScoring.signal) {
      errors.push(
        pipelineErrorSchema.parse({
          stage: "score",
          recordId: signal.recordId,
          message: savedScoring.error ?? "Unable to save scoring output.",
        }),
      );
      continue;
    }

    candidatesScored += 1;
    touchedRecordIds.add(signal.recordId);
    auditEvents.push(
      buildScoredEvent(savedScoring.signal, scoring),
      buildRecommendationEvent(savedScoring.signal, tuning.settings),
    );

    const scoredSignal = savedScoring.signal;
    const decision = getPipelineGateDecision(scoring);

    if (decision.action === "reject") {
      rejected.push(buildSummaryRecord(signal, scoredSignal, scoring, "Scored", decision.summary, savedScoring.persisted));
      continue;
    }

    if (decision.action === "review") {
      reviewOnly.push(buildSummaryRecord(signal, scoredSignal, scoring, "Scored", decision.summary, savedScoring.persisted));
      continue;
    }

    const savedScenarioAngleDecision = getSavedScenarioAngleReuseDecision({
      scenarioAngle: scoredSignal.scenarioAngle,
      sourceTitle: scoredSignal.sourceTitle,
      reuseAllowed: reuseSavedScenarioAngles,
    });
    const interpretationSignal = applyScenarioAngleOverride(
      scoredSignal,
      savedScenarioAngleDecision.reusableScenarioAngle,
    );
    const interpretationStage = buildInterpretationUpdate(interpretationSignal);
    const savedInterpretation = await saveSignalWithFallback(signal.recordId, interpretationStage.update);

    if (!savedInterpretation.signal) {
      errors.push(
        pipelineErrorSchema.parse({
          stage: "interpret",
          recordId: signal.recordId,
          message: savedInterpretation.error ?? "Unable to save interpretation output.",
        }),
      );
      reviewOnly.push(
        buildSummaryRecord(
          signal,
          scoredSignal,
          scoring,
          "Scored",
          `${decision.summary} ${savedScenarioAngleDecision.ignoreReason ?? ""} Interpretation could not be saved, so the record remains in scoring-only state.`.trim(),
          savedScoring.persisted,
          {
            scenarioAngleQuality: savedScenarioAngleDecision.hasSavedScenarioAngle ? savedScenarioAngleDecision.assessment.quality : null,
          },
        ),
      );
      continue;
    }

    const interpretedSignal = savedInterpretation.signal;
    auditEvents.push({
      signalId: interpretedSignal.recordId,
      eventType: "INTERPRETATION_SAVED",
      actor: "system",
      summary: savedScenarioAngleDecision.shouldReuse
        ? "Pipeline saved interpretation using stored scenario framing."
        : "Pipeline saved interpretation.",
      metadata: {
        reusedScenarioAngle: savedScenarioAngleDecision.shouldReuse,
      },
    });
    if (savedScenarioAngleDecision.shouldReuse) {
      reusedScenarioAngleRecordIds.add(signal.recordId);
      recordsInterpretedWithSavedAngle.push(
        pipelineScenarioAngleReuseRecordSchema.parse({
          recordId: interpretedSignal.recordId,
          sourceTitle: interpretedSignal.sourceTitle,
          quality: savedScenarioAngleDecision.assessment.quality,
        }),
      );
    } else if (savedScenarioAngleDecision.wasIgnored) {
      ignoredScenarioAngleRecordIds.add(signal.recordId);
    }

    if (!decision.shouldGenerate) {
      interpreted.push(
        buildSummaryRecord(
          signal,
          interpretedSignal,
          scoring,
          "Interpreted",
          `${decision.summary}${savedScenarioAngleDecision.shouldReuse ? " Saved scenario framing was reused during interpretation." : savedScenarioAngleDecision.ignoreReason ? ` ${savedScenarioAngleDecision.ignoreReason}` : ""}`,
          savedScoring.persisted && savedInterpretation.persisted,
          {
            scenarioAngleQuality: savedScenarioAngleDecision.hasSavedScenarioAngle ? savedScenarioAngleDecision.assessment.quality : null,
            usedSavedScenarioAngleForInterpretation: savedScenarioAngleDecision.shouldReuse,
          },
        ),
      );
      auditEvents.push(buildRecommendationEvent(interpretedSignal, tuning.settings));
      continue;
    }

    const generationSignal = applyScenarioAngleOverride(
      interpretedSignal,
      savedScenarioAngleDecision.reusableScenarioAngle,
    );
    const generationInput = toGenerationInputFromSignal(generationSignal);
    if (!generationInput) {
      errors.push(
        pipelineErrorSchema.parse({
          stage: "generate",
          recordId: signal.recordId,
          message: "Interpretation was saved, but generation input could not be assembled from the record.",
        }),
      );
      interpreted.push(
        buildSummaryRecord(
          signal,
          interpretedSignal,
          scoring,
          "Interpreted",
          `${decision.summary}${savedScenarioAngleDecision.shouldReuse ? " Saved scenario framing was reused during interpretation." : savedScenarioAngleDecision.ignoreReason ? ` ${savedScenarioAngleDecision.ignoreReason}` : ""} Generation input was incomplete, so the record stopped after interpretation.`,
          savedScoring.persisted && savedInterpretation.persisted,
          {
            scenarioAngleQuality: savedScenarioAngleDecision.hasSavedScenarioAngle ? savedScenarioAngleDecision.assessment.quality : null,
            usedSavedScenarioAngleForInterpretation: savedScenarioAngleDecision.shouldReuse,
          },
        ),
      );
      auditEvents.push(buildRecommendationEvent(interpretedSignal, tuning.settings));
      continue;
    }

    const generationRun = await generateDrafts(generationInput);
    const draftOutputs = generationRun.outputs;
    const savedGeneration = await saveSignalWithFallback(signal.recordId, {
      xDraft: draftOutputs.xDraft,
      linkedInDraft: draftOutputs.linkedInDraft,
      redditDraft: draftOutputs.redditDraft,
      imagePrompt: draftOutputs.imagePrompt,
      videoScript: draftOutputs.videoScript,
      ctaOrClosingLine: draftOutputs.ctaOrClosingLine,
      hashtagsOrKeywords: draftOutputs.hashtagsOrKeywords,
      assetBundleJson: draftOutputs.assetBundleJson ?? null,
      preferredAssetType: draftOutputs.preferredAssetType ?? null,
      selectedImageAssetId: draftOutputs.selectedImageAssetId ?? null,
      selectedVideoConceptId: draftOutputs.selectedVideoConceptId ?? null,
      generatedImageUrl: draftOutputs.generatedImageUrl ?? null,
      generationModelVersion: draftOutputs.generationModelVersion,
      promptVersion: draftOutputs.promptVersion,
      needsHumanReview: true,
      status: "Draft Generated",
    });

    if (!savedGeneration.signal) {
      errors.push(
        pipelineErrorSchema.parse({
          stage: "generate",
          recordId: signal.recordId,
          message: savedGeneration.error ?? "Unable to save generated draft outputs.",
        }),
      );
      interpreted.push(
        buildSummaryRecord(
          signal,
          interpretedSignal,
          scoring,
          "Interpreted",
          `${decision.summary}${savedScenarioAngleDecision.shouldReuse ? " Saved scenario framing was reused for interpretation and generation." : savedScenarioAngleDecision.ignoreReason ? ` ${savedScenarioAngleDecision.ignoreReason}` : ""} Drafts were generated but could not be saved, so the record stopped after interpretation.`,
          savedScoring.persisted && savedInterpretation.persisted,
          {
            scenarioAngleQuality: savedScenarioAngleDecision.hasSavedScenarioAngle ? savedScenarioAngleDecision.assessment.quality : null,
            usedSavedScenarioAngleForInterpretation: savedScenarioAngleDecision.shouldReuse,
            usedSavedScenarioAngleForGeneration: savedScenarioAngleDecision.shouldReuse,
          },
        ),
      );
      auditEvents.push(buildRecommendationEvent(interpretedSignal, tuning.settings));
      continue;
    }

    auditEvents.push({
      signalId: savedGeneration.signal.recordId,
      eventType: "GENERATION_SAVED",
      actor: "system",
      summary: savedScenarioAngleDecision.shouldReuse
        ? "Pipeline saved generated drafts using stored scenario framing."
        : "Pipeline saved generated drafts.",
      metadata: {
        reusedScenarioAngle: savedScenarioAngleDecision.shouldReuse,
        generationSource: draftOutputs.generationSource,
      },
    });
    auditEvents.push(buildRecommendationEvent(savedGeneration.signal, tuning.settings));

    if (savedScenarioAngleDecision.shouldReuse) {
      recordsGeneratedWithSavedAngle.push(
        pipelineScenarioAngleReuseRecordSchema.parse({
          recordId: savedGeneration.signal.recordId,
          sourceTitle: savedGeneration.signal.sourceTitle,
          quality: savedScenarioAngleDecision.assessment.quality,
        }),
      );
    }

    generated.push(
      buildSummaryRecord(
        signal,
        savedGeneration.signal,
        scoring,
        "Draft Generated",
        `${decision.summary}${savedScenarioAngleDecision.shouldReuse ? " Saved scenario framing was reused for interpretation and generation." : savedScenarioAngleDecision.ignoreReason ? ` ${savedScenarioAngleDecision.ignoreReason}` : ""} ${generationRun.message}`,
        savedScoring.persisted && savedInterpretation.persisted && savedGeneration.persisted,
        {
          scenarioAngleQuality: savedScenarioAngleDecision.hasSavedScenarioAngle ? savedScenarioAngleDecision.assessment.quality : null,
          usedSavedScenarioAngleForInterpretation: savedScenarioAngleDecision.shouldReuse,
          usedSavedScenarioAngleForGeneration: savedScenarioAngleDecision.shouldReuse,
        },
      ),
    );
  }

  const draftSummary = {
    reuseSavedScenarioAnglesEnabled: reuseSavedScenarioAngles,
    ingestion: buildIngestionSnapshot(ingestionResult),
    candidatesScored,
    rejected: rejected.length,
    reviewOnly: reviewOnly.length,
    interpreted: interpreted.length,
    generated: generated.length,
    scenarioAnglesReused: reusedScenarioAngleRecordIds.size,
    scenarioAnglesIgnored: ignoredScenarioAngleRecordIds.size,
    recordsInterpretedWithSavedAngle,
    recordsGeneratedWithSavedAngle,
    records: {
      rejected,
      reviewOnly,
      interpreted,
      generated,
    },
    errors,
    touchedRecordIds: Array.from(touchedRecordIds),
    message: "Pipeline run completed.",
  };
  const result = pipelineRunSummarySchema.parse(draftSummary);
  await appendAuditEventsSafe(auditEvents);

  return {
    source,
    result: {
      ...result,
      message: buildPipelineMessage(result, source),
    },
  };
}

export async function runAutonomousPipeline(options: AutonomousRunOptions = {}): Promise<{
  source: SignalDataSource;
  result: AutonomousRunSummary;
}> {
  const shouldIngestFresh = options.ingestFresh ?? true;
  const maxCandidates = Math.min(Math.max(options.maxCandidates ?? 10, 1), 30);
  const reuseSavedScenarioAngles = options.reuseSavedScenarioAngles ?? true;
  const tuning = await getOperatorTuning();

  let source: SignalDataSource = "mock";
  let ingestionResult: IngestionRunSummary | null = null;
  const errors: AutonomousRunSummary["errors"] = [];

  if (shouldIngestFresh) {
    const ingestionRun = await runIngestion(options.sourceIds);
    source = ingestionRun.mode;
    ingestionResult = ingestionRun.result;

    for (const sourceResult of ingestionRun.result.sourceResults) {
      for (const message of sourceResult.errors) {
        errors.push(
          pipelineErrorSchema.parse({
            stage: "ingest",
            sourceId: sourceResult.sourceId,
            message,
          }),
        );
      }
    }
  }

  const signalResult = await listSignalsWithFallback({ limit: 500 });
  source = signalResult.source;
  if (signalResult.error) {
    errors.push(
      pipelineErrorSchema.parse({
        stage: "load-signals",
        message: signalResult.error,
      }),
    );
  }

  const feedbackEntries = await listFeedbackEntries();
  const patterns = await listPatterns();
  const playbookCards = await listPlaybookCards();
  const bundles = await listPatternBundles();
  const postingEntries = await listPostingLogEntries();
  const postingOutcomes = await listPostingOutcomes();
  const strategy = await getCampaignStrategy();
  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(bundles);
  let workingSignals = [...signalResult.signals];
  const touchedRecordIds = new Set<string>();
  const auditEvents: AuditEventInput[] = [];
  const autoInterpreted: AutonomousRunSummary["records"]["autoInterpreted"] = [];
  const autoGenerated: AutonomousRunSummary["records"]["autoGenerated"] = [];
  const repairedPromoted: AutonomousRunSummary["records"]["repairedPromoted"] = [];
  const repairedHeld: AutonomousRunSummary["records"]["repairedHeld"] = [];
  const heldRecords: AutonomousRunSummary["records"]["held"] = [];
  let candidatesScored = 0;

  async function ensureContentContext(signal: SignalRecord, reasonLabel: string): Promise<SignalRecord> {
    const assignment = assignSignalContentContext(signal, strategy);
    const hasChanges =
      assignment.context.campaignId !== signal.campaignId ||
      assignment.context.pillarId !== signal.pillarId ||
      assignment.context.audienceSegmentId !== signal.audienceSegmentId ||
      assignment.context.funnelStage !== signal.funnelStage ||
      assignment.context.ctaGoal !== signal.ctaGoal;

    if (!hasChanges) {
      return signal;
    }

    const savedContext = await saveSignalWithFallback(signal.recordId, assignment.context);
    if (!savedContext.signal) {
      errors.push(
        pipelineErrorSchema.parse({
          stage: "assign-context",
          recordId: signal.recordId,
          message: savedContext.error ?? "Unable to save strategic content context.",
        }),
      );
      return signal;
    }

    touchedRecordIds.add(signal.recordId);
    auditEvents.push({
      signalId: signal.recordId,
      eventType: assignment.autoAssignedKeys.length > 0 ? "CONTEXT_AUTO_ASSIGNED" : "CONTENT_CONTEXT_ASSIGNED",
      actor: "system",
      summary: `${reasonLabel}. ${assignment.summary}`,
      metadata: {
        ...buildContentContextMetadata(savedContext.signal),
      },
    });

    return savedContext.signal;
  }

  function buildGuidance(signal: SignalRecord) {
    const reuseMemoryCases = buildReuseMemoryCases({
      signals: workingSignals,
      postingEntries,
      postingOutcomes,
      bundleSummariesByPatternId,
    });
    const playbookCoverageSummary = buildPlaybookCoverageSummary({
      signals: workingSignals,
      playbookCards,
      postingEntries,
      postingOutcomes,
      bundleSummariesByPatternId,
    });

    return assembleGuidanceForSignal({
      signal,
      context: "review",
      allSignals: workingSignals,
      feedbackEntries,
      patterns,
      bundleSummariesByPatternId,
      playbookCards,
      reuseMemoryCases,
      playbookCoverageSummary,
      tuning: tuning.settings,
    });
  }

  async function persistAutonomousGeneration(
    signal: SignalRecord,
    guidance: ReturnType<typeof buildGuidance>,
  ): Promise<{
    signal: SignalRecord | null;
    generationRun: Awaited<ReturnType<typeof generateDrafts>> | null;
    error: string | null;
  }> {
    const generationInput = toGenerationInputFromSignal(signal);
    if (!generationInput) {
      return {
        signal: null,
        generationRun: null,
        error: "Generation input incomplete",
      };
    }

    const generationRun = await generateDrafts(generationInput, {
      editorialMode: signal.editorialMode ?? "awareness",
    });
    const savedGeneration = await saveSignalWithFallback(signal.recordId, {
      xDraft: generationRun.outputs.xDraft,
      linkedInDraft: generationRun.outputs.linkedInDraft,
      redditDraft: generationRun.outputs.redditDraft,
      imagePrompt: generationRun.outputs.imagePrompt,
      videoScript: generationRun.outputs.videoScript,
      ctaOrClosingLine: generationRun.outputs.ctaOrClosingLine,
      hashtagsOrKeywords: generationRun.outputs.hashtagsOrKeywords,
      assetBundleJson: generationRun.outputs.assetBundleJson ?? null,
      publishPrepBundleJson: generationRun.outputs.publishPrepBundleJson ?? null,
      preferredAssetType: generationRun.outputs.preferredAssetType ?? null,
      selectedImageAssetId: generationRun.outputs.selectedImageAssetId ?? null,
      selectedVideoConceptId: generationRun.outputs.selectedVideoConceptId ?? null,
      generatedImageUrl: generationRun.outputs.generatedImageUrl ?? null,
      generationModelVersion: generationRun.outputs.generationModelVersion,
      promptVersion: generationRun.outputs.promptVersion,
      editorialMode: signal.editorialMode ?? "awareness",
      autoGenerated: true,
      needsHumanReview: true,
      status: "Draft Generated",
    });

    if (!savedGeneration.signal) {
      errors.push(
        pipelineErrorSchema.parse({
          stage: "generate",
          recordId: signal.recordId,
          message: savedGeneration.error ?? "Unable to save generated draft outputs.",
        }),
      );
      return {
        signal: null,
        generationRun,
        error: savedGeneration.error ?? "Generation save failed",
      };
    }

    let generatedWithContext = await ensureContentContext(
      savedGeneration.signal,
      "Autonomous runner assigned strategy context after generation",
    );
    const repurposingEligibility = assessRepurposingEligibility({
      signal: generatedWithContext,
      confidenceLevel: guidance.confidence.confidenceLevel,
    });
    if (repurposingEligibility.eligible) {
      const repurposingBundle = buildRepurposingBundle({
        signal: generatedWithContext,
        assetBundle: buildSignalAssetBundle(generatedWithContext),
      });
      const repurposingSave = await saveSignalWithFallback(generatedWithContext.recordId, {
        repurposingBundleJson: stringifyRepurposingBundle(repurposingBundle),
        selectedRepurposedOutputIdsJson: stringifySelectedRepurposedOutputIds(repurposingBundle.recommendedSubset ?? []),
      });
      if (repurposingSave.signal) {
        generatedWithContext = repurposingSave.signal;
        auditEvents.push({
          signalId: generatedWithContext.recordId,
          eventType: "REPURPOSING_GENERATED",
          actor: "system",
          summary: `Generated ${repurposingBundle.outputs.length} bounded repurposed variants for approval review.`,
          metadata: {
            primaryPlatform: repurposingBundle.primaryPlatform,
            variantCount: repurposingBundle.outputs.length,
          },
        });
      }
    } else if (generatedWithContext.repurposingBundleJson || generatedWithContext.selectedRepurposedOutputIdsJson) {
      const clearedRepurposing = await saveSignalWithFallback(generatedWithContext.recordId, {
        repurposingBundleJson: null,
        selectedRepurposedOutputIdsJson: null,
      });
      if (clearedRepurposing.signal) {
        generatedWithContext = clearedRepurposing.signal;
      }
    }

    const publishPrepBundle = buildSignalPublishPrepBundle(generatedWithContext);
    const publishPrepSave = await saveSignalWithFallback(generatedWithContext.recordId, {
      publishPrepBundleJson: stringifyPublishPrepBundle(publishPrepBundle),
    });
    if (publishPrepSave.signal) {
      generatedWithContext = publishPrepSave.signal;
      const primaryPackage = publishPrepBundle?.packages[0] ?? null;
      auditEvents.push({
        signalId: generatedWithContext.recordId,
        eventType: "PUBLISH_PREP_GENERATED",
        actor: "system",
        summary: `Prepared ${publishPrepBundle?.packages.length ?? 0} publish-prep package${publishPrepBundle?.packages.length === 1 ? "" : "s"} for approval review.`,
        metadata: {
          packageCount: publishPrepBundle?.packages.length ?? 0,
          primaryPlatform: publishPrepBundle?.primaryPlatform ?? null,
        },
      });
      if (primaryPackage?.siteLinkId) {
        auditEvents.push({
          signalId: generatedWithContext.recordId,
          eventType: "SITE_LINK_SELECTED",
          actor: "system",
          summary: `Selected ${primaryPackage.siteLinkLabel ?? primaryPackage.siteLinkId} as the lead site destination for publish prep.`,
          metadata: {
            siteLinkId: primaryPackage.siteLinkId,
            usedFallback: primaryPackage.siteLinkUsedFallback ?? false,
            primaryPlatform: primaryPackage.platform,
          },
        });
      }
    }

    workingSignals = replaceSignal(workingSignals, generatedWithContext);
    touchedRecordIds.add(signal.recordId);

    auditEvents.push({
      signalId: generatedWithContext.recordId,
      eventType: "GENERATION_SAVED",
      actor: "system",
      summary: "Autonomous runner saved generated drafts.",
      metadata: {
        generationSource: generationRun.outputs.generationSource,
      },
    });
    auditEvents.push(buildRecommendationEvent(generatedWithContext, tuning.settings));

    return {
      signal: generatedWithContext,
      generationRun,
      error: null,
    };
  }

  async function attemptHeldRepair(
    signal: SignalRecord,
    guidance: ReturnType<typeof buildGuidance>,
    assessment: ReturnType<typeof assessAutoInterpret> | ReturnType<typeof assessAutoGenerate> | ReturnType<typeof assessApprovalReadiness>,
  ): Promise<{
    repairedSignal: SignalRecord;
    promoted: boolean;
    heldAssessment: ReturnType<typeof assessAutoInterpret> | ReturnType<typeof assessAutoGenerate> | ReturnType<typeof assessApprovalReadiness>;
    repairRecord: z.infer<typeof autonomousRunRecordSchema> | null;
  } | null> {
    const stage = assessment.stage;
    if (!stage || assessment.decision !== "hold") {
      return null;
    }

    const repairPlan = assessAutoRepairPlan(signal, guidance, assessment);
    if (repairPlan.eligibility !== "repairable" || !repairPlan.repairType) {
      return null;
    }

    auditEvents.push({
      signalId: signal.recordId,
      eventType: "AUTO_REPAIR_ATTEMPTED",
      actor: "system",
      summary: `Auto-repair attempted ${repairPlan.repairType.replaceAll("_", " ")}.`,
      metadata: {
        repairType: repairPlan.repairType,
        priorHoldStage: stage,
        changedFields: repairPlan.changedFields.join(", "),
      },
    });

    let repairedSignal = signal;
    if (Object.keys(repairPlan.updates).length > 0) {
      const savedRepairUpdate = await saveSignalWithFallback(signal.recordId, repairPlan.updates);
      if (!savedRepairUpdate.signal) {
        errors.push(
          pipelineErrorSchema.parse({
            stage: "auto-repair",
            recordId: signal.recordId,
            message: savedRepairUpdate.error ?? "Unable to save auto-repair updates.",
          }),
        );
        const failedEntry = buildAutoRepairHistoryEntry({
          stage,
          plan: repairPlan,
          outcome: "repaired_still_held",
          summary: "Repair attempt could not be saved, so the candidate remains held.",
        });
        const failedHistorySave = await saveSignalWithFallback(signal.recordId, {
          autoRepairHistoryJson: appendAutoRepairHistory(signal, failedEntry),
        });
        repairedSignal = failedHistorySave.signal ?? signal;
        const failedAssessment = {
          ...assessment,
          summary: "Held after auto-repair attempt because the repair update could not be saved.",
          reasons: ["Repair save failed"],
          strongestCaution: "Repair save failed",
        };
        const repairRecord = buildAutonomousRecord({
          signal: repairedSignal,
          stage,
          decision: "hold",
          summary: failedAssessment.summary,
          reasons: failedAssessment.reasons,
          confidenceLevel: guidance.confidence.confidenceLevel,
          strongestCaution: failedAssessment.strongestCaution,
          draftQualityLabel: failedAssessment.draftQuality?.label ?? null,
          suggestedPlatformPriority: failedAssessment.suggestedPlatformPriority,
          assetSuggestion: failedAssessment.assetSuggestion,
          repairType: repairPlan.repairType,
          repairOutcome: "repaired_still_held",
          repairSummary: failedEntry.summary,
          persisted: false,
        });
        auditEvents.push({
          signalId: repairedSignal.recordId,
          eventType: "AUTO_REPAIR_FAILED",
          actor: "system",
          summary: failedEntry.summary,
          metadata: {
            repairType: repairPlan.repairType,
            priorHoldStage: stage,
            resultingDecision: "hold",
          },
        });

        return {
          repairedSignal,
          promoted: false,
          heldAssessment: failedAssessment,
          repairRecord,
        };
      }

      repairedSignal = savedRepairUpdate.signal;
      workingSignals = replaceSignal(workingSignals, repairedSignal);
      touchedRecordIds.add(signal.recordId);
    }

    if (repairPlan.rerunInterpretation) {
      const repairedInterpretation = buildInterpretationUpdate(repairedSignal);
      const savedInterpretation = await saveSignalWithFallback(repairedSignal.recordId, repairedInterpretation.update);
      if (!savedInterpretation.signal) {
        errors.push(
          pipelineErrorSchema.parse({
            stage: "auto-repair-interpret",
            recordId: repairedSignal.recordId,
            message: savedInterpretation.error ?? "Unable to save repaired interpretation.",
          }),
        );
      } else {
        repairedSignal = savedInterpretation.signal;
        workingSignals = replaceSignal(workingSignals, repairedSignal);
        touchedRecordIds.add(repairedSignal.recordId);
        auditEvents.push({
          signalId: repairedSignal.recordId,
          eventType: "INTERPRETATION_SAVED",
          actor: "system",
          summary: "Autonomous runner reinterpreted the signal after auto-repair.",
          metadata: {
            repairType: repairPlan.repairType,
          },
        });
      }
    }

    if (repairPlan.rerunGeneration) {
      const repairedGuidance = buildGuidance(repairedSignal);
      const generationResult = await persistAutonomousGeneration(repairedSignal, repairedGuidance);
      if (generationResult.signal) {
        repairedSignal = generationResult.signal;
      }
    }

    const updatedGuidance = buildGuidance(repairedSignal);
    const postRepairAssessment =
      stage === "auto_interpret"
        ? assessAutoInterpret(repairedSignal, updatedGuidance)
        : stage === "auto_generate"
          ? assessAutoGenerate(repairedSignal, updatedGuidance)
          : assessApprovalReadiness(repairedSignal, updatedGuidance);

    const promoted =
      stage === "auto_interpret"
        ? hasInterpretation(repairedSignal)
        : stage === "auto_generate"
          ? hasGeneration(repairedSignal)
          : postRepairAssessment.decision !== "hold";
    const repairOutcome = promoted ? "repaired_promoted" : "repaired_still_held";
    const repairSummary = promoted
      ? `${repairPlan.notes[0] ?? "Repair applied"} Candidate moved past the held stage.`
      : `${repairPlan.notes[0] ?? "Repair applied"} ${postRepairAssessment.summary}`;
    const repairEntry = buildAutoRepairHistoryEntry({
      stage,
      plan: repairPlan,
      outcome: repairOutcome,
      summary: repairSummary,
    });
    const repairHistorySave = await saveSignalWithFallback(repairedSignal.recordId, {
      autoRepairHistoryJson: appendAutoRepairHistory(repairedSignal, repairEntry),
    });
    if (repairHistorySave.signal) {
      repairedSignal = repairHistorySave.signal;
      workingSignals = replaceSignal(workingSignals, repairedSignal);
    }

    const repairRecord = buildAutonomousRecord({
      signal: repairedSignal,
      stage,
      decision: promoted ? (stage === "auto_prepare_for_review" ? "approval_ready" : "advance") : "hold",
      summary: promoted ? repairEntry.summary : postRepairAssessment.summary,
      reasons: promoted ? [repairPlan.whyAttempted, ...repairPlan.notes].slice(0, 3) : postRepairAssessment.reasons,
      confidenceLevel: updatedGuidance.confidence.confidenceLevel,
      strongestCaution: postRepairAssessment.strongestCaution,
      draftQualityLabel: postRepairAssessment.draftQuality?.label ?? null,
      suggestedPlatformPriority: postRepairAssessment.suggestedPlatformPriority,
      assetSuggestion: postRepairAssessment.assetSuggestion,
      repairType: repairPlan.repairType,
      repairOutcome,
      repairSummary: repairEntry.summary,
      persisted: true,
    });

    auditEvents.push({
      signalId: repairedSignal.recordId,
      eventType: promoted ? "AUTO_REPAIR_PROMOTED" : "AUTO_REPAIR_FAILED",
      actor: "system",
      summary: repairEntry.summary,
      metadata: {
        repairType: repairPlan.repairType,
        priorHoldStage: stage,
        changedFields: repairPlan.changedFields.join(", "),
        resultingDecision: promoted ? "promoted" : "hold",
      },
    });

    return {
      repairedSignal,
      promoted,
      heldAssessment: postRepairAssessment,
      repairRecord,
    };
  }

  const scoringTargets = sortAutonomousTargets(
    workingSignals.filter((signal) => signal.status === "New" && !hasScoring(signal)),
  ).slice(0, maxCandidates);

  for (const signal of scoringTargets) {
    const scoring = scoreSignal(signal, workingSignals, tuning.settings);
    const savedScoring = await saveSignalWithFallback(signal.recordId, buildScoringUpdate(scoring));

    if (!savedScoring.signal) {
      errors.push(
        pipelineErrorSchema.parse({
          stage: "score",
          recordId: signal.recordId,
          message: savedScoring.error ?? "Unable to save scoring output.",
        }),
      );
      continue;
    }

    candidatesScored += 1;
    touchedRecordIds.add(signal.recordId);
    const scoredWithContext = await ensureContentContext(savedScoring.signal, "Autonomous runner assigned strategy context after scoring");
    workingSignals = replaceSignal(workingSignals, scoredWithContext);
    auditEvents.push(
      buildScoredEvent(scoredWithContext, scoring),
      buildRecommendationEvent(scoredWithContext, tuning.settings),
    );
  }

  const interpretationTargets = sortAutonomousTargets(
    workingSignals.filter((signal) => hasScoring(signal) && !hasInterpretation(signal) && !isFilteredOutSignal(signal)),
  ).slice(0, maxCandidates);

  for (const signal of interpretationTargets) {
    const currentSignal = workingSignals.find((entry) => entry.recordId === signal.recordId) ?? signal;
    const guidance = buildGuidance(currentSignal);
    const assessment = assessAutoInterpret(currentSignal, guidance);

    if (assessment.decision === "hold") {
      const repairAttempt = await attemptHeldRepair(currentSignal, guidance, assessment);
      if (repairAttempt) {
        workingSignals = replaceSignal(workingSignals, repairAttempt.repairedSignal);
        if (repairAttempt.promoted && repairAttempt.repairRecord) {
          repairedPromoted.push(repairAttempt.repairRecord);
          continue;
        }
        if (repairAttempt.repairRecord) {
          repairedHeld.push(repairAttempt.repairRecord);
          heldRecords.push(repairAttempt.repairRecord);
          continue;
        }
      }
      heldRecords.push(
        buildAutonomousRecord({
          signal: currentSignal,
          stage: "auto_interpret",
          decision: "hold",
          summary: assessment.summary,
          reasons: assessment.reasons,
          confidenceLevel: guidance.confidence.confidenceLevel,
          strongestCaution: assessment.strongestCaution,
          persisted: true,
        }),
      );
      auditEvents.push({
        signalId: currentSignal.recordId,
        eventType: "AUTO_HELD_FOR_REVIEW",
        actor: "system",
        summary: assessment.summary,
        metadata: {
          stage: "auto_interpret",
          confidenceLevel: guidance.confidence.confidenceLevel,
          holdReason: assessment.reasons[0] ?? null,
        },
      });
      continue;
    }

    if (assessment.decision !== "advance") {
      continue;
    }

    const savedScenarioAngleDecision = getSavedScenarioAngleReuseDecision({
      scenarioAngle: currentSignal.scenarioAngle,
      sourceTitle: currentSignal.sourceTitle,
      reuseAllowed: reuseSavedScenarioAngles,
    });
    const interpretationSignal = applyScenarioAngleOverride(currentSignal, savedScenarioAngleDecision.reusableScenarioAngle);
    const interpretationStage = buildInterpretationUpdate(interpretationSignal);
    const savedInterpretation = await saveSignalWithFallback(currentSignal.recordId, interpretationStage.update);

    if (!savedInterpretation.signal) {
      errors.push(
        pipelineErrorSchema.parse({
          stage: "interpret",
          recordId: currentSignal.recordId,
          message: savedInterpretation.error ?? "Unable to save interpretation output.",
        }),
      );
      heldRecords.push(
        buildAutonomousRecord({
          signal: currentSignal,
          stage: "auto_interpret",
          decision: "hold",
          summary: "Held during interpretation because the interpretation could not be saved.",
          reasons: ["Interpretation save failed"],
          confidenceLevel: guidance.confidence.confidenceLevel,
          strongestCaution: "Interpretation save failed",
          persisted: false,
        }),
      );
      continue;
    }

    const interpretedWithContext = await ensureContentContext(
      savedInterpretation.signal,
      "Autonomous runner assigned strategy context after interpretation",
    );
    workingSignals = replaceSignal(workingSignals, interpretedWithContext);
    touchedRecordIds.add(currentSignal.recordId);
    autoInterpreted.push(
      buildAutonomousRecord({
        signal: interpretedWithContext,
        stage: "auto_interpret",
        decision: "advance",
        summary: assessment.summary,
        reasons: assessment.reasons,
        confidenceLevel: guidance.confidence.confidenceLevel,
        strongestCaution: assessment.strongestCaution,
        persisted: savedInterpretation.persisted,
      }),
    );
    auditEvents.push({
      signalId: interpretedWithContext.recordId,
      eventType: "AUTO_INTERPRETED",
      actor: "system",
      summary: assessment.summary,
      metadata: {
        confidenceLevel: guidance.confidence.confidenceLevel,
        reusedScenarioAngle: savedScenarioAngleDecision.shouldReuse,
      },
    });
    auditEvents.push({
      signalId: interpretedWithContext.recordId,
      eventType: "INTERPRETATION_SAVED",
      actor: "system",
      summary: savedScenarioAngleDecision.shouldReuse
        ? "Autonomous runner saved interpretation using stored scenario framing."
        : "Autonomous runner saved interpretation.",
      metadata: {
        reusedScenarioAngle: savedScenarioAngleDecision.shouldReuse,
      },
    });
    auditEvents.push(buildRecommendationEvent(interpretedWithContext, tuning.settings));
  }

  const generationTargets = sortAutonomousTargets(
    workingSignals.filter((signal) => hasInterpretation(signal) && !hasGeneration(signal) && !isFilteredOutSignal(signal)),
  ).slice(0, maxCandidates);

  for (const signal of generationTargets) {
    const currentSignal = workingSignals.find((entry) => entry.recordId === signal.recordId) ?? signal;
    const guidance = buildGuidance(currentSignal);
    const assessment = assessAutoGenerate(currentSignal, guidance);

    if (assessment.decision === "hold") {
      const repairAttempt = await attemptHeldRepair(currentSignal, guidance, assessment);
      if (repairAttempt) {
        workingSignals = replaceSignal(workingSignals, repairAttempt.repairedSignal);
        if (repairAttempt.promoted && repairAttempt.repairRecord) {
          repairedPromoted.push(repairAttempt.repairRecord);
          continue;
        }
        if (repairAttempt.repairRecord) {
          repairedHeld.push(repairAttempt.repairRecord);
          heldRecords.push(repairAttempt.repairRecord);
          continue;
        }
      }
      heldRecords.push(
        buildAutonomousRecord({
          signal: currentSignal,
          stage: "auto_generate",
          decision: "hold",
          summary: assessment.summary,
          reasons: assessment.reasons,
          confidenceLevel: guidance.confidence.confidenceLevel,
          strongestCaution: assessment.strongestCaution,
          persisted: true,
        }),
      );
      auditEvents.push({
        signalId: currentSignal.recordId,
        eventType: "AUTO_HELD_FOR_REVIEW",
        actor: "system",
        summary: assessment.summary,
        metadata: {
          stage: "auto_generate",
          confidenceLevel: guidance.confidence.confidenceLevel,
          holdReason: assessment.reasons[0] ?? null,
        },
      });
      continue;
    }

    if (assessment.decision !== "advance") {
      continue;
    }

    const generationResult = await persistAutonomousGeneration(currentSignal, guidance);
    if (!generationResult.signal) {
      heldRecords.push(
        buildAutonomousRecord({
          signal: currentSignal,
          stage: "auto_generate",
          decision: "hold",
          summary:
            generationResult.error === "Generation input incomplete"
              ? "Held before generation because the generation input is incomplete."
              : "Held during generation because the generated drafts could not be saved.",
          reasons: [generationResult.error ?? "Generation save failed"],
          confidenceLevel: guidance.confidence.confidenceLevel,
          strongestCaution: generationResult.error ?? "Generation save failed",
          persisted: false,
        }),
      );
      continue;
    }
    const generatedWithContext = generationResult.signal;
    autoGenerated.push(
      buildAutonomousRecord({
        signal: generatedWithContext,
        stage: "auto_generate",
        decision: "advance",
        summary: assessment.summary,
        reasons: assessment.reasons,
        confidenceLevel: guidance.confidence.confidenceLevel,
        strongestCaution: assessment.strongestCaution,
        draftQualityLabel: null,
        suggestedPlatformPriority: generatedWithContext.platformPriority,
        persisted: true,
      }),
    );
    auditEvents.push({
      signalId: generatedWithContext.recordId,
        eventType: "AUTO_GENERATED",
        actor: "system",
        summary: assessment.summary,
        metadata: {
          confidenceLevel: guidance.confidence.confidenceLevel,
          editorialMode: currentSignal.editorialMode ?? "awareness",
        },
    });
  }

  const approvalCandidates = sortAutonomousTargets(
    workingSignals.filter((signal) => hasGeneration(signal) && !isFilteredOutSignal(signal)),
  );
  const approvalReadyCandidates: Array<{
    signal: SignalRecord;
    guidance: ReturnType<typeof buildGuidance>;
    assessment: ReturnType<typeof assessApprovalReadiness>;
  }> = [];
  const heldIds = new Set(heldRecords.map((record) => record.recordId));

  for (const signal of approvalCandidates) {
    const contextualSignal = await ensureContentContext(
      signal,
      "Autonomous runner assigned strategy context before approval ranking",
    );
    workingSignals = replaceSignal(workingSignals, contextualSignal);
    const guidance = buildGuidance(contextualSignal);
    const assessment = assessApprovalReadiness(contextualSignal, guidance);

    if (assessment.decision === "approval_ready") {
      approvalReadyCandidates.push({
        signal: contextualSignal,
        guidance,
        assessment,
      });
      auditEvents.push({
        signalId: contextualSignal.recordId,
        eventType: "AUTO_PROMOTED_TO_APPROVAL_QUEUE",
        actor: "system",
        summary: assessment.summary,
        metadata: {
          confidenceLevel: guidance.confidence.confidenceLevel,
          draftQuality: assessment.draftQuality?.label ?? null,
          assetType: assessment.assetSuggestion?.type ?? null,
          ...buildContentContextMetadata(contextualSignal),
        },
      });
      continue;
    }

    if (assessment.decision === "hold" && !heldIds.has(contextualSignal.recordId)) {
      const repairAttempt = await attemptHeldRepair(contextualSignal, guidance, assessment);
      if (repairAttempt) {
        workingSignals = replaceSignal(workingSignals, repairAttempt.repairedSignal);
        if (repairAttempt.promoted && repairAttempt.repairRecord) {
          repairedPromoted.push(repairAttempt.repairRecord);
          const repairedGuidance = buildGuidance(repairAttempt.repairedSignal);
          const repairedAssessment = assessApprovalReadiness(repairAttempt.repairedSignal, repairedGuidance);
          if (repairedAssessment.decision === "approval_ready") {
            approvalReadyCandidates.push({
              signal: repairAttempt.repairedSignal,
              guidance: repairedGuidance,
              assessment: repairedAssessment,
            });
          }
          continue;
        }
        if (repairAttempt.repairRecord) {
          repairedHeld.push(repairAttempt.repairRecord);
          heldRecords.push(repairAttempt.repairRecord);
          heldIds.add(repairAttempt.repairedSignal.recordId);
          continue;
        }
      }
      const record = buildAutonomousRecord({
        signal: contextualSignal,
        stage: "auto_prepare_for_review",
        decision: "hold",
        summary: assessment.summary,
        reasons: assessment.reasons,
        confidenceLevel: guidance.confidence.confidenceLevel,
        strongestCaution: assessment.strongestCaution,
        draftQualityLabel: assessment.draftQuality?.label ?? null,
        suggestedPlatformPriority: assessment.suggestedPlatformPriority,
        assetSuggestion: assessment.assetSuggestion,
        persisted: true,
      });
      heldRecords.push(record);
      heldIds.add(contextualSignal.recordId);
      auditEvents.push({
        signalId: contextualSignal.recordId,
        eventType: "AUTO_HELD_FOR_REVIEW",
        actor: "system",
        summary: assessment.summary,
        metadata: {
          stage: "auto_prepare_for_review",
          confidenceLevel: guidance.confidence.confidenceLevel,
          holdReason: assessment.reasons[0] ?? null,
          draftQuality: assessment.draftQuality?.label ?? null,
          ...buildContentContextMetadata(contextualSignal),
        },
      });
    }
  }

  const cadence = buildCampaignCadenceSummary(workingSignals, strategy, postingEntries);
  const weeklyPlan = await getCurrentWeeklyPlan(strategy);
  const weeklyPlanState = buildWeeklyPlanState(weeklyPlan, strategy, workingSignals, postingEntries);
  const rankedApprovalCandidates = rankApprovalCandidates(
    approvalReadyCandidates,
    Math.max(approvalReadyCandidates.length, 1),
    {
      strategy,
      cadence,
      weeklyPlan,
      weeklyPlanState,
    },
  );
  const approvalReadyRecords = rankedApprovalCandidates.map((candidate) =>
    autonomousRunCandidateSchema.parse({
      ...buildAutonomousRecord({
        signal: candidate.signal,
        stage: "auto_prepare_for_review",
        decision: "approval_ready",
        summary: candidate.assessment.summary,
        reasons: candidate.assessment.reasons,
        confidenceLevel: candidate.guidance.confidence.confidenceLevel,
        strongestCaution: candidate.assessment.strongestCaution,
        draftQualityLabel: candidate.assessment.draftQuality?.label ?? null,
        suggestedPlatformPriority: candidate.assessment.suggestedPlatformPriority,
        assetSuggestion: candidate.assessment.assetSuggestion,
        persisted: true,
      }),
      rankScore: candidate.rankScore,
      rankReasons: candidate.rankReasons,
    }),
  );
  const topCandidates = approvalReadyRecords.slice(0, Math.min(maxCandidates, 10));

  const result = autonomousRunSummarySchema.parse({
    ingestion: buildIngestionSnapshot(ingestionResult),
    candidatesScored,
    autoInterpreted: autoInterpreted.length,
    autoGenerated: autoGenerated.length,
    autoRepairPromoted: repairedPromoted.length,
    autoRepairHeld: repairedHeld.length,
    approvalReady: approvalReadyRecords.length,
    held: heldRecords.length,
    records: {
      autoInterpreted,
      autoGenerated,
      repairedPromoted: repairedPromoted.slice(0, 10),
      repairedHeld: repairedHeld.slice(0, 10),
      approvalReady: topCandidates,
      held: heldRecords.slice(0, 10),
    },
    topCandidates,
    errors,
    touchedRecordIds: Array.from(touchedRecordIds),
    message:
      approvalReadyRecords.length > 0
        ? `Autonomous run prepared ${approvalReadyRecords.length} approval-ready candidate${approvalReadyRecords.length === 1 ? "" : "s"}, auto-interpreted ${autoInterpreted.length}, auto-generated ${autoGenerated.length}, repaired ${repairedPromoted.length} held candidate${repairedPromoted.length === 1 ? "" : "s"}, and held ${heldRecords.length} for human judgement.`
        : `Autonomous run completed with ${autoInterpreted.length} auto-interpreted, ${autoGenerated.length} auto-generated, ${repairedPromoted.length} repaired promotions, and ${heldRecords.length} held cases. No approval-ready candidates surfaced this pass.`,
  });

  await appendAuditEventsSafe(auditEvents);

  return {
    source,
    result,
  };
}
