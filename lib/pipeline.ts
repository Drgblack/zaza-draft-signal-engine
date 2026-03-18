import { z } from "zod";

import { listSignalsWithFallback, saveSignalWithFallback } from "@/lib/airtable";
import { generateDrafts, getSafeLlmErrorMessage, toGenerationInputFromSignal } from "@/lib/generator";
import { runIngestion } from "@/lib/ingestion/service";
import { interpretSignal, toInterpretationInput } from "@/lib/interpreter";
import { getPipelineGateDecision } from "@/lib/pipeline-rules";
import { scoreSignal } from "@/lib/scoring";
import { hasScoring } from "@/lib/workflow";
import type { IngestionRunSummary } from "@/lib/ingestion/types";
import type { SignalDataSource, SignalRecord, SignalScoringResult } from "@/types/signal";

const pipelineRecordStageSchema = z.enum(["Scored", "Interpreted", "Draft Generated"]);

const pipelineRecordSummarySchema = z.object({
  recordId: z.string().trim().min(1),
  sourceTitle: z.string().trim().min(1),
  recommendation: z.enum(["Keep", "Review", "Reject"]),
  qualityGateResult: z.enum(["Pass", "Needs Review", "Fail"]),
  reviewPriority: z.enum(["Low", "Medium", "High", "Urgent"]),
  stageReached: pipelineRecordStageSchema,
  statusBefore: z.enum(["New", "Interpreted", "Draft Generated", "Reviewed", "Approved", "Scheduled", "Posted", "Archived", "Rejected"]),
  statusAfter: z.enum(["New", "Interpreted", "Draft Generated", "Reviewed", "Approved", "Scheduled", "Posted", "Archived", "Rejected"]),
  decisionSummary: z.string().trim().min(1),
  persisted: z.boolean(),
});

const pipelineErrorSchema = z.object({
  stage: z.string().trim().min(1),
  sourceId: z.string().trim().min(1).optional(),
  recordId: z.string().trim().min(1).optional(),
  message: z.string().trim().min(1),
});

export const pipelineRunSummarySchema = z.object({
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
) {
  return pipelineRecordSummarySchema.parse({
    recordId: signalAfter.recordId,
    sourceTitle: signalAfter.sourceTitle,
    recommendation: scoring.keepRejectRecommendation,
    qualityGateResult: scoring.qualityGateResult,
    reviewPriority: scoring.reviewPriority,
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

  return source === "airtable"
    ? `Pipeline run completed. ${summary.generated} records advanced to draft generation, ${summary.interpreted} advanced to interpretation only, ${summary.reviewOnly} were held for review, and ${summary.rejected} were filtered out.`
    : `Pipeline run completed in mock mode. ${summary.generated} records reached draft generation, ${summary.interpreted} reached interpretation, ${summary.reviewOnly} were held for review, and ${summary.rejected} were filtered out.`;
}

export async function runPipeline(options: PipelineRunOptions = {}): Promise<{
  source: SignalDataSource;
  result: PipelineRunSummary;
}> {
  const shouldIngestFresh = options.ingestFresh ?? true;
  const maxCandidates = Math.min(Math.max(options.maxCandidates ?? 15, 1), 30);

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
  const touchedRecordIds = new Set<string>();
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

    const interpretationStage = buildInterpretationUpdate(scoredSignal);
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
          `${decision.summary} Interpretation could not be saved, so the record remains in scoring-only state.`,
          savedScoring.persisted,
        ),
      );
      continue;
    }

    const interpretedSignal = savedInterpretation.signal;

    if (!decision.shouldGenerate) {
      interpreted.push(
        buildSummaryRecord(
          signal,
          interpretedSignal,
          scoring,
          "Interpreted",
          decision.summary,
          savedScoring.persisted && savedInterpretation.persisted,
        ),
      );
      continue;
    }

    const generationInput = toGenerationInputFromSignal(interpretedSignal);
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
          `${decision.summary} Generation input was incomplete, so the record stopped after interpretation.`,
          savedScoring.persisted && savedInterpretation.persisted,
        ),
      );
      continue;
    }

    try {
      const draftOutputs = await generateDrafts(generationInput);
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
            `${decision.summary} Drafts were generated but could not be saved, so the record stopped after interpretation.`,
            savedScoring.persisted && savedInterpretation.persisted,
          ),
        );
        continue;
      }

      generated.push(
        buildSummaryRecord(
          signal,
          savedGeneration.signal,
          scoring,
          "Draft Generated",
          `${decision.summary} Drafts were generated with ${draftOutputs.generationSource}.`,
          savedScoring.persisted && savedInterpretation.persisted && savedGeneration.persisted,
        ),
      );
    } catch (error) {
      errors.push(
        pipelineErrorSchema.parse({
          stage: "generate",
          recordId: signal.recordId,
          message: getSafeLlmErrorMessage(error),
        }),
      );
      interpreted.push(
        buildSummaryRecord(
          signal,
          interpretedSignal,
          scoring,
          "Interpreted",
          `${decision.summary} Draft generation failed, so the record stopped after interpretation.`,
          savedScoring.persisted && savedInterpretation.persisted,
        ),
      );
    }
  }

  const draftSummary = {
    ingestion: buildIngestionSnapshot(ingestionResult),
    candidatesScored,
    rejected: rejected.length,
    reviewOnly: reviewOnly.length,
    interpreted: interpreted.length,
    generated: generated.length,
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

  return {
    source,
    result: {
      ...result,
      message: buildPipelineMessage(result, source),
    },
  };
}
