const GENERIC_BRIDGE_REASON_PATTERNS = [
  /^playbook support exists$/i,
  /^pattern support exists$/i,
  /^bundle context exists$/i,
  /^(high|moderate) confidence$/i,
  /^draft quality checks are strong$/i,
  /^urgent review priority$/i,
  /^high review priority$/i,
  /^strong novelty$/i,
  /^repurposes well across formats$/i,
  /^approval package is (complete|mostly complete)$/i,
  /^approval autopilot /i,
  /^queue triage:/i,
  /^conversion posture:/i,
  /^distribution:/i,
  /^risk:/i,
  /^(high|medium) expected value$/i,
  /^low expected value:/i,
  /^supports an active campaign$/i,
  /^helps rebalance /i,
  /^some repetition risk$/i,
  /^recent .* repetition$/i,
  /^represents \d+ similar signals$/i,
  /^missing /i,
];

export interface BridgeCandidateDiversityShape {
  platform?: string | null;
  audienceSegment?: string | null;
  funnelStage?: string | null;
  recommendedFormat?: string | null;
  recommendedAngle?: string | null;
  recommendedHookDirection?: string | null;
}

export function normalizeBridgeText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function isBridgeBoilerplate(value: string | null | undefined) {
  const normalized = normalizeBridgeText(value);
  return normalized
    ? GENERIC_BRIDGE_REASON_PATTERNS.some((pattern) => pattern.test(normalized))
    : false;
}

export function firstSpecificBridgeValue(values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = normalizeBridgeText(value);
    if (!normalized || isBridgeBoilerplate(normalized)) {
      continue;
    }

    return normalized;
  }

  return null;
}

export function normalizeBridgeFingerprint(value: string | null | undefined) {
  return normalizeBridgeText(value)?.toLowerCase() ?? null;
}

export function getBridgeDiversityPenalty(
  candidate: BridgeCandidateDiversityShape,
  selected: BridgeCandidateDiversityShape[],
) {
  let penalty = 0;

  for (const item of selected) {
    if (normalizeBridgeFingerprint(item.platform) === normalizeBridgeFingerprint(candidate.platform)) {
      penalty += 12;
    }

    if (
      candidate.audienceSegment &&
      normalizeBridgeFingerprint(item.audienceSegment) === normalizeBridgeFingerprint(candidate.audienceSegment)
    ) {
      penalty += 6;
    }

    if (
      candidate.funnelStage &&
      normalizeBridgeFingerprint(item.funnelStage) === normalizeBridgeFingerprint(candidate.funnelStage)
    ) {
      penalty += 6;
    }

    if (
      normalizeBridgeFingerprint(item.recommendedFormat) ===
      normalizeBridgeFingerprint(candidate.recommendedFormat)
    ) {
      penalty += 3;
    }

    if (
      normalizeBridgeFingerprint(item.recommendedAngle) ===
      normalizeBridgeFingerprint(candidate.recommendedAngle)
    ) {
      penalty += 10;
    }

    if (
      normalizeBridgeFingerprint(item.recommendedHookDirection) ===
      normalizeBridgeFingerprint(candidate.recommendedHookDirection)
    ) {
      penalty += 10;
    }
  }

  return penalty;
}
