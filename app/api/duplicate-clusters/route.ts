import { NextResponse } from "next/server";
import { z } from "zod";

import { appendAuditEventsSafe, type AuditEventInput } from "@/lib/audit";
import { listSignalsWithFallback, saveSignalWithFallback } from "@/lib/signal-repository";
import { getClusterById, listDuplicateClusters, saveDuplicateCluster, type DuplicateCluster } from "@/lib/duplicate-clusters";
import { duplicateClusterActionRequestSchema, type DuplicateClusterActionResponse } from "@/types/api";

function buildStoredCluster(
  incoming: z.infer<typeof duplicateClusterActionRequestSchema>["cluster"],
  existing: DuplicateCluster | null,
): DuplicateCluster {
  const timestamp = new Date().toISOString();

  return {
    clusterId: incoming.clusterId,
    signalIds: Array.from(new Set(incoming.signalIds)).sort(),
    canonicalSignalId: incoming.canonicalSignalId,
    similarityType: incoming.similarityType,
    clusterConfidence: incoming.clusterConfidence,
    clusterReason: incoming.clusterReason,
    status: existing?.status ?? "suggested",
    suppressedSignalIds: existing?.suppressedSignalIds ?? [],
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

async function persistDuplicateClusterIds(cluster: DuplicateCluster, duplicateClusterId: string | null) {
  let source: DuplicateClusterActionResponse["source"] = "mock";
  let persisted = false;

  for (const signalId of cluster.signalIds) {
    const result = await saveSignalWithFallback(signalId, {
      duplicateClusterId,
    });
    source = result.source;
    persisted = persisted || result.persisted;
  }

  return { source, persisted };
}

function buildClusterAuditEvents(
  cluster: DuplicateCluster,
  eventType: "DUPLICATE_CLUSTER_CREATED" | "DUPLICATE_CLUSTER_CONFIRMED" | "DUPLICATE_CLUSTER_REJECTED",
  actor: "system" | "operator",
  summary: string,
): AuditEventInput[] {
  return cluster.signalIds.map((signalId) => ({
    signalId,
    eventType,
    actor,
    summary,
    metadata: {
      clusterId: cluster.clusterId,
      canonicalSignalId: cluster.canonicalSignalId,
      memberCount: cluster.signalIds.length,
      similarityType: cluster.similarityType,
      clusterConfidence: cluster.clusterConfidence,
    },
  }));
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = duplicateClusterActionRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: "mock",
        cluster: null,
        message: "Duplicate cluster action failed.",
        error: parsed.error.issues[0]?.message ?? "Invalid duplicate cluster payload.",
      } satisfies DuplicateClusterActionResponse,
      { status: 400 },
    );
  }

  const { action, cluster: clusterInput, targetSignalId } = parsed.data;
  if (!clusterInput.signalIds.includes(clusterInput.canonicalSignalId)) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: "mock",
        cluster: null,
        message: "Duplicate cluster action failed.",
        error: "Canonical signal must be a member of the cluster.",
      } satisfies DuplicateClusterActionResponse,
      { status: 400 },
    );
  }

  const { signals, source: signalSource } = await listSignalsWithFallback({ limit: 1000 });
  const signalIds = new Set(signals.map((signal) => signal.recordId));
  const missingSignalId = clusterInput.signalIds.find((signalId) => !signalIds.has(signalId));
  if (missingSignalId) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: signalSource,
        cluster: null,
        message: "Duplicate cluster action failed.",
        error: `Signal ${missingSignalId} no longer exists.`,
      } satisfies DuplicateClusterActionResponse,
      { status: 404 },
    );
  }

  const existingClusters = await listDuplicateClusters();
  const existing = getClusterById(existingClusters, clusterInput.clusterId);
  let cluster = buildStoredCluster(clusterInput, existing);
  const auditEvents: AuditEventInput[] = [];
  let source = signalSource;
  let persisted = false;

  if (!existing) {
    cluster = await saveDuplicateCluster(cluster);
    persisted = true;
    auditEvents.push(
      ...buildClusterAuditEvents(
        cluster,
        "DUPLICATE_CLUSTER_CREATED",
        "system",
        `Duplicate cluster suggested around ${cluster.canonicalSignalId} with ${cluster.signalIds.length} related signals.`,
      ),
    );
  }

  if (action === "confirm_cluster") {
    cluster = await saveDuplicateCluster({
      ...cluster,
      status: "confirmed",
      updatedAt: new Date().toISOString(),
    });
    persisted = true;
    const signalUpdate = await persistDuplicateClusterIds(cluster, cluster.clusterId);
    source = signalUpdate.source;
    persisted = persisted || signalUpdate.persisted;
    auditEvents.push(
      ...buildClusterAuditEvents(
        cluster,
        "DUPLICATE_CLUSTER_CONFIRMED",
        "operator",
        `Duplicate cluster confirmed. ${cluster.canonicalSignalId} is now the canonical record.`,
      ),
    );
  } else if (action === "reject_cluster") {
    cluster = await saveDuplicateCluster({
      ...cluster,
      status: "rejected",
      suppressedSignalIds: [],
      updatedAt: new Date().toISOString(),
    });
    persisted = true;
    const signalUpdate = await persistDuplicateClusterIds(cluster, null);
    source = signalUpdate.source;
    persisted = persisted || signalUpdate.persisted;
    auditEvents.push(
      ...buildClusterAuditEvents(
        cluster,
        "DUPLICATE_CLUSTER_REJECTED",
        "operator",
        "Duplicate cluster suggestion rejected. Records will stay separate.",
      ),
    );
  } else if (action === "reopen_cluster") {
    cluster = await saveDuplicateCluster({
      ...cluster,
      status: "suggested",
      suppressedSignalIds: [],
      updatedAt: new Date().toISOString(),
    });
    persisted = true;
    const signalUpdate = await persistDuplicateClusterIds(cluster, null);
    source = signalUpdate.source;
    persisted = persisted || signalUpdate.persisted;
  } else {
    if (!targetSignalId || !cluster.signalIds.includes(targetSignalId)) {
      return NextResponse.json(
        {
          success: false,
          persisted,
          source,
          cluster: null,
          message: "Duplicate cluster action failed.",
          error: "A valid targetSignalId is required for this action.",
        } satisfies DuplicateClusterActionResponse,
        { status: 400 },
      );
    }
    if (targetSignalId === cluster.canonicalSignalId) {
      return NextResponse.json(
        {
          success: false,
          persisted,
          source,
          cluster: null,
          message: "Duplicate cluster action failed.",
          error: "The canonical signal cannot be suppressed.",
        } satisfies DuplicateClusterActionResponse,
        { status: 400 },
      );
    }

    const confirmed = cluster.status !== "confirmed";
    const suppressedSignalIds =
      action === "suppress_duplicate"
        ? Array.from(new Set([...cluster.suppressedSignalIds, targetSignalId]))
        : cluster.suppressedSignalIds.filter((signalId) => signalId !== targetSignalId);
    cluster = await saveDuplicateCluster({
      ...cluster,
      status: "confirmed",
      suppressedSignalIds,
      updatedAt: new Date().toISOString(),
    });
    persisted = true;
    const signalUpdate = await persistDuplicateClusterIds(cluster, cluster.clusterId);
    source = signalUpdate.source;
    persisted = persisted || signalUpdate.persisted;

    if (confirmed) {
      auditEvents.push(
        ...buildClusterAuditEvents(
          cluster,
          "DUPLICATE_CLUSTER_CONFIRMED",
          "operator",
          `Duplicate cluster confirmed. ${cluster.canonicalSignalId} is now the canonical record.`,
        ),
      );
    }
  }

  await appendAuditEventsSafe(auditEvents);

  const message =
    action === "confirm_cluster"
      ? "Duplicate cluster confirmed."
      : action === "reject_cluster"
        ? "Duplicate cluster rejected."
        : action === "suppress_duplicate"
          ? "Duplicate signal suppressed within the confirmed cluster."
          : action === "restore_duplicate"
            ? "Duplicate signal restored inside the cluster."
            : "Duplicate cluster reopened for review.";

  return NextResponse.json({
    success: true,
    persisted,
    source,
    cluster,
    message,
  } satisfies DuplicateClusterActionResponse);
}

