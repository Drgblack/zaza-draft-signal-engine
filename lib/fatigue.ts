import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import type { UnifiedGuidance } from "@/lib/guidance";
import {
  buildSignalPublishPrepBundle,
  getPrimaryLinkVariant,
  getPublishPrepPackageForPlatform,
  getSelectedCtaText,
} from "@/lib/publish-prep";
import { getPostingPlatformLabel, type PostingLogEntry, type PostingPlatform } from "@/lib/posting-memory";
import { getSourceProfile } from "@/lib/source-profiles";
import type { SignalRecord } from "@/types/signal";

export type FatigueDimension =
  | "editorial_mode"
  | "platform_emphasis"
  | "cta_style"
  | "destination_page"
  | "pattern_bundle"
  | "source_family";

export interface FatigueWarning {
  dimension: FatigueDimension;
  key: string;
  label: string;
  severity: "low" | "moderate";
  count: number;
  total: number;
  ratio: number;
  summary: string;
}

export interface FatigueAssessment {
  warnings: FatigueWarning[];
  scorePenalty: number;
  summary: string;
}

export interface FatigueSubject {
  id: string;
  signal: SignalRecord;
  guidance?: Pick<UnifiedGuidance, "relatedPatterns" | "relatedBundles"> | null;
  platformOverride?: PostingPlatform | null;
}

interface FatigueToken {
  dimension: FatigueDimension;
  key: string;
  label: string;
}

interface FatigueCountEntry {
  key: string;
  label: string;
  count: number;
}

interface FatigueSummaryTemplate {
  dimension: FatigueDimension;
  label: string;
  summary: string;
}

const DIMENSION_LABELS: Record<FatigueDimension, string> = {
  editorial_mode: "Editorial mode",
  platform_emphasis: "Platform emphasis",
  cta_style: "CTA style",
  destination_page: "Destination page",
  pattern_bundle: "Pattern / bundle",
  source_family: "Source family",
};

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function incrementCount(
  map: Map<FatigueDimension, Map<string, FatigueCountEntry>>,
  totals: Map<FatigueDimension, number>,
  token: FatigueToken,
) {
  const byKey = map.get(token.dimension) ?? new Map<string, FatigueCountEntry>();
  const existing = byKey.get(token.key);

  byKey.set(token.key, {
    key: token.key,
    label: token.label,
    count: (existing?.count ?? 0) + 1,
  });
  map.set(token.dimension, byKey);
  totals.set(token.dimension, (totals.get(token.dimension) ?? 0) + 1);
}

function resolvePrimaryPlatform(signal: SignalRecord): PostingPlatform {
  if (signal.platformPriority === "LinkedIn First") {
    return "linkedin";
  }

  if (signal.platformPriority === "Reddit First") {
    return "reddit";
  }

  return "x";
}

function classifyCtaStyle(
  ctaText: string | null | undefined,
  ctaGoal: SignalRecord["ctaGoal"],
): { key: string; label: string } | null {
  const normalized = ctaText?.trim().toLowerCase() ?? "";

  if (
    normalized.includes("comment") ||
    normalized.includes("reply") ||
    normalized.includes("share") ||
    normalized.includes("what do you think") ||
    normalized.includes("tell me")
  ) {
    return {
      key: "engagement_prompt",
      label: "Engagement prompt",
    };
  }

  if (
    normalized.includes("sign up") ||
    normalized.includes("subscribe") ||
    normalized.includes("join") ||
    ctaGoal === "Sign up"
  ) {
    return {
      key: "signup_cta",
      label: "Signup CTA",
    };
  }

  if (
    normalized.includes("try") ||
    normalized.includes("get started") ||
    normalized.includes("start free") ||
    normalized.includes("book") ||
    ctaGoal === "Try product"
  ) {
    return {
      key: "product_cta",
      label: "Product CTA",
    };
  }

  if (
    normalized.includes("visit") ||
    normalized.includes("read") ||
    normalized.includes("learn more") ||
    normalized.includes("see the guide") ||
    ctaGoal === "Visit site"
  ) {
    return {
      key: "visit_site_cta",
      label: "Visit-site CTA",
    };
  }

  if (normalized.length > 0 || ctaGoal === "Share / engage") {
    return {
      key: "soft_invite",
      label: "Soft invite CTA",
    };
  }

  return null;
}

function simplifyPathLabel(value: string): string {
  try {
    const url = new URL(value);
    return url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
  } catch {
    const trimmed = value.trim();
    if (trimmed.startsWith("/")) {
      return trimmed.replace(/\/+$/, "") || "/";
    }

    return trimmed;
  }
}

