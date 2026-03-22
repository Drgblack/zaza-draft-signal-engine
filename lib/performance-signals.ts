import { z } from "zod";

export const PERFORMANCE_SIGNAL_EVENT_TYPES = [
  "brief_approved",
  "asset_generated",
  "asset_accepted",
  "asset_rejected",
  "asset_discarded",
  "asset_regenerated",
] as const;

export const performanceSignalSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  videoBriefId: z.string().trim().nullable().optional(),
  renderedAssetId: z.string().trim().nullable().optional(),
  eventType: z.enum(PERFORMANCE_SIGNAL_EVENT_TYPES),
  value: z.number().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().trim().min(1),
});

export type PerformanceSignal = z.infer<typeof performanceSignalSchema>;

function performanceSignalId(input: {
  opportunityId: string;
  eventType: PerformanceSignal["eventType"];
  createdAt: string;
  videoBriefId?: string | null;
  renderedAssetId?: string | null;
}) {
  return [
    input.opportunityId,
    "performance-signal",
    input.eventType,
    input.videoBriefId ?? "no-brief",
    input.renderedAssetId ?? "no-asset",
    input.createdAt,
  ].join(":");
}

export function buildPerformanceSignal(input: {
  opportunityId: string;
  videoBriefId?: string | null;
  renderedAssetId?: string | null;
  eventType: PerformanceSignal["eventType"];
  value?: number | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}): PerformanceSignal {
  return performanceSignalSchema.parse({
    id: performanceSignalId(input),
    opportunityId: input.opportunityId,
    videoBriefId: input.videoBriefId ?? null,
    renderedAssetId: input.renderedAssetId ?? null,
    eventType: input.eventType,
    value: input.value ?? null,
    metadata: input.metadata,
    createdAt: input.createdAt,
  });
}

export function buildBriefApprovedPerformanceSignal(input: {
  opportunityId: string;
  videoBriefId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}): PerformanceSignal {
  return buildPerformanceSignal({
    opportunityId: input.opportunityId,
    videoBriefId: input.videoBriefId,
    eventType: "brief_approved",
    createdAt: input.createdAt,
    metadata: input.metadata,
  });
}

export function buildAssetGeneratedPerformanceSignal(input: {
  opportunityId: string;
  videoBriefId: string;
  renderedAssetId: string;
  createdAt: string;
  value?: number | null;
  metadata?: Record<string, unknown>;
}): PerformanceSignal {
  return buildPerformanceSignal({
    opportunityId: input.opportunityId,
    videoBriefId: input.videoBriefId,
    renderedAssetId: input.renderedAssetId,
    eventType: "asset_generated",
    value: input.value,
    createdAt: input.createdAt,
    metadata: input.metadata,
  });
}

export function buildAssetAcceptedPerformanceSignal(input: {
  opportunityId: string;
  videoBriefId?: string | null;
  renderedAssetId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}): PerformanceSignal {
  return buildPerformanceSignal({
    opportunityId: input.opportunityId,
    videoBriefId: input.videoBriefId ?? null,
    renderedAssetId: input.renderedAssetId,
    eventType: "asset_accepted",
    createdAt: input.createdAt,
    metadata: input.metadata,
  });
}

export function buildAssetRejectedPerformanceSignal(input: {
  opportunityId: string;
  videoBriefId?: string | null;
  renderedAssetId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}): PerformanceSignal {
  return buildPerformanceSignal({
    opportunityId: input.opportunityId,
    videoBriefId: input.videoBriefId ?? null,
    renderedAssetId: input.renderedAssetId,
    eventType: "asset_rejected",
    createdAt: input.createdAt,
    metadata: input.metadata,
  });
}

export function buildAssetDiscardedPerformanceSignal(input: {
  opportunityId: string;
  videoBriefId?: string | null;
  renderedAssetId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}): PerformanceSignal {
  return buildPerformanceSignal({
    opportunityId: input.opportunityId,
    videoBriefId: input.videoBriefId ?? null,
    renderedAssetId: input.renderedAssetId,
    eventType: "asset_discarded",
    createdAt: input.createdAt,
    metadata: input.metadata,
  });
}

export function buildAssetRegeneratedPerformanceSignal(input: {
  opportunityId: string;
  videoBriefId: string;
  renderedAssetId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}): PerformanceSignal {
  return buildPerformanceSignal({
    opportunityId: input.opportunityId,
    videoBriefId: input.videoBriefId,
    renderedAssetId: input.renderedAssetId,
    eventType: "asset_regenerated",
    createdAt: input.createdAt,
    metadata: input.metadata,
  });
}

export function appendPerformanceSignals(
  existing: PerformanceSignal[],
  next: PerformanceSignal[],
): PerformanceSignal[] {
  const deduped = new Map<string, PerformanceSignal>();

  for (const signal of [...existing, ...next]) {
    deduped.set(signal.id, performanceSignalSchema.parse(signal));
  }

  return Array.from(deduped.values()).sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}
