import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { SignalRecord } from "@/types/signal";

const DUPLICATE_CLUSTER_STORE_PATH = path.join(process.cwd(), "data", "duplicate-clusters.json");

export const DUPLICATE_CLUSTER_SIMILARITY_TYPES = ["same_story", "same_angle", "different_angle"] as const;
export const DUPLICATE_CLUSTER_CONFIDENCE_LEVELS = ["high", "moderate", "low"] as const;
export const DUPLICATE_CLUSTER_STATUSES = ["suggested", "confirmed", "rejected"] as const;

export type DuplicateClusterSimilarityType = (typeof DUPLICATE_CLUSTER_SIMILARITY_TYPES)[number];
export type DuplicateClusterConfidence = (typeof DUPLICATE_CLUSTER_CONFIDENCE_LEVELS)[number];
export type DuplicateClusterStatus = (typeof DUPLICATE_CLUSTER_STATUSES)[number];

export const duplicateClusterSchema = z.object({
  clusterId: z.string().trim().min(1),
  signalIds: z.array(z.string().trim().min(1)).min(2).max(12),
  canonicalSignalId: z.string().trim().min(1),
  similarityType: z.enum(DUPLICATE_CLUSTER_SIMILARITY_TYPES),
  clusterConfidence: z.enum(DUPLICATE_CLUSTER_CONFIDENCE_LEVELS),
  clusterReason: z.string().trim().min(1),
  status: z.enum(DUPLICATE_CLUSTER_STATUSES).default("suggested"),
  suppressedSignalIds: z.array(z.string().trim().min(1)).default([]),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

const duplicateClusterStoreSchema = z.object({
  clusters: z.array(duplicateClusterSchema).default([]),
  updatedAt: z.string().trim().min(1),
});

export type DuplicateCluster = z.infer<typeof duplicateClusterSchema>;

interface DuplicatePairAssessment {
  leftId: string;
  rightId: string;
  score: number;
  similarityType: DuplicateClusterSimilarityType;
  confidence: DuplicateClusterConfidence;
  reasons: string[];
}

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "but",
  "by",
  "for",
  "from",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "when",
  "with",
]);

function normalizeText(value: string | null | undefined): string {
  return value?.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function tokenize(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function uniqueTokens(value: string | null | undefined): string[] {
  return Array.from(new Set(tokenize(value)));
}

function overlapScore(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...left, ...right]).size;

  return union === 0 ? 0 : Math.round((intersection / union) * 100);
}

