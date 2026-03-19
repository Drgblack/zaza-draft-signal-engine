import { z } from "zod";

import { appendAuditEventsSafe, buildRecommendationEvent, buildScoredEvent, type AuditEventInput } from "@/lib/audit";
import { listSignalsWithFallback, saveSignalWithFallback } from "@/lib/airtable";
import { generateDrafts, toGenerationInputFromSignal } from "@/lib/generator";
import { runIngestion } from "@/lib/ingestion/service";
import { interpretSignal, toInterpretationInput } from "@/lib/interpreter";
import { getPipelineGateDecision } from "@/lib/pipeline-rules";
import { SCENARIO_ANGLE_QUALITY_LEVELS, getSavedScenarioAngleReuseDecision } from "@/lib/scenario-angle";
import { scoreSignal } from "@/lib/scoring";
import { hasScoring } from "@/lib/workflow";
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

export interface PipelineRunOptions {
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

export async function runPipeline(options: PipelineRunOptions = {}): Promise<{
  source: SignalDataSource;
  result: PipelineRunSummary;
}> {
  const shouldIngestFresh = options.ingestFresh ?? true;
  const maxCandidates = Math.min(Math.max(options.maxCandidates ?? 15, 1), 30);
  const reuseSavedScenarioAngles = options.reuseSavedScenarioAngles ?? true;

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
    const scoring = scoreSignal(signal, signalResult.signals);
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
    auditEvents.push(buildScoredEvent(savedScoring.signal, scoring), buildRecommendationEvent(savedScoring.signal));

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
      auditEvents.push(buildRecommendationEvent(interpretedSignal));
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
      auditEvents.push(buildRecommendationEvent(interpretedSignal));
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
      auditEvents.push(buildRecommendationEvent(interpretedSignal));
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
    auditEvents.push(buildRecommendationEvent(savedGeneration.signal));

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