function summarizeWarning(dimension: FatigueDimension, label: string): string {
  switch (dimension) {
    case "editorial_mode":
      return `${label} is overrepresented this week.`;
    case "platform_emphasis":
      return `${label} is getting repeated platform emphasis right now.`;
    case "cta_style":
      return `${label} keeps showing up across recent calls to action.`;
    case "destination_page":
      return `${label} has been used too often recently.`;
    case "pattern_bundle":
      return `${label} is being leaned on heavily right now.`;
    case "source_family":
    default:
      return `${label} is dominating the recent source mix.`;
  }
}

function warningSeverity(count: number, total: number): "low" | "moderate" | null {
  if (count < 3 || total < 4) {
    return null;
  }

  const ratio = count / total;
  if (count >= 4 && ratio >= 0.5) {
    return "moderate";
  }

  if (ratio >= 0.35) {
    return "low";
  }

  return null;
}

function getSignalPatternOrBundle(
  guidance: FatigueSubject["guidance"],
): { key: string; label: string } | null {
  const bundle = guidance?.relatedBundles[0];
  if (bundle?.title) {
    return {
      key: `bundle:${bundle.title.toLowerCase()}`,
      label: bundle.title,
    };
  }

  const pattern = guidance?.relatedPatterns[0];
  if (pattern?.title) {
    return {
      key: `pattern:${pattern.title.toLowerCase()}`,
      label: pattern.title,
    };
  }

  return null;
}

function buildSubjectTokens(subject: FatigueSubject): FatigueToken[] {
  const tokens: FatigueToken[] = [];
  const editorialMode = subject.signal.editorialMode;
  const preferredPlatform = subject.platformOverride ?? resolvePrimaryPlatform(subject.signal);
  const publishPrepBundle = buildSignalPublishPrepBundle(subject.signal);
  const primaryPackage = getPublishPrepPackageForPlatform(publishPrepBundle, preferredPlatform);
  const selectedCta = primaryPackage ? getSelectedCtaText(primaryPackage) : null;
  const primaryLink = primaryPackage ? getPrimaryLinkVariant(primaryPackage) : null;
  const patternOrBundle = getSignalPatternOrBundle(subject.guidance);
  const sourceProfile = getSourceProfile(subject.signal);
  const ctaStyle = classifyCtaStyle(selectedCta, subject.signal.ctaGoal);

  if (editorialMode) {
    tokens.push({
      dimension: "editorial_mode",
      key: editorialMode,
      label: getEditorialModeDefinition(editorialMode).label,
    });
  }

  tokens.push({
    dimension: "platform_emphasis",
    key: preferredPlatform,
    label: getPostingPlatformLabel(preferredPlatform),
  });

  if (ctaStyle) {
    tokens.push({
      dimension: "cta_style",
      key: ctaStyle.key,
      label: ctaStyle.label,
    });
  }

  const destinationLabel = primaryLink?.label ?? primaryLink?.url ?? null;
  if (destinationLabel) {
    tokens.push({
      dimension: "destination_page",
      key: simplifyPathLabel(primaryLink?.url ?? destinationLabel).toLowerCase(),
      label: simplifyPathLabel(primaryLink?.url ?? destinationLabel),
    });
  }

  if (patternOrBundle) {
    tokens.push({
      dimension: "pattern_bundle",
      key: patternOrBundle.key,
      label: patternOrBundle.label,
    });
  }

  tokens.push({
    dimension: "source_family",
    key: sourceProfile.id,
    label: sourceProfile.contextLabel,
  });

  return tokens;
}

function buildPostingEntryTokens(
  entry: PostingLogEntry,
  signalById: Map<string, SignalRecord>,
): FatigueToken[] {
  const tokens: FatigueToken[] = [];
  const signal = signalById.get(entry.signalId) ?? null;
  const ctaStyle = classifyCtaStyle(entry.selectedCtaText, signal?.ctaGoal ?? null);

  if (entry.editorialMode) {
    tokens.push({
      dimension: "editorial_mode",
      key: entry.editorialMode,
      label: getEditorialModeDefinition(entry.editorialMode).label,
    });
  }

  tokens.push({
    dimension: "platform_emphasis",
    key: entry.platform,
    label: getPostingPlatformLabel(entry.platform),
  });

  if (ctaStyle) {
    tokens.push({
      dimension: "cta_style",
      key: ctaStyle.key,
      label: ctaStyle.label,
    });
  }

  const destinationLabel = entry.destinationUrl ?? entry.destinationLabel ?? entry.selectedSiteLinkId ?? null;
  if (destinationLabel) {
    tokens.push({
      dimension: "destination_page",
      key: simplifyPathLabel(destinationLabel).toLowerCase(),
      label: simplifyPathLabel(destinationLabel),
    });
  }

  if (entry.patternName) {
    tokens.push({
      dimension: "pattern_bundle",
      key: `pattern:${entry.patternName.toLowerCase()}`,
      label: entry.patternName,
    });
  }

  if (signal) {
    const sourceProfile = getSourceProfile(signal);
    tokens.push({
      dimension: "source_family",
      key: sourceProfile.id,
      label: sourceProfile.contextLabel,
    });
  }

  return tokens;
}

