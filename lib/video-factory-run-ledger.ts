import { z } from "zod";

import {
  VIDEO_FACTORY_STATUSES,
  type VideoFactoryLifecycle,
} from "./video-factory-state";
import {
  costEstimateSchema,
  type CostEstimate,
} from "./video-factory-cost";
import {
  qualityCheckResultSchema,
  type QualityCheckResult,
} from "./video-factory-quality-checks";
import {
  videoFactoryRetryStateSchema,
  type VideoFactoryRetryState,
} from "./video-factory-retry";
import type { VideoFactoryAttemptLineage } from "@/lib/video-factory-lineage";

export const FACTORY_RUN_TERMINAL_OUTCOMES = [
  "review_pending",
  "accepted",
  "rejected",
  "discarded",
  "failed",
] as const;

export const factoryRunProviderSetSchema = z.object({
  renderProvider: z.string().trim().min(1),
  narrationProvider: z.string().trim().nullable().default(null),
  visualProviders: z.array(z.string().trim().min(1)).default([]),
  captionProvider: z.string().trim().nullable().default(null),
  compositionProvider: z.string().trim().nullable().default(null),
});

export const factoryRunTransitionSchema = z.object({
  status: z.enum(VIDEO_FACTORY_STATUSES),
  at: z.string().trim().min(1),
});

export const factoryRunLedgerEntrySchema = z.object({
  ledgerEntryId: z.string().trim().min(1),
  factoryJobId: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  attemptNumber: z.number().int().positive(),
  generationRequestId: z.string().trim().nullable().default(null),
  renderJobId: z.string().trim().nullable().default(null),
  renderedAssetId: z.string().trim().nullable().default(null),
  providerSet: factoryRunProviderSetSchema,
  lifecycleTransitions: z.array(factoryRunTransitionSchema).min(1),
  artifactIds: z.array(z.string().trim().min(1)).default([]),
  estimatedCost: costEstimateSchema.nullable().default(null),
  qualityCheck: qualityCheckResultSchema.nullable().default(null),
  retryState: videoFactoryRetryStateSchema.nullable().default(null),
  terminalOutcome: z.enum(FACTORY_RUN_TERMINAL_OUTCOMES),
  lastUpdatedAt: z.string().trim().min(1),
  failureStage: z.enum(VIDEO_FACTORY_STATUSES).nullable().default(null),
  failureMessage: z.string().trim().nullable().default(null),
});

export type FactoryRunLedgerEntry = z.infer<typeof factoryRunLedgerEntrySchema>;

function ledgerEntryId(factoryJobId: string, attemptNumber: number) {
  return `${factoryJobId}:attempt:${attemptNumber}`;
}

function buildLifecycleTransitions(
  lifecycle: VideoFactoryLifecycle,
): FactoryRunLedgerEntry["lifecycleTransitions"] {
  const transitions = [
    { status: "draft", at: lifecycle.draftAt },
    { status: "queued", at: lifecycle.queuedAt },
    { status: "preparing", at: lifecycle.preparingAt },
    { status: "generating_narration", at: lifecycle.generatingNarrationAt },
    { status: "generating_visuals", at: lifecycle.generatingVisualsAt },
    { status: "generating_captions", at: lifecycle.generatingCaptionsAt },
    { status: "composing", at: lifecycle.composingAt },
    { status: "generated", at: lifecycle.generatedAt },
    { status: "review_pending", at: lifecycle.reviewPendingAt },
    { status: "accepted", at: lifecycle.acceptedAt },
    { status: "rejected", at: lifecycle.rejectedAt },
    { status: "discarded", at: lifecycle.discardedAt },
    { status: "failed", at: lifecycle.failedAt },
  ]
    .filter(
      (
        transition,
      ): transition is { status: FactoryRunLedgerEntry["lifecycleTransitions"][number]["status"]; at: string } =>
        typeof transition.at === "string" && transition.at.trim().length > 0,
    )
    .map((transition) => factoryRunTransitionSchema.parse(transition));

  return transitions;
}

function buildProviderSet(input: {
  renderProvider: string;
  attemptLineage?: VideoFactoryAttemptLineage | null;
}): FactoryRunLedgerEntry["providerSet"] {
  return factoryRunProviderSetSchema.parse({
    renderProvider: input.renderProvider,
    narrationProvider: input.attemptLineage?.narrationArtifact?.providerId ?? null,
    visualProviders: Array.from(
      new Set(input.attemptLineage?.sceneArtifacts.map((artifact) => artifact.providerId) ?? []),
    ),
    captionProvider: input.attemptLineage?.captionArtifact?.providerId ?? null,
    compositionProvider: input.attemptLineage?.composedVideoArtifact?.providerId ?? null,
  });
}

