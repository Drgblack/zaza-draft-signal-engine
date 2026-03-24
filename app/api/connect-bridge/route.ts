import { NextResponse } from "next/server";

import { listSignalsWithFallback } from "@/lib/signal-repository";
import { appendAuditEventsSafe } from "@/lib/audit";
import { assessAutonomousSignal } from "@/lib/auto-advance";
import { rankApprovalCandidates } from "@/lib/approval-ranking";
import { buildCampaignCadenceSummary, getCampaignStrategy } from "@/lib/campaigns";
import { buildFallbackBridgeCandidates } from "@/lib/connect-bridge-fallbacks";
import { buildFeedbackAwareCopilotGuidanceMap } from "@/lib/copilot";
import {
  filterSignalsForActiveReviewQueue,
  indexConfirmedClusterByCanonicalSignalId,
  listDuplicateClusters,
} from "@/lib/duplicate-clusters";
import { buildEvergreenSummary } from "@/lib/evergreen";
import { listExperiments } from "@/lib/experiments";
import { listFeedbackEntries } from "@/lib/feedback";
import { buildUnifiedGuidanceModel } from "@/lib/guidance";
import { buildInfluencerGraphState } from "@/lib/influencer-graph";
import {
  buildZazaConnectBridgeSummary,
  buildZazaConnectExportPayload,
  recordZazaConnectExportFailure,
  getZazaConnectBridgeStorageDiagnostics,
  importZazaConnectContext,
  listImportedZazaConnectContexts,
  listZazaConnectExports,
  saveZazaConnectExport,
  zazaConnectImportedContextSchema,
} from "@/lib/zaza-connect-bridge";
import { buildNarrativeSequencesForSignals } from "@/lib/narrative-sequences";
import { listPostingOutcomes } from "@/lib/outcomes";
import { indexBundleSummariesByPatternId, listPatternBundles } from "@/lib/pattern-bundles";
import { listPatterns } from "@/lib/patterns";
import { listPlaybookCards } from "@/lib/playbook-cards";
import { buildPlaybookCoverageSummary } from "@/lib/playbook-coverage";
import { listPostingLogEntries } from "@/lib/posting-log";
import { buildReuseMemoryCases } from "@/lib/reuse-memory";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import { getOperatorTuning } from "@/lib/tuning";
import { buildWeeklyPostingPack } from "@/lib/weekly-posting-pack";
import { buildWeeklyPlanState, getCurrentWeeklyPlan } from "@/lib/weekly-plan";
import {
  zazaConnectBridgeActionRequestSchema,
  type ZazaConnectBridgeResponse,
} from "@/types/api";

async function buildLatestBridgeState() {
  const [importedContexts, exports] = await Promise.all([
    listImportedZazaConnectContexts(),
    listZazaConnectExports(),
  ]);
  const latestExport = exports[0] ?? null;
  const influencerGraph = await buildInfluencerGraphState();

  return {
    importedContexts,
    latestExport,
    summary: buildZazaConnectBridgeSummary({
      latestExport,
      importedContexts,
      influencerGraphSummary: influencerGraph.summary,
    }),
  };
}