function toWarning(
  dimension: FatigueDimension,
  entry: FatigueCountEntry,
  total: number,
): FatigueWarning | null {
  const severity = warningSeverity(entry.count, total);
  if (!severity) {
    return null;
  }

  return {
    dimension,
    key: entry.key,
    label: entry.label,
    severity,
    count: entry.count,
    total,
    ratio: total > 0 ? entry.count / total : 0,
    summary: summarizeWarning(dimension, entry.label),
  };
}

export function buildFatigueModel(input: {
  subjects: FatigueSubject[];
  signals: SignalRecord[];
  postingEntries: PostingLogEntry[];
  recentPostingLimit?: number;
}): {
  assessmentsById: Record<string, FatigueAssessment>;
  topWarnings: FatigueWarning[];
  warningSummaries: string[];
  dimensionSummaries: FatigueSummaryTemplate[];
} {
  const signalById = new Map(input.signals.map((signal) => [signal.recordId, signal]));
  for (const subject of input.subjects) {
    signalById.set(subject.signal.recordId, subject.signal);
  }

  const countsByDimension = new Map<FatigueDimension, Map<string, FatigueCountEntry>>();
  const totalsByDimension = new Map<FatigueDimension, number>();

  for (const entry of input.postingEntries.slice(0, input.recentPostingLimit ?? 12)) {
    for (const token of buildPostingEntryTokens(entry, signalById)) {
      incrementCount(countsByDimension, totalsByDimension, token);
    }
  }

  const subjectTokensById = new Map<string, FatigueToken[]>();
  for (const subject of input.subjects) {
    const tokens = buildSubjectTokens(subject);
    subjectTokensById.set(subject.id, tokens);
    for (const token of tokens) {
      incrementCount(countsByDimension, totalsByDimension, token);
    }
  }

  const topWarnings = Array.from(countsByDimension.entries())
    .flatMap(([dimension, byKey]) => {
      const total = totalsByDimension.get(dimension) ?? 0;
      return Array.from(byKey.values())
        .map((entry) => toWarning(dimension, entry, total))
        .filter((warning): warning is FatigueWarning => Boolean(warning));
    })
    .sort(
      (left, right) =>
        (right.severity === "moderate" ? 2 : 1) - (left.severity === "moderate" ? 2 : 1) ||
        right.count - left.count ||
        left.label.localeCompare(right.label),
    )
    .slice(0, 6);

  const assessmentsById = Object.fromEntries(
    input.subjects.map((subject) => {
      const warnings = (subjectTokensById.get(subject.id) ?? [])
        .map((token) => {
          const total = totalsByDimension.get(token.dimension) ?? 0;
          const entry = countsByDimension.get(token.dimension)?.get(token.key);
          if (!entry) {
            return null;
          }

          return toWarning(token.dimension, entry, total);
        })
        .filter((warning): warning is FatigueWarning => Boolean(warning))
        .filter((warning, index, current) => current.findIndex((item) => item.dimension === warning.dimension && item.key === warning.key) === index)
        .sort(
          (left, right) =>
            (right.severity === "moderate" ? 2 : 1) - (left.severity === "moderate" ? 2 : 1) ||
            right.count - left.count ||
            left.label.localeCompare(right.label),
        )
        .slice(0, 3);

      const summaryParts: string[] = [];
      for (const warning of warnings) {
        uniquePush(summaryParts, warning.summary);
      }

      return [
        subject.id,
        {
          warnings,
          scorePenalty: Math.min(
            2,
            warnings.reduce((sum, warning) => sum + (warning.severity === "moderate" ? 1 : 0.5), 0),
          ),
          summary: summaryParts[0] ?? "No clear fatigue signal surfaced.",
        } satisfies FatigueAssessment,
      ];
    }),
  );

  return {
    assessmentsById,
    topWarnings,
    warningSummaries: topWarnings.map((warning) => warning.summary),
    dimensionSummaries: topWarnings.map((warning) => ({
      dimension: warning.dimension,
      label: DIMENSION_LABELS[warning.dimension],
      summary: warning.summary,
    })),
  };
}