function toDayValue(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function dayDistance(left: SignalRecord, right: SignalRecord): number | null {
  const leftDay = toDayValue(left.sourceDate ?? left.createdDate);
  const rightDay = toDayValue(right.sourceDate ?? right.createdDate);
  if (leftDay === null || rightDay === null) {
    return null;
  }

  return Math.abs(leftDay - rightDay) / (24 * 60 * 60 * 1000);
}

function getHostname(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function buildClusterId(signalIds: string[]): string {
  return `dup-cluster-${signalIds.slice().sort().join("-").toLowerCase()}`;
}

function buildPairKey(leftId: string, rightId: string): string {
  return [leftId, rightId].sort().join("::");
}

function shouldConsiderSignal(signal: SignalRecord): boolean {
  return signal.status !== "Archived" && signal.status !== "Posted";
}

function confidenceFromScore(score: number): DuplicateClusterConfidence {
  if (score >= 85) {
    return "high";
  }

  if (score >= 65) {
    return "moderate";
  }

  return "low";
}

function similarityTypeLabel(value: DuplicateClusterSimilarityType): string {
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

function statusWeight(status: SignalRecord["status"]): number {
  switch (status) {
    case "Approved":
      return 7;
    case "Reviewed":
      return 6;
    case "Draft Generated":
      return 5;
    case "Interpreted":
      return 4;
    case "Scheduled":
      return 3;
    case "New":
      return 2;
    case "Rejected":
      return 1;
    case "Posted":
    case "Archived":
    default:
      return 0;
  }
}

function buildSignalKeywordTokens(signal: SignalRecord): string[] {
  return uniqueTokens([
    signal.sourceTitle,
    signal.manualSummary,
    signal.rawExcerpt,
    signal.teacherPainPoint,
    signal.contentAngle,
  ]
    .filter(Boolean)
    .join(" "));
}

function buildScenarioTokens(signal: SignalRecord): string[] {
  return uniqueTokens(signal.scenarioAngle ?? signal.contentAngle ?? signal.interpretationNotes);
}

function assessSignalPair(left: SignalRecord, right: SignalRecord): DuplicatePairAssessment | null {
  const leftTitleTokens = uniqueTokens(left.sourceTitle);
  const rightTitleTokens = uniqueTokens(right.sourceTitle);
  const titleOverlap = overlapScore(leftTitleTokens, rightTitleTokens);
  const keywordOverlap = overlapScore(buildSignalKeywordTokens(left), buildSignalKeywordTokens(right));
  const scenarioOverlap = overlapScore(buildScenarioTokens(left), buildScenarioTokens(right));
  const sourceHostnameMatch = getHostname(left.sourceUrl) && getHostname(left.sourceUrl) === getHostname(right.sourceUrl);
  const publisherMatch =
    normalizeText(left.sourcePublisher).length > 0 &&
    normalizeText(left.sourcePublisher) === normalizeText(right.sourcePublisher);
  const sourceTypeMatch =
    normalizeText(left.sourceType).length > 0 &&
    normalizeText(left.sourceType) === normalizeText(right.sourceType);
  const sameUrl =
    normalizeText(left.sourceUrl).length > 0 &&
    normalizeText(left.sourceUrl) === normalizeText(right.sourceUrl);
  const proximityDays = dayDistance(left, right);

  let score = 0;
  const reasons: string[] = [];

  if (sameUrl) {
    score += 60;
    reasons.push("Same source URL");
  } else if (sourceHostnameMatch) {
    score += 18;
    reasons.push("Same source domain");
  }

  if (publisherMatch) {
    score += 12;
    reasons.push("Same publisher");
  }

  if (sourceTypeMatch) {
    score += 6;
    reasons.push("Same source type");
  }

  if (titleOverlap >= 85) {
    score += 34;
    reasons.push("Very high title overlap");
  } else if (titleOverlap >= 65) {
    score += 22;
    reasons.push("High title overlap");
  } else if (titleOverlap >= 45) {
    score += 10;
    reasons.push("Some title overlap");
  }

  if (keywordOverlap >= 70) {
    score += 20;
    reasons.push("High keyword overlap");
  } else if (keywordOverlap >= 50) {
    score += 12;
    reasons.push("Moderate keyword overlap");
  }

  if (scenarioOverlap >= 70) {
    score += 16;
    reasons.push("Scenario angle strongly overlaps");
  } else if (scenarioOverlap >= 45) {
    score += 8;
    reasons.push("Scenario angle partly overlaps");
  }

  if (proximityDays !== null) {
    if (proximityDays <= 3) {
      score += 14;
      reasons.push("Created close together");
    } else if (proximityDays <= 7) {
      score += 8;
      reasons.push("Created within a week");
    } else if (proximityDays > 30) {
      score -= 8;
    }
  }

  if (score < 48) {
    return null;
  }

  let similarityType: DuplicateClusterSimilarityType = "same_angle";
  if (sameUrl || (titleOverlap >= 80 && (publisherMatch || sourceHostnameMatch))) {
    similarityType = scenarioOverlap >= 30 ? "same_story" : "different_angle";
  } else if (scenarioOverlap < 35 && titleOverlap >= 45) {
    similarityType = "different_angle";
  }

  const confidence = confidenceFromScore(score);
  if (confidence === "low" && similarityType === "different_angle" && keywordOverlap < 45) {
    return null;
  }

  return {
    leftId: left.recordId,
    rightId: right.recordId,
    score,
    similarityType,
    confidence,
    reasons: reasons.slice(0, 4),
  };
}

function pickCanonicalSignal(signals: SignalRecord[]): SignalRecord {
  return [...signals].sort((left, right) => {
    const leftScore =
      statusWeight(left.status) * 10 +
      (left.finalReviewedAt ? 8 : 0) +
      (left.finalReviewStartedAt ? 6 : 0) +
      (left.reviewPriority === "Urgent" ? 5 : left.reviewPriority === "High" ? 4 : left.reviewPriority === "Medium" ? 2 : 0) +
      (left.signalRelevanceScore ?? 0) / 10 +
      (left.signalUrgencyScore ?? 0) / 10;
    const rightScore =
      statusWeight(right.status) * 10 +
      (right.finalReviewedAt ? 8 : 0) +
      (right.finalReviewStartedAt ? 6 : 0) +
      (right.reviewPriority === "Urgent" ? 5 : right.reviewPriority === "High" ? 4 : right.reviewPriority === "Medium" ? 2 : 0) +
      (right.signalRelevanceScore ?? 0) / 10 +
      (right.signalUrgencyScore ?? 0) / 10;

    return (
      rightScore - leftScore ||
      new Date(right.createdDate).getTime() - new Date(left.createdDate).getTime() ||
      left.recordId.localeCompare(right.recordId)
    );
  })[0];
}

function buildClusterReason(assessments: DuplicatePairAssessment[], similarityType: DuplicateClusterSimilarityType): string {
  const best = [...assessments].sort((left, right) => right.score - left.score)[0];
  const label = similarityTypeLabel(similarityType).toLowerCase();
  return `${best?.reasons.slice(0, 2).join(" and ") ?? "Related signal overlap"} suggest a ${label} duplicate cluster.`;
}

function mostCommonSimilarityType(values: DuplicatePairAssessment[]): DuplicateClusterSimilarityType {
  const counts = new Map<DuplicateClusterSimilarityType, number>();
  for (const value of values) {
    counts.set(value.similarityType, (counts.get(value.similarityType) ?? 0) + value.score);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "same_angle";
}

function connectedComponents(signalIds: string[], edges: DuplicatePairAssessment[]): string[][] {
  const neighbors = new Map<string, Set<string>>();
  for (const signalId of signalIds) {
    neighbors.set(signalId, new Set());
  }
  for (const edge of edges) {
    neighbors.get(edge.leftId)?.add(edge.rightId);
    neighbors.get(edge.rightId)?.add(edge.leftId);
  }

  const visited = new Set<string>();
  const groups: string[][] = [];

  for (const signalId of signalIds) {
    if (visited.has(signalId) || (neighbors.get(signalId)?.size ?? 0) === 0) {
      continue;
    }

    const stack = [signalId];
    const group: string[] = [];
    visited.add(signalId);

    while (stack.length > 0) {
      const current = stack.pop()!;
      group.push(current);
      for (const neighbor of neighbors.get(current) ?? []) {
        if (visited.has(neighbor)) {
          continue;
        }
        visited.add(neighbor);
        stack.push(neighbor);
      }
    }

    if (group.length > 1) {
      groups.push(group.sort());
    }
  }

  return groups;
}

function clusterHasRejectedPair(signalIds: string[], rejectedPairKeys: Set<string>): boolean {
  for (let index = 0; index < signalIds.length; index += 1) {
    for (let inner = index + 1; inner < signalIds.length; inner += 1) {
      if (rejectedPairKeys.has(buildPairKey(signalIds[index], signalIds[inner]))) {
        return true;
      }
    }
  }

  return false;
}

function normalizeCluster(cluster: DuplicateCluster): DuplicateCluster {
  const signalIds = Array.from(new Set(cluster.signalIds)).sort();
  const canonicalSignalId = signalIds.includes(cluster.canonicalSignalId) ? cluster.canonicalSignalId : signalIds[0];
  const suppressedSignalIds = Array.from(new Set(cluster.suppressedSignalIds)).filter(
    (signalId) => signalId !== canonicalSignalId && signalIds.includes(signalId),
  );

  return duplicateClusterSchema.parse({
    ...cluster,
    signalIds,
    canonicalSignalId,
    suppressedSignalIds,
  });
}

async function readPersistedClusterStore(): Promise<z.infer<typeof duplicateClusterStoreSchema>> {
  try {
    const raw = await readFile(DUPLICATE_CLUSTER_STORE_PATH, "utf8");
    return duplicateClusterStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {
        clusters: [],
        updatedAt: new Date().toISOString(),
      };
    }

    throw error;
  }
}

async function writeClusterStore(store: z.infer<typeof duplicateClusterStoreSchema>): Promise<void> {
  await mkdir(path.dirname(DUPLICATE_CLUSTER_STORE_PATH), { recursive: true });
  await writeFile(DUPLICATE_CLUSTER_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function listDuplicateClusters(): Promise<DuplicateCluster[]> {
  const store = await readPersistedClusterStore();
  return store.clusters.map(normalizeCluster).sort((left, right) => left.clusterId.localeCompare(right.clusterId));
}

export async function saveDuplicateCluster(cluster: DuplicateCluster): Promise<DuplicateCluster> {
  const store = await readPersistedClusterStore();
  const normalized = normalizeCluster(cluster);
  const nextClusters = store.clusters.filter((item) => item.clusterId !== normalized.clusterId);
  nextClusters.push(normalized);
  await writeClusterStore({
    clusters: nextClusters.map(normalizeCluster),
    updatedAt: new Date().toISOString(),
  });
  return normalized;
}

export function buildSuggestedDuplicateClusters(
  signals: SignalRecord[],
  existingClusters: DuplicateCluster[],
): DuplicateCluster[] {
  const confirmedSignalIds = new Set(
    existingClusters
      .filter((cluster) => cluster.status === "confirmed")
      .flatMap((cluster) => cluster.signalIds),
  );
  const rejectedPairKeys = new Set(
    existingClusters
      .filter((cluster) => cluster.status === "rejected")
      .flatMap((cluster) => {
        const keys: string[] = [];
        for (let index = 0; index < cluster.signalIds.length; index += 1) {
          for (let inner = index + 1; inner < cluster.signalIds.length; inner += 1) {
            keys.push(buildPairKey(cluster.signalIds[index], cluster.signalIds[inner]));
          }
        }
        return keys;
      }),
  );

  const candidateSignals = signals.filter(
    (signal) => shouldConsiderSignal(signal) && !confirmedSignalIds.has(signal.recordId),
  );
  const edges: DuplicatePairAssessment[] = [];

  for (let index = 0; index < candidateSignals.length; index += 1) {
    for (let inner = index + 1; inner < candidateSignals.length; inner += 1) {
      const assessment = assessSignalPair(candidateSignals[index], candidateSignals[inner]);
      if (!assessment) {
        continue;
      }
      if (rejectedPairKeys.has(buildPairKey(assessment.leftId, assessment.rightId))) {
        continue;
      }
      edges.push(assessment);
    }
  }

  const groups = connectedComponents(candidateSignals.map((signal) => signal.recordId), edges);
  const signalById = new Map(candidateSignals.map((signal) => [signal.recordId, signal]));

  return groups
    .filter((group) => !clusterHasRejectedPair(group, rejectedPairKeys))
    .map((signalIds) => {
      const memberSignals = signalIds
        .map((signalId) => signalById.get(signalId))
        .filter((signal): signal is SignalRecord => Boolean(signal));
      const matchingEdges = edges.filter(
        (edge) => signalIds.includes(edge.leftId) && signalIds.includes(edge.rightId),
      );
      const similarityType = mostCommonSimilarityType(matchingEdges);
      const confidence = confidenceFromScore(
        Math.round(matchingEdges.reduce((total, edge) => total + edge.score, 0) / Math.max(matchingEdges.length, 1)),
      );
      const canonicalSignal = pickCanonicalSignal(memberSignals);
      return normalizeCluster({
        clusterId: buildClusterId(signalIds),
        signalIds,
        canonicalSignalId: canonicalSignal.recordId,
        similarityType,
        clusterConfidence: confidence,
        clusterReason: buildClusterReason(matchingEdges, similarityType),
        status: "suggested",
        suppressedSignalIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    })
    .sort((left, right) => left.signalIds.length - right.signalIds.length || left.clusterId.localeCompare(right.clusterId));
}

export function getClusterById(clusters: DuplicateCluster[], clusterId: string): DuplicateCluster | null {
  return clusters.find((cluster) => cluster.clusterId === clusterId) ?? null;
}

export function getSignalsHiddenByConfirmedClusters(clusters: DuplicateCluster[]): Set<string> {
  return new Set(
    clusters
      .filter((cluster) => cluster.status === "confirmed")
      .flatMap((cluster) =>
        cluster.signalIds.filter((signalId) => signalId !== cluster.canonicalSignalId),
      ),
  );
}

export function filterSignalsForActiveReviewQueue(
  signals: SignalRecord[],
  clusters: DuplicateCluster[],
): SignalRecord[] {
  const hiddenSignalIds = getSignalsHiddenByConfirmedClusters(clusters);
  return signals.filter((signal) => !hiddenSignalIds.has(signal.recordId));
}

export function indexConfirmedClusterByCanonicalSignalId(
  clusters: DuplicateCluster[],
): Record<string, DuplicateCluster> {
  return Object.fromEntries(
    clusters
      .filter((cluster) => cluster.status === "confirmed")
      .map((cluster) => [cluster.canonicalSignalId, cluster]),
  );
}

export function buildDuplicateClusterDifferenceNotes(
  cluster: DuplicateCluster,
  signalById: Map<string, SignalRecord>,
): string[] {
  const members = cluster.signalIds
    .map((signalId) => signalById.get(signalId))
    .filter((signal): signal is SignalRecord => Boolean(signal));
  if (members.length <= 1) {
    return [];
  }

  const notes: string[] = [];
  const distinctPublishers = new Set(members.map((signal) => normalizeText(signal.sourcePublisher)).filter(Boolean));
  const distinctAngles = new Set(members.map((signal) => normalizeText(signal.scenarioAngle)).filter(Boolean));
  const distinctStatuses = new Set(members.map((signal) => signal.status));
  const distinctPriorities = new Set(members.map((signal) => signal.reviewPriority).filter(Boolean));

  if (distinctPublishers.size > 1) {
    notes.push("Source publisher differs across the cluster.");
  }
  if (distinctAngles.size > 1) {
    notes.push("Scenario angle differs across the cluster.");
  }
  if (distinctStatuses.size > 1) {
    notes.push("Workflow status differs across the cluster.");
  }
  if (distinctPriorities.size > 1) {
    notes.push("Review priority differs across the cluster.");
  }

  return notes.slice(0, 4);
}

export function getCanonicalSignalForCluster(
  signalId: string,
  signalById: Map<string, SignalRecord>,
  clusters: DuplicateCluster[],
): SignalRecord | null {
  const cluster = clusters.find(
    (item) => item.status === "confirmed" && item.signalIds.includes(signalId),
  );
  if (!cluster) {
    return signalById.get(signalId) ?? null;
  }

  return signalById.get(cluster.canonicalSignalId) ?? signalById.get(signalId) ?? null;
}