function buildArtifactIds(
  attemptLineage?: VideoFactoryAttemptLineage | null,
): string[] {
  if (!attemptLineage) {
    return [];
  }

  return [
    attemptLineage.narrationArtifact?.artifactId ?? null,
    ...attemptLineage.sceneArtifacts.map((artifact) => artifact.artifactId),
    attemptLineage.captionArtifact?.artifactId ?? null,
    attemptLineage.composedVideoArtifact?.artifactId ?? null,
    attemptLineage.thumbnailArtifact?.artifactId ?? null,
  ].filter((artifactId): artifactId is string => Boolean(artifactId));
}

export function buildFactoryRunLedgerEntry(input: {
  opportunityId: string;
  videoBriefId: string;
  attemptNumber: number;
  lifecycle: VideoFactoryLifecycle;
  renderProvider: string;
  generationRequestId?: string | null;
  renderJobId?: string | null;
  renderedAssetId?: string | null;
  attemptLineage?: VideoFactoryAttemptLineage | null;
  estimatedCost?: CostEstimate | null;
  qualityCheck?: QualityCheckResult | null;
  retryState?: VideoFactoryRetryState | null;
}): FactoryRunLedgerEntry {
  return factoryRunLedgerEntrySchema.parse({
    ledgerEntryId: ledgerEntryId(input.lifecycle.factoryJobId, input.attemptNumber),
    factoryJobId: input.lifecycle.factoryJobId,
    opportunityId: input.opportunityId,
    videoBriefId: input.videoBriefId,
    attemptNumber: input.attemptNumber,
    generationRequestId: input.generationRequestId ?? null,
    renderJobId: input.renderJobId ?? null,
    renderedAssetId: input.renderedAssetId ?? null,
    providerSet: buildProviderSet({
      renderProvider: input.renderProvider,
      attemptLineage: input.attemptLineage ?? null,
    }),
    lifecycleTransitions: buildLifecycleTransitions(input.lifecycle),
    artifactIds: buildArtifactIds(input.attemptLineage ?? null),
    estimatedCost: input.estimatedCost ?? null,
    qualityCheck: input.qualityCheck ?? input.attemptLineage?.qualityCheck ?? null,
    retryState:
      input.retryState ??
      input.attemptLineage?.retryState ??
      input.lifecycle.retryState ??
      null,
    terminalOutcome:
      input.lifecycle.status === "accepted" ||
      input.lifecycle.status === "rejected" ||
      input.lifecycle.status === "discarded" ||
      input.lifecycle.status === "failed"
        ? input.lifecycle.status
        : "review_pending",
    lastUpdatedAt: input.lifecycle.lastUpdatedAt,
    failureStage: input.lifecycle.failureStage ?? null,
    failureMessage: input.lifecycle.failureMessage ?? null,
  });
}

export function appendFactoryRunLedgerEntry(
  existing: FactoryRunLedgerEntry[],
  next: FactoryRunLedgerEntry,
): FactoryRunLedgerEntry[] {
  const deduped = new Map<string, FactoryRunLedgerEntry>();

  for (const entry of [...existing, next]) {
    deduped.set(
      entry.ledgerEntryId,
      factoryRunLedgerEntrySchema.parse(entry),
    );
  }

  return Array.from(deduped.values()).sort(
    (left, right) => left.attemptNumber - right.attemptNumber,
  );
}

export function updateFactoryRunLedgerOutcome(
  existing: FactoryRunLedgerEntry[],
  input: {
    renderJobId?: string | null;
    renderedAssetId?: string | null;
    lifecycle: VideoFactoryLifecycle;
    retryState?: VideoFactoryRetryState | null;
  },
): FactoryRunLedgerEntry[] {
  return existing.map((entry) => {
    const matchesRenderJob =
      input.renderJobId && entry.renderJobId === input.renderJobId;
    const matchesRenderedAsset =
      input.renderedAssetId && entry.renderedAssetId === input.renderedAssetId;

    if (!matchesRenderJob && !matchesRenderedAsset) {
      return entry;
    }

    return factoryRunLedgerEntrySchema.parse({
      ...entry,
      lifecycleTransitions: buildLifecycleTransitions(input.lifecycle),
      terminalOutcome:
        input.lifecycle.status === "accepted" ||
        input.lifecycle.status === "rejected" ||
        input.lifecycle.status === "discarded" ||
        input.lifecycle.status === "failed"
          ? input.lifecycle.status
          : entry.terminalOutcome,
      retryState:
        input.retryState ?? input.lifecycle.retryState ?? entry.retryState ?? null,
      lastUpdatedAt: input.lifecycle.lastUpdatedAt,
      failureStage: input.lifecycle.failureStage ?? null,
      failureMessage: input.lifecycle.failureMessage ?? null,
    });
  });
}