async function buildCurrentExportPayload() {
  const [
    signalResult,
    feedbackEntries,
    patterns,
    playbookCards,
    bundles,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    duplicateClusters,
    strategy,
    tuning,
    experiments,
    influencerGraph,
  ] = await Promise.all([
    listSignalsWithFallback({ limit: 1000 }),
    listFeedbackEntries(),
    listPatterns(),
    listPlaybookCards(),
    listPatternBundles(),
    listPostingLogEntries(),
    listPostingOutcomes(),
    listStrategicOutcomes(),
    listDuplicateClusters(),
    getCampaignStrategy(),
    getOperatorTuning(),
    listExperiments(),
    buildInfluencerGraphState(),
  ]);

  const bundleSummariesByPatternId = indexBundleSummariesByPatternId(bundles);
  const reuseMemoryCases = buildReuseMemoryCases({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const playbookCoverageSummary = buildPlaybookCoverageSummary({
    signals: signalResult.signals,
    playbookCards,
    postingEntries,
    postingOutcomes,
    bundleSummariesByPatternId,
  });
  const cadence = buildCampaignCadenceSummary(signalResult.signals, strategy, postingEntries);
  const weeklyPlan = await getCurrentWeeklyPlan(strategy);
  const weeklyPlanState = buildWeeklyPlanState(
    weeklyPlan,
    strategy,
    signalResult.signals,
    postingEntries,
  );
  const guidanceBySignalId = buildFeedbackAwareCopilotGuidanceMap(
    signalResult.signals,
    feedbackEntries,
    patterns,
    bundleSummariesByPatternId,
    undefined,
    playbookCards,
    reuseMemoryCases,
    playbookCoverageSummary,
    tuning.settings,
  );
  const confirmedClustersByCanonicalSignalId = indexConfirmedClusterByCanonicalSignalId(
    duplicateClusters,
  );
  const visibleSignals = filterSignalsForActiveReviewQueue(
    signalResult.signals,
    duplicateClusters,
  );
  const approvalReadyCandidates = rankApprovalCandidates(
    visibleSignals
      .map((signal) => {
        const guidance = buildUnifiedGuidanceModel({
          signal,
          guidance: guidanceBySignalId[signal.recordId],
          context: "review",
          tuning: tuning.settings,
        });

        return {
          signal,
          guidance,
          assessment: assessAutonomousSignal(signal, guidance),
        };
      })
      .filter((item) => item.assessment.decision === "approval_ready"),
    12,
    {
      strategy,
      cadence,
      weeklyPlan,
      weeklyPlanState,
      confirmedClustersByCanonicalSignalId,
      allSignals: signalResult.signals,
      postingEntries,
      postingOutcomes,
      strategicOutcomes,
      experiments,
    },
  );
  const evergreenSummary = buildEvergreenSummary({
    signals: signalResult.signals,
    postingEntries,
    postingOutcomes,
    strategicOutcomes,
    strategy,
    cadence,
    weeklyPlan,
    weeklyPlanState,
  });
  const weeklyPostingPack = await buildWeeklyPostingPack({
    approvalCandidates: approvalReadyCandidates,
    evergreenSummary,
    strategy,
    weeklyPlan,
    weeklyPlanState,
    postingEntries,
  });
  const sequences = buildNarrativeSequencesForSignals({
    signals: signalResult.signals,
    strategy,
    maxSequences: 12,
  });
  const fallbackCandidates = buildFallbackBridgeCandidates({
    candidates: rankApprovalCandidates(
      visibleSignals
        .map((signal) => {
          const guidance = buildUnifiedGuidanceModel({
            signal,
            guidance: guidanceBySignalId[signal.recordId],
            context: "review",
            tuning: tuning.settings,
          });

          return {
            signal,
            guidance,
            assessment: assessAutonomousSignal(signal, guidance),
          };
        }),
      12,
      {
        strategy,
        cadence,
        weeklyPlan,
        weeklyPlanState,
        confirmedClustersByCanonicalSignalId,
        allSignals: signalResult.signals,
        postingEntries,
        postingOutcomes,
        strategicOutcomes,
        experiments,
      },
    ),
    strategy,
  });

  return buildZazaConnectExportPayload({
    weeklyPostingPack,
    sequences,
    influencerGraph,
    metrics: {
      totalSignalsAvailable: signalResult.signals.length,
      visibleSignalsConsidered: visibleSignals.length,
      approvalReadySignals: approvalReadyCandidates.length,
      filteredOutSignals: Math.max(0, visibleSignals.length - approvalReadyCandidates.length),
      weeklyPostingPackItemCount: weeklyPostingPack.items.length,
      fallbackCandidateCount: fallbackCandidates.length,
      usedFallbackCandidates:
        weeklyPostingPack.items.length === 0 && fallbackCandidates.length > 0,
    },
    fallbackCandidates,
  });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}

async function buildLatestBridgeStateSafe() {
  try {
    return await buildLatestBridgeState();
  } catch (error) {
    console.error("Zaza Connect bridge: unable to rebuild latest state", error);
    return {
      importedContexts: [],
      latestExport: null,
      summary: null,
    };
  }
}

export async function POST(request: Request) {
  const attemptedAt = new Date().toISOString();
  const payload = await request.json().catch(() => null);
  const parsed = zazaConnectBridgeActionRequestSchema.safeParse(payload);

  if (!parsed.success) {
    const state = await buildLatestBridgeState();

    return NextResponse.json(
      {
        success: false,
        latestExport: state.latestExport,
        importedContext: null,
        importedContexts: state.importedContexts,
        summary: state.summary,
        generationDisposition: null,
        replacedExportId: null,
        message: "Zaza Connect bridge action failed.",
        error: parsed.error.issues[0]?.message ?? "Invalid bridge action request.",
      } satisfies ZazaConnectBridgeResponse,
      { status: 400 },
    );
  }

  if (parsed.data.action === "import_context") {
    let importedContext;

    try {
      importedContext = zazaConnectImportedContextSchema.parse(
        JSON.parse(parsed.data.payloadText),
      );
    } catch (error) {
      const state = await buildLatestBridgeState();

      return NextResponse.json(
        {
          success: false,
          latestExport: state.latestExport,
          importedContext: null,
          importedContexts: state.importedContexts,
          summary: state.summary,
          generationDisposition: null,
          replacedExportId: null,
          message: "Zaza Connect context could not be imported.",
          error:
            error instanceof Error
              ? error.message
              : "Invalid Zaza Connect context payload.",
        } satisfies ZazaConnectBridgeResponse,
        { status: 400 },
      );
    }

    const saved = await importZazaConnectContext(importedContext);
    await appendAuditEventsSafe([
      {
        signalId: `connect-bridge:${saved.importedAt.slice(0, 10)}`,
        eventType: "ZAZA_CONNECT_CONTEXT_IMPORTED",
        actor: "operator",
        summary: "Imported Zaza Connect context into the signal engine.",
        metadata: {
          contextId: saved.contextId,
          importedThemes: saved.outreachCampaignThemes.length,
          collaborationOpportunities: saved.collaborationOpportunities.length,
          relationshipHints: saved.relationshipStageHints.length,
        },
      },
    ]);

    const state = await buildLatestBridgeState();

    return NextResponse.json<ZazaConnectBridgeResponse>({
      success: true,
      latestExport: state.latestExport,
      importedContext: saved,
      importedContexts: state.importedContexts,
      summary: state.summary,
      generationDisposition: null,
      replacedExportId: null,
      message: "Zaza Connect context imported.",
    });
  }

  let exportPayload;

  try {
    exportPayload = await buildCurrentExportPayload();
  } catch (error) {
    console.error("Zaza Connect bridge create_export failed during export build", error);
    await recordZazaConnectExportFailure({
      attemptedAt,
      error: `build_failed: ${getErrorMessage(error)}`,
    });
    const state = await buildLatestBridgeStateSafe();

    return NextResponse.json<ZazaConnectBridgeResponse>(
      {
        success: false,
        latestExport: state.latestExport,
        importedContext: null,
        importedContexts: state.importedContexts,
        summary: state.summary,
        generationDisposition: null,
        replacedExportId: null,
        message: "Zaza Connect export could not be created.",
        error: `create_export:build_failed: ${getErrorMessage(error)}`,
      },
      { status: 500 },
    );
  }

  let savedExportResult: Awaited<ReturnType<typeof saveZazaConnectExport>> | null = null;

  try {
    savedExportResult = await saveZazaConnectExport(exportPayload);
  } catch (error) {
    console.error("Zaza Connect bridge create_export failed during export persistence", {
      error,
      storage: getZazaConnectBridgeStorageDiagnostics(),
      exportId: exportPayload.exportId,
    });
    await recordZazaConnectExportFailure({
      attemptedAt,
      error: `persist_failed: ${getErrorMessage(error)}`,
    });
    const state = await buildLatestBridgeStateSafe();

    return NextResponse.json<ZazaConnectBridgeResponse>(
      {
        success: false,
        latestExport: state.latestExport,
        importedContext: null,
        importedContexts: state.importedContexts,
        summary: state.summary,
        generationDisposition: null,
        replacedExportId: null,
        message: "Zaza Connect export could not be created.",
        error: `create_export:persist_failed: ${getErrorMessage(error)}`,
      },
      { status: 500 },
    );
  }

  await appendAuditEventsSafe([
    {
      signalId: `connect-bridge:${savedExportResult?.savedExport.generatedAt.slice(0, 10) ?? exportPayload.generatedAt.slice(0, 10)}`,
      eventType: "ZAZA_CONNECT_EXPORT_CREATED",
      actor: "operator",
      summary: "Created a Zaza Connect bridge export.",
      metadata: {
        exportId: savedExportResult?.savedExport.exportId ?? exportPayload.exportId,
        strongCandidates: savedExportResult?.savedExport.strongContentCandidates.length ?? exportPayload.strongContentCandidates.length,
        influencerRelevantPosts: savedExportResult?.savedExport.influencerRelevantPosts.length ?? exportPayload.influencerRelevantPosts.length,
        campaignSupportSignals: savedExportResult?.savedExport.campaignSupportSignals.length ?? exportPayload.campaignSupportSignals.length,
        distributionOpportunities: savedExportResult?.savedExport.distributionOpportunities.length ?? exportPayload.distributionOpportunities.length,
        generationDisposition: savedExportResult?.disposition ?? null,
        replacedExportId: savedExportResult?.replacedExportId ?? null,
      },
    },
  ]);

  const state = await buildLatestBridgeStateSafe();

  return NextResponse.json<ZazaConnectBridgeResponse>({
    success: true,
    latestExport: state.latestExport,
    importedContext: null,
    importedContexts: state.importedContexts,
    summary: state.summary,
    generationDisposition: savedExportResult?.disposition ?? null,
    replacedExportId: savedExportResult?.replacedExportId ?? null,
    message:
      savedExportResult?.disposition === "created_new"
        ? "Zaza Connect export created."
        : savedExportResult?.disposition === "reused_latest"
          ? "Zaza Connect export refreshed with unchanged content."
          : "Zaza Connect export created and replaced the previous latest snapshot.",
  });
}

