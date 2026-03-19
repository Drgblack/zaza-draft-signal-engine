"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DuplicateClusterActionResponse } from "@/types/api";

type DuplicateClusterMemberRow = {
  recordId: string;
  sourceTitle: string;
  status: string;
  reviewPriority: string | null;
  sourcePublisher: string | null;
  scenarioAngle: string | null;
  createdDate: string;
};

type ReviewDuplicateClusterRow = {
  clusterId: string;
  similarityType: "same_story" | "same_angle" | "different_angle";
  clusterConfidence: "high" | "moderate" | "low";
  clusterReason: string;
  canonicalSignalId: string;
  signalIds: string[];
  suppressedSignalIds: string[];
  differenceNotes: string[];
  members: DuplicateClusterMemberRow[];
};

function confidenceTone(value: ReviewDuplicateClusterRow["clusterConfidence"]) {
  switch (value) {
    case "high":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "low":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "moderate":
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function similarityLabel(value: ReviewDuplicateClusterRow["similarityType"]) {
  switch (value) {
    case "same_story":
      return "Same story";
    case "same_angle":
      return "Same angle";
    case "different_angle":
    default:
      return "Different angle";
  }
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

async function postAction(body: {
  action: "confirm_cluster" | "reject_cluster" | "suppress_duplicate" | "restore_duplicate" | "reopen_cluster";
  cluster: Pick<
    ReviewDuplicateClusterRow,
    "clusterId" | "signalIds" | "canonicalSignalId" | "similarityType" | "clusterConfidence" | "clusterReason"
  >;
  targetSignalId?: string;
}) {
  const response = await fetch("/api/duplicate-clusters", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return (await response.json()) as DuplicateClusterActionResponse;
}

function ClusterCard({
  cluster,
  isConfirmed,
  onAction,
  pending,
}: {
  cluster: ReviewDuplicateClusterRow;
  isConfirmed: boolean;
  onAction: (
    action: "confirm_cluster" | "reject_cluster" | "suppress_duplicate" | "restore_duplicate" | "reopen_cluster",
    targetSignalId?: string,
  ) => void;
  pending: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white/80 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-slate-950 px-2.5 py-1 text-xs font-medium text-white">
              {similarityLabel(cluster.similarityType)}
            </span>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${confidenceTone(cluster.clusterConfidence)}`}>
              {cluster.clusterConfidence} confidence
            </span>
            {isConfirmed ? (
              <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
                Confirmed cluster
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                Suggested cluster
              </span>
            )}
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-950">
              {cluster.members.length} related signals
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{cluster.clusterReason}</p>
          </div>
          <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-2">
            <p>
              <span className="font-medium text-slate-900">{isConfirmed ? "Canonical record:" : "Suggested canonical:"}</span>{" "}
              {cluster.members.find((member) => member.recordId === cluster.canonicalSignalId)?.sourceTitle ?? cluster.canonicalSignalId}
            </p>
            <p>
              <span className="font-medium text-slate-900">Cluster members:</span> {cluster.signalIds.length}
            </p>
          </div>
          {cluster.differenceNotes.length > 0 ? (
            <div className="flex flex-wrap gap-2 text-sm text-slate-500">
              {cluster.differenceNotes.map((note) => (
                <span key={note} className="rounded-full bg-slate-100 px-3 py-1">
                  {note}
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {!isConfirmed ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => onAction("confirm_cluster")} disabled={pending}>
                  Merge cluster
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onAction("reject_cluster")} disabled={pending}>
                  Keep separate
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => onAction("reopen_cluster")} disabled={pending}>
                Reopen cluster
              </Button>
            )}
          </div>
        </div>
        <div className="min-w-80 space-y-3 rounded-2xl bg-slate-50/80 p-4 text-sm text-slate-600">
          {cluster.members.map((member) => {
            const isCanonical = member.recordId === cluster.canonicalSignalId;
            const isSuppressed = cluster.suppressedSignalIds.includes(member.recordId);

            return (
              <div key={member.recordId} className="rounded-2xl bg-white/90 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {isCanonical ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                      Canonical
                    </span>
                  ) : null}
                  {isSuppressed ? (
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                      Suppressed
                    </span>
                  ) : null}
                </div>
                <Link href={`/signals/${member.recordId}`} className="mt-2 block font-medium text-slate-950 hover:text-[color:var(--accent)]">
                  {member.sourceTitle}
                </Link>
                <p className="mt-2 text-xs text-slate-500">
                  {member.status} · {member.reviewPriority ?? "Priority not set"} · {formatDate(member.createdDate)}
                </p>
                <p className="mt-2 text-xs text-slate-500">{member.sourcePublisher ?? "Publisher not set"}</p>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {member.scenarioAngle ?? "No scenario angle saved."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/signals/${member.recordId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    Open record
                  </Link>
                  {!isCanonical ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onAction(isSuppressed ? "restore_duplicate" : "suppress_duplicate", member.recordId)}
                      disabled={pending}
                    >
                      {isSuppressed ? "Restore" : "Suppress duplicate"}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function DuplicateClusterReviewSection({
  suggestedClusters,
  confirmedClusters,
}: {
  suggestedClusters: ReviewDuplicateClusterRow[];
  confirmedClusters: ReviewDuplicateClusterRow[];
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    title: string;
    body: string;
  } | null>(null);
  const [pendingClusterId, setPendingClusterId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction(
    cluster: ReviewDuplicateClusterRow,
    action: "confirm_cluster" | "reject_cluster" | "suppress_duplicate" | "restore_duplicate" | "reopen_cluster",
    targetSignalId?: string,
  ) {
    setPendingClusterId(cluster.clusterId);
    startTransition(() => {
      void (async () => {
        try {
          const result = await postAction({
            action,
            cluster: {
              clusterId: cluster.clusterId,
              signalIds: cluster.signalIds,
              canonicalSignalId: cluster.canonicalSignalId,
              similarityType: cluster.similarityType,
              clusterConfidence: cluster.clusterConfidence,
              clusterReason: cluster.clusterReason,
            },
            targetSignalId,
          });

          if (!result.success) {
            setFeedback({
              tone: "error",
              title: "Unable to update duplicate cluster",
              body: result.error ?? result.message,
            });
            setPendingClusterId(null);
            return;
          }

          setFeedback({
            tone: "success",
            title: "Duplicate cluster updated",
            body: result.message,
          });
          router.refresh();
          setPendingClusterId(null);
        } catch (error) {
          setFeedback({
            tone: "error",
            title: "Unable to update duplicate cluster",
            body: error instanceof Error ? error.message : "The duplicate cluster action failed.",
          });
          setPendingClusterId(null);
        }
      })();
    });
  }

  return (
    <div id="duplicate-clusters">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-4">
            <span>Duplicate Clusters</span>
            <span className="text-sm font-medium text-slate-500">
              {confirmedClusters.length} confirmed · {suggestedClusters.length} suggested
            </span>
          </CardTitle>
          <CardDescription>
            Similar signals are grouped here before they flood scoring and review. Confirmed clusters collapse onto one canonical record, while duplicates remain reversible and inspectable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {feedback ? (
            <div
              className={`rounded-2xl px-4 py-3 text-sm ${
                feedback.tone === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              }`}
            >
              <p className="font-medium">{feedback.title}</p>
              <p className="mt-1">{feedback.body}</p>
            </div>
          ) : null}

          {suggestedClusters.length === 0 && confirmedClusters.length === 0 ? (
            <div className="rounded-2xl bg-white/80 px-4 py-5 text-sm text-slate-500">
              No duplicate clusters are active right now.
            </div>
          ) : null}

          {suggestedClusters.length > 0 ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-900">Suggested clusters</p>
                <p className="mt-1 text-sm text-slate-500">Review these first so duplicates stop crowding the active queue.</p>
              </div>
              {suggestedClusters.map((cluster) => (
                <ClusterCard
                  key={cluster.clusterId}
                  cluster={cluster}
                  isConfirmed={false}
                  onAction={(action, targetSignalId) => runAction(cluster, action, targetSignalId)}
                  pending={isPending && pendingClusterId === cluster.clusterId}
                />
              ))}
            </div>
          ) : null}

          {confirmedClusters.length > 0 ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-900">Confirmed clusters</p>
                <p className="mt-1 text-sm text-slate-500">Only the canonical record continues through ranking and queue sections.</p>
              </div>
              {confirmedClusters.map((cluster) => (
                <ClusterCard
                  key={cluster.clusterId}
                  cluster={cluster}
                  isConfirmed
                  onAction={(action, targetSignalId) => runAction(cluster, action, targetSignalId)}
                  pending={isPending && pendingClusterId === cluster.clusterId}
                />
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
