import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { buildSignalAssetBundle, getAssetPrimaryImage, getAssetPrimaryVideo } from "@/lib/assets";
import { appendAuditEventsSafe } from "@/lib/audit";
import { getSignalWithFallback, saveSignalWithFallback } from "@/lib/signal-repository";
import {
  appendPostingLogEntry,
  buildSignalPostingSummary,
  getPostingLogEntries,
  getPostingPlatformLabel,
  type PostingPlatform,
} from "@/lib/posting-log";
import {
  buildSignalPublishPrepBundle,
  getPrimaryLinkVariant,
  getPublishPrepPackageForPlatform,
  getSelectedCtaText,
  getSelectedHookText,
  parsePublishPrepBundle,
} from "@/lib/publish-prep";
import {
  buildSafePostingEligibilityMap,
  executeSafePosting,
  loadSafePostingEvaluationData,
  prepareExecutionPayload,
  safePostingExecutionSourceSchema,
  type SafePostingEligibilityAssessment,
  type SafePostingExecutionSource,
} from "@/lib/safe-posting";
import {
  isReadOnlyFilesystemError,
  logServerlessPersistenceFallback,
} from "@/lib/serverless-persistence";
import type { AssetPrimaryType, SignalRecord } from "@/types/signal";

const POSTING_ASSISTANT_STORE_PATH = path.join(process.cwd(), "data", "posting-assistant.json");

export const POSTING_ASSISTANT_STATUSES = [
  "draft",
  "staged_for_posting",
  "posted",
  "canceled",
] as const;

export type PostingAssistantStatus = (typeof POSTING_ASSISTANT_STATUSES)[number];

const postingAssistantDestinationSchema = z.object({
  siteLinkId: z.string().trim().nullable().default(null),
  label: z.string().trim().nullable().default(null),
  url: z.string().trim().nullable().default(null),
  utmSource: z.string().trim().nullable().default(null),
  utmMedium: z.string().trim().nullable().default(null),
  utmCampaign: z.string().trim().nullable().default(null),
  utmContent: z.string().trim().nullable().default(null),
});

export const postingAssistantPackageSchema = z.object({
  packageId: z.string().trim().min(1),
  signalId: z.string().trim().min(1),
  sourceTitle: z.string().trim().min(1),
  reviewHref: z.string().trim().min(1),
  platform: z.enum(["x", "linkedin", "reddit"]),
  founderVoiceMode: z.enum(["founder_voice_on", "founder_voice_off"]).nullable().default(null),
  finalCaption: z.string().trim().min(1),
  selectedHook: z.string().trim().nullable().default(null),
  selectedCta: z.string().trim().nullable().default(null),
  selectedDestination: postingAssistantDestinationSchema.nullable().default(null),
  finalUtmUrl: z.string().trim().nullable().default(null),
  selectedAssetType: z.enum(["image", "video", "text_first"]).nullable().default(null),
  selectedAssetReference: z.string().trim().nullable().default(null),
  selectedAssetLabel: z.string().trim().nullable().default(null),
  timingSuggestion: z.string().trim().nullable().default(null),
  commentPrompt: z.string().trim().nullable().default(null),
  altText: z.string().trim().nullable().default(null),
  readinessReason: z.string().trim().min(1),
  publishPrepPackageId: z.string().trim().nullable().default(null),
  status: z.enum(POSTING_ASSISTANT_STATUSES),
  stagedAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  postedAt: z.string().trim().nullable().default(null),
  postUrl: z.string().trim().nullable().default(null),
  note: z.string().trim().nullable().default(null),
  executionSource: safePostingExecutionSourceSchema.nullable().default(null),
  lastExecutionError: z.string().trim().nullable().default(null),
});

const postingAssistantStoreSchema = z.object({
  packages: z.array(postingAssistantPackageSchema).default([]),
  updatedAt: z.string().trim().nullable().default(null),
});

export const postingAssistantActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("stage_package"),
    signalId: z.string().trim().min(1),
    platform: z.enum(["x", "linkedin", "reddit"]),
    finalCaption: z.string().trim().optional(),
    publishPrepBundleJson: z.string().trim().nullable().optional(),
    assetBundleJson: z.string().trim().nullable().optional(),
    preferredAssetType: z.enum(["image", "video", "text_first"]).nullable().optional(),
    selectedImageAssetId: z.string().trim().nullable().optional(),
    selectedVideoConceptId: z.string().trim().nullable().optional(),
    generatedImageUrl: z.string().trim().nullable().optional(),
    readinessReason: z.string().trim().nullable().optional(),
  }),
  z.object({
    action: z.literal("cancel_package"),
    packageId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("confirm_posted"),
    packageId: z.string().trim().min(1),
    postedAt: z.string().trim().min(1),
    postUrl: z.string().trim().nullable().optional(),
    note: z.string().trim().nullable().optional(),
  }),
  z.object({
    action: z.literal("safe_post_now"),
    packageId: z.string().trim().min(1),
    confirm: z.boolean().optional(),
  }),
]);

export type PostingAssistantPackage = z.infer<typeof postingAssistantPackageSchema>;
export type PostingAssistantActionRequest = z.infer<typeof postingAssistantActionRequestSchema>;

let inMemoryPostingAssistantStore: z.infer<typeof postingAssistantStoreSchema> =
  postingAssistantStoreSchema.parse({
    packages: [],
    updatedAt: null,
  });

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function packageIdFor(signalId: string, platform: PostingPlatform) {
  return `posting-package:${signalId}:${platform}`;
}

function getPlatformCaption(
  signal: SignalRecord,
  platform: PostingPlatform,
  overrideValue?: string | null,
) {
  const override = normalizeText(overrideValue);
  if (override) {
    return override;
  }

  switch (platform) {
    case "x":
      return normalizeText(signal.finalXDraft) ?? normalizeText(signal.xDraft);
    case "linkedin":
      return normalizeText(signal.finalLinkedInDraft) ?? normalizeText(signal.linkedInDraft);
    case "reddit":
    default:
      return normalizeText(signal.finalRedditDraft) ?? normalizeText(signal.redditDraft);
  }
}

function getPlatformReviewStatus(signal: SignalRecord, platform: PostingPlatform) {
  switch (platform) {
    case "x":
      return signal.xReviewStatus;
    case "linkedin":
      return signal.linkedInReviewStatus;
    case "reddit":
    default:
      return signal.redditReviewStatus;
  }
}

function sortPackages(packages: PostingAssistantPackage[]) {
  return [...packages].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() ||
      left.sourceTitle.localeCompare(right.sourceTitle),
  );
}

async function readPersistedStore() {
  try {
    const raw = await readFile(POSTING_ASSISTANT_STORE_PATH, "utf8");
    const parsed = sanitizePostingAssistantStore(JSON.parse(raw));
    inMemoryPostingAssistantStore = parsed;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return inMemoryPostingAssistantStore;
    }

    console.warn(
      "posting-assistant: persisted store could not be parsed, falling back to in-memory state.",
      error,
    );
    return inMemoryPostingAssistantStore;
  }
}

async function writeStore(store: z.infer<typeof postingAssistantStoreSchema>) {
  const parsed = sanitizePostingAssistantStore(store);
  inMemoryPostingAssistantStore = parsed;

  try {
    await mkdir(path.dirname(POSTING_ASSISTANT_STORE_PATH), { recursive: true });
    await writeFile(POSTING_ASSISTANT_STORE_PATH, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  } catch (error) {
    if (isReadOnlyFilesystemError(error)) {
      logServerlessPersistenceFallback("posting-assistant", error);
      return;
    }

    throw error;
  }
}

function sanitizePostingAssistantStore(input: unknown): z.infer<typeof postingAssistantStoreSchema> {
  const parsed = postingAssistantStoreSchema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  const fallbackInput =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const packages = Array.isArray((fallbackInput as { packages?: unknown }).packages)
    ? (fallbackInput as { packages?: unknown[] }).packages ?? []
    : [];
  const updatedAt =
    typeof (fallbackInput as { updatedAt?: unknown }).updatedAt === "string"
      ? ((fallbackInput as { updatedAt?: string }).updatedAt ?? null)
      : null;

  const sanitizedPackages = packages
    .map((pkg, index) => {
      const parsedPackage = postingAssistantPackageSchema.safeParse(pkg);
      if (!parsedPackage.success) {
        console.warn(
          `posting-assistant: dropping invalid persisted package at index ${index}.`,
          parsedPackage.error,
        );
        return null;
      }

      return parsedPackage.data;
    })
    .filter((pkg): pkg is PostingAssistantPackage => Boolean(pkg));

  return postingAssistantStoreSchema.parse({
    packages: sortPackages(sanitizedPackages),
    updatedAt,
  });
}

export async function listPostingAssistantPackages(options?: {
  status?: PostingAssistantStatus | "active";
}) {
  const store = await readPersistedStore();
  const filtered =
    options?.status === "active"
      ? store.packages.filter((pkg) => pkg.status === "staged_for_posting")
      : options?.status
        ? store.packages.filter((pkg) => pkg.status === options.status)
        : store.packages;

  return sortPackages(filtered);
}

async function getPostingAssistantPackageById(packageId: string) {
  const store = await readPersistedStore();
  return {
    store,
    pkg: store.packages.find((entry) => entry.packageId === packageId) ?? null,
  };
}

async function persistPostingAssistantPackage(
  store: z.infer<typeof postingAssistantStoreSchema>,
  pkg: PostingAssistantPackage,
) {
  await writeStore(
    postingAssistantStoreSchema.parse({
      packages: sortPackages([
        pkg,
        ...store.packages.filter((entry) => entry.packageId !== pkg.packageId),
      ]),
      updatedAt: pkg.updatedAt,
    }),
  );
}

function buildReadinessReason(signal: SignalRecord, platform: PostingPlatform, override?: string | null) {
  const normalizedOverride = normalizeText(override);
  if (normalizedOverride) {
    return normalizedOverride;
  }

  const reviewStatus = getPlatformReviewStatus(signal, platform);
  if (reviewStatus === "ready") {
    return `Final ${getPostingPlatformLabel(platform)} draft is marked ready and the publish-prep package is locked for manual posting.`;
  }

  return `Final ${getPostingPlatformLabel(platform)} draft and posting package were staged together to reduce manual posting friction.`;
}

function buildPostingAssistantPackage(input: {
  signal: SignalRecord;
  platform: PostingPlatform;
  now: string;
  overrides?: {
    finalCaption?: string | null;
    publishPrepBundleJson?: string | null;
    assetBundleJson?: string | null;
    preferredAssetType?: AssetPrimaryType | null;
    selectedImageAssetId?: string | null;
    selectedVideoConceptId?: string | null;
    generatedImageUrl?: string | null;
    readinessReason?: string | null;
  };
  previous?: PostingAssistantPackage | null;
}): PostingAssistantPackage {
  const nextSignal: SignalRecord = {
    ...input.signal,
    publishPrepBundleJson:
      input.overrides?.publishPrepBundleJson ?? input.signal.publishPrepBundleJson,
    assetBundleJson: input.overrides?.assetBundleJson ?? input.signal.assetBundleJson,
    preferredAssetType:
      input.overrides?.preferredAssetType ?? input.signal.preferredAssetType,
    selectedImageAssetId:
      input.overrides?.selectedImageAssetId ?? input.signal.selectedImageAssetId,
    selectedVideoConceptId:
      input.overrides?.selectedVideoConceptId ?? input.signal.selectedVideoConceptId,
    generatedImageUrl: input.overrides?.generatedImageUrl ?? input.signal.generatedImageUrl,
  };
  const publishPrepBundle =
    parsePublishPrepBundle(nextSignal.publishPrepBundleJson) ??
    buildSignalPublishPrepBundle(nextSignal);
  const publishPrepPackage = getPublishPrepPackageForPlatform(publishPrepBundle, input.platform);
  const primaryLink = publishPrepPackage ? getPrimaryLinkVariant(publishPrepPackage) : null;
  const assetBundle = buildSignalAssetBundle(nextSignal);
  const selectedAssetType = nextSignal.preferredAssetType ?? assetBundle?.suggestedPrimaryAssetType ?? null;
  const selectedImage = getAssetPrimaryImage(assetBundle, nextSignal.selectedImageAssetId);
  const selectedVideo = getAssetPrimaryVideo(assetBundle, nextSignal.selectedVideoConceptId);

  const selectedAssetReference =
    selectedAssetType === "image"
      ? normalizeText(nextSignal.generatedImageUrl) ?? selectedImage?.id ?? null
      : selectedAssetType === "video"
        ? selectedVideo?.id ?? null
        : null;
  const selectedAssetLabel =
    selectedAssetType === "image"
      ? selectedImage?.conceptTitle ?? null
      : selectedAssetType === "video"
        ? selectedVideo?.conceptTitle ?? null
        : "Text-first";

  return postingAssistantPackageSchema.parse({
    packageId: packageIdFor(input.signal.recordId, input.platform),
    signalId: input.signal.recordId,
    sourceTitle: input.signal.sourceTitle,
    reviewHref: `/signals/${input.signal.recordId}/review`,
    platform: input.platform,
    founderVoiceMode: input.signal.founderVoiceMode ?? null,
    finalCaption: getPlatformCaption(input.signal, input.platform, input.overrides?.finalCaption) ?? input.signal.sourceTitle,
    selectedHook: publishPrepPackage ? getSelectedHookText(publishPrepPackage) : null,
    selectedCta: publishPrepPackage ? getSelectedCtaText(publishPrepPackage) : null,
    selectedDestination: primaryLink
      ? {
          siteLinkId: primaryLink.siteLinkId ?? publishPrepPackage?.siteLinkId ?? null,
          label: primaryLink.destinationLabel ?? publishPrepPackage?.siteLinkLabel ?? primaryLink.label,
          url: primaryLink.url,
          utmSource: primaryLink.utmParameters?.utm_source ?? null,
          utmMedium: primaryLink.utmParameters?.utm_medium ?? null,
          utmCampaign: primaryLink.utmParameters?.utm_campaign ?? null,
          utmContent: primaryLink.utmParameters?.utm_content ?? null,
        }
      : null,
    finalUtmUrl: primaryLink?.url ?? null,
    selectedAssetType,
    selectedAssetReference,
    selectedAssetLabel,
    timingSuggestion: publishPrepPackage?.suggestedPostingTime ?? null,
    commentPrompt: publishPrepPackage?.commentPrompt?.text ?? null,
    altText: publishPrepPackage?.altText?.text ?? null,
    readinessReason: buildReadinessReason(input.signal, input.platform, input.overrides?.readinessReason),
    publishPrepPackageId: publishPrepPackage?.id ?? null,
    status: "staged_for_posting",
    stagedAt: input.previous?.stagedAt ?? input.now,
    updatedAt: input.now,
    postedAt: input.previous?.postedAt ?? null,
    postUrl: input.previous?.postUrl ?? null,
    note: input.previous?.note ?? null,
    executionSource: input.previous?.executionSource ?? null,
    lastExecutionError: null,
  });
}

export async function stagePostingAssistantPackage(input: {
  signal: SignalRecord;
  platform: PostingPlatform;
  overrides?: {
    finalCaption?: string | null;
    publishPrepBundleJson?: string | null;
    assetBundleJson?: string | null;
    preferredAssetType?: AssetPrimaryType | null;
    selectedImageAssetId?: string | null;
    selectedVideoConceptId?: string | null;
    generatedImageUrl?: string | null;
    readinessReason?: string | null;
  };
}) {
  const store = await readPersistedStore();
  const previous =
    store.packages.find((entry) => entry.packageId === packageIdFor(input.signal.recordId, input.platform)) ??
    null;
  const now = new Date().toISOString();
  const nextPackage = buildPostingAssistantPackage({
    signal: input.signal,
    platform: input.platform,
    overrides: input.overrides,
    previous,
    now,
  });
  const nextPackages = sortPackages([
    nextPackage,
    ...store.packages.filter((entry) => entry.packageId !== nextPackage.packageId),
  ]);

  await writeStore(
    postingAssistantStoreSchema.parse({ packages: nextPackages, updatedAt: now }),
  );

  await appendAuditEventsSafe([
    {
      signalId: input.signal.recordId,
      eventType: previous ? "POSTING_PACKAGE_UPDATED" : "POSTING_PACKAGE_STAGED",
      actor: "operator",
      summary: previous
        ? `Updated staged ${getPostingPlatformLabel(input.platform)} posting package.`
        : `Staged ${getPostingPlatformLabel(input.platform)} posting package.`,
      metadata: {
        packageId: nextPackage.packageId,
        platform: input.platform,
        assetType: nextPackage.selectedAssetType,
        publishPrepPackageId: nextPackage.publishPrepPackageId,
      },
    },
  ]);

  return {
    pkg: nextPackage,
    created: !previous,
  };
}

export async function cancelPostingAssistantPackage(packageId: string) {
  const { store, pkg } = await getPostingAssistantPackageById(packageId);
  if (!pkg) {
    throw new Error("Staged posting package not found.");
  }

  const nextPackage = postingAssistantPackageSchema.parse({
    ...pkg,
    status: "canceled",
    updatedAt: new Date().toISOString(),
    lastExecutionError: null,
  });
  await persistPostingAssistantPackage(store, nextPackage);

  await appendAuditEventsSafe([
    {
      signalId: pkg.signalId,
      eventType: "POSTING_PACKAGE_CANCELED",
      actor: "operator",
      summary: `Canceled staged ${getPostingPlatformLabel(pkg.platform)} posting package.`,
      metadata: {
        packageId: pkg.packageId,
        platform: pkg.platform,
      },
    },
  ]);

  return nextPackage;
}

async function completePostingAssistantPackage(input: {
  store: z.infer<typeof postingAssistantStoreSchema>;
  pkg: PostingAssistantPackage;
  postedAt: string;
  postUrl?: string | null;
  note?: string | null;
  createdBy: string;
  executionSource: SafePostingExecutionSource;
  auditEventType: "POSTING_CONFIRMED_MANUALLY" | "SAFE_POSTING_COMPLETED";
  auditSummary: string;
}) {
  const signalResult = await getSignalWithFallback(input.pkg.signalId);
  if (!signalResult.signal) {
    throw new Error(signalResult.error ?? "Signal not found.");
  }

  const signal = signalResult.signal;
  const entry = await appendPostingLogEntry({
    signalId: input.pkg.signalId,
    platform: input.pkg.platform,
    postedAt: input.postedAt,
    finalPostedText: input.pkg.finalCaption,
    postUrl: input.postUrl ?? null,
    note: input.note ?? input.pkg.note ?? null,
    createdBy: input.createdBy,
    editorialMode: signal.editorialMode,
    scenarioAngle: signal.scenarioAngle,
    sourceDraftStatus: getPlatformReviewStatus(signal, input.pkg.platform),
    publishPrepPackageId: input.pkg.publishPrepPackageId,
    selectedHookText: input.pkg.selectedHook,
    selectedCtaText: input.pkg.selectedCta,
    suggestedPostingTime: input.pkg.timingSuggestion,
    selectedSiteLinkId: input.pkg.selectedDestination?.siteLinkId ?? null,
    destinationUrl: input.pkg.selectedDestination?.url ?? null,
    destinationLabel: input.pkg.selectedDestination?.label ?? null,
    utmSource: input.pkg.selectedDestination?.utmSource ?? null,
    utmMedium: input.pkg.selectedDestination?.utmMedium ?? null,
    utmCampaign: input.pkg.selectedDestination?.utmCampaign ?? null,
    utmContent: input.pkg.selectedDestination?.utmContent ?? null,
  });
  const entries = await getPostingLogEntries(input.pkg.signalId);
  const postingSummary = buildSignalPostingSummary(signal, entries);
  const latestEntry = entries[0] ?? entry;
  const updatedStatus =
    postingSummary.allReadyDraftsPosted && signal.status !== "Posted" ? "Posted" : signal.status;
  const savedSignalResult = await saveSignalWithFallback(input.pkg.signalId, {
    posted: true,
    postedDate: postingSummary.latestPostedAt,
    platformPostedTo:
      postingSummary.postedPlatformsCount === 0
        ? null
        : postingSummary.postedPlatformsCount === 1
          ? postingSummary.postedPlatforms[0]
          : "Multiple",
    postUrl: latestEntry.postUrl ?? signal.postUrl,
    finalCaptionUsed: latestEntry.finalPostedText,
    status: updatedStatus,
  });

  const nextPackage = postingAssistantPackageSchema.parse({
    ...input.pkg,
    status: "posted",
    postedAt: entry.postedAt,
    postUrl: normalizeText(input.postUrl) ?? null,
    note: normalizeText(input.note) ?? input.pkg.note ?? null,
    updatedAt: new Date().toISOString(),
    executionSource: input.executionSource,
    lastExecutionError: null,
  });
  await persistPostingAssistantPackage(input.store, nextPackage);

  await appendAuditEventsSafe([
    {
      signalId: input.pkg.signalId,
      eventType: input.auditEventType,
      actor: "operator",
      summary: input.auditSummary,
      metadata: {
        packageId: input.pkg.packageId,
        platform: input.pkg.platform,
        postedAt: entry.postedAt,
        executionSource: input.executionSource,
      },
    },
  ]);

  return {
    pkg: nextPackage,
    entry,
    signal: savedSignalResult.signal ?? signal,
  };
}

export async function confirmPostingAssistantPackageManually(input: {
  packageId: string;
  postedAt: string;
  postUrl?: string | null;
  note?: string | null;
}) {
  const { store, pkg } = await getPostingAssistantPackageById(input.packageId);
  if (!pkg) {
    throw new Error("Staged posting package not found.");
  }

  return completePostingAssistantPackage({
    store,
    pkg,
    postedAt: input.postedAt,
    postUrl: input.postUrl ?? null,
    note: input.note ?? null,
    createdBy: "operator",
    executionSource: "operator_manual",
    auditEventType: "POSTING_CONFIRMED_MANUALLY",
    auditSummary: `Confirmed manual ${getPostingPlatformLabel(pkg.platform)} posting from staged package.`,
  });
}

export async function getSafePostingEligibilityForPackage(packageId: string) {
  const { pkg } = await getPostingAssistantPackageById(packageId);
  if (!pkg) {
    throw new Error("Staged posting package not found.");
  }

  const evaluationData = await loadSafePostingEvaluationData();
  const eligibilityByPackageId = buildSafePostingEligibilityMap({
    packages: [pkg],
    candidateBySignalId: evaluationData.approvalCandidateBySignalId,
    tuning: evaluationData.tuning,
    experiments: evaluationData.experiments,
  });

  return eligibilityByPackageId[pkg.packageId] ?? null;
}

export async function safePostPostingAssistantPackage(input: {
  packageId: string;
  confirm?: boolean;
}) {
  const { store, pkg } = await getPostingAssistantPackageById(input.packageId);
  if (!pkg) {
    throw new Error("Staged posting package not found.");
  }

  const evaluationData = await loadSafePostingEvaluationData();
  const eligibility = buildSafePostingEligibilityMap({
    packages: [pkg],
    candidateBySignalId: evaluationData.approvalCandidateBySignalId,
    tuning: evaluationData.tuning,
    experiments: evaluationData.experiments,
  })[pkg.packageId] as SafePostingEligibilityAssessment;

  await appendAuditEventsSafe([
    {
      signalId: pkg.signalId,
      eventType: "SAFE_POSTING_ELIGIBILITY_COMPUTED",
      actor: "operator",
      summary: `Computed safe-posting eligibility for ${getPostingPlatformLabel(pkg.platform)} staged package.`,
      metadata: {
        packageId: pkg.packageId,
        platform: pkg.platform,
        eligibility: eligibility.postingEligibility,
      },
    },
    {
      signalId: pkg.signalId,
      eventType: "AUTONOMY_POLICY_EVALUATED",
      actor: "operator",
      summary: `Evaluated autonomy policy for ${getPostingPlatformLabel(pkg.platform)} safe-posting.`,
      metadata: {
        actionType: "safe_post",
        decision:
          eligibility.postingEligibility === "eligible_safe_post"
            ? "allow"
            : eligibility.postingEligibility === "manual_only"
              ? "suggest_only"
              : "block",
      },
    },
    {
      signalId: pkg.signalId,
      eventType:
        eligibility.postingEligibility === "eligible_safe_post"
          ? "AUTONOMY_POLICY_ALLOWED_ACTION"
          : eligibility.postingEligibility === "manual_only"
            ? "AUTONOMY_POLICY_SUGGESTED_ONLY"
            : "AUTONOMY_POLICY_BLOCKED_ACTION",
      actor: "operator",
      summary: `Autonomy policy resolved ${getPostingPlatformLabel(pkg.platform)} safe-posting as ${eligibility.postingEligibility === "eligible_safe_post" ? "allow" : eligibility.postingEligibility === "manual_only" ? "suggest only" : "block"}.`,
      metadata: {
        actionType: "safe_post",
        decision:
          eligibility.postingEligibility === "eligible_safe_post"
            ? "allow"
            : eligibility.postingEligibility === "manual_only"
              ? "suggest_only"
              : "block",
        reason:
          eligibility.blockReasons[0] ??
          eligibility.manualOnlyReason ??
          eligibility.summary,
      },
    },
  ]);

  if (eligibility.postingEligibility === "blocked") {
    await appendAuditEventsSafe([
      {
        signalId: pkg.signalId,
        eventType: "SAFE_POSTING_BLOCKED",
        actor: "operator",
        summary: `Blocked strict safe-mode posting for ${getPostingPlatformLabel(pkg.platform)} staged package.`,
        metadata: {
          packageId: pkg.packageId,
          platform: pkg.platform,
          reason: eligibility.blockReasons[0] ?? "Blocked",
        },
      },
    ]);

    const blockedPackage = postingAssistantPackageSchema.parse({
      ...pkg,
      updatedAt: new Date().toISOString(),
      lastExecutionError: eligibility.blockReasons[0] ?? eligibility.summary,
    });
    await persistPostingAssistantPackage(store, blockedPackage);
    throw new Error(eligibility.blockReasons[0] ?? eligibility.summary);
  }

  if (eligibility.postingEligibility === "manual_only") {
    throw new Error(eligibility.manualOnlyReason ?? eligibility.summary);
  }

  if (eligibility.requiresConfirmation && !input.confirm) {
    throw new Error("Safe-mode posting confirmation is required before send.");
  }

  await appendAuditEventsSafe([
    {
      signalId: pkg.signalId,
      eventType: "SAFE_POSTING_INITIATED",
      actor: "operator",
      summary: `Initiated strict safe-mode posting for ${getPostingPlatformLabel(pkg.platform)} staged package.`,
      metadata: {
        packageId: pkg.packageId,
        platform: pkg.platform,
      },
    },
  ]);

  if (input.confirm) {
    await appendAuditEventsSafe([
      {
        signalId: pkg.signalId,
        eventType: "SAFE_POSTING_CONFIRMED",
        actor: "operator",
        summary: `Confirmed strict safe-mode posting for ${getPostingPlatformLabel(pkg.platform)} staged package.`,
        metadata: {
          packageId: pkg.packageId,
          platform: pkg.platform,
        },
      },
    ]);
  }

  try {
    const payload = prepareExecutionPayload({ pkg, eligibility });
    const executionResult = await executeSafePosting({ payload });

    const completion = await completePostingAssistantPackage({
      store,
      pkg,
      postedAt: executionResult.postedAt,
      postUrl: executionResult.postUrl,
      note: executionResult.note,
      createdBy: "engine_safe_mode",
      executionSource: executionResult.executionSource,
      auditEventType: "SAFE_POSTING_COMPLETED",
      auditSummary: `Completed strict safe-mode posting for ${getPostingPlatformLabel(pkg.platform)} staged package.`,
    });

    return {
      ...completion,
      eligibility,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Safe-mode posting failed and the staged package was preserved.";
    const failedPackage = postingAssistantPackageSchema.parse({
      ...pkg,
      updatedAt: new Date().toISOString(),
      lastExecutionError: message,
    });
    await persistPostingAssistantPackage(store, failedPackage);
    await appendAuditEventsSafe([
      {
        signalId: pkg.signalId,
        eventType: "SAFE_POSTING_FAILED",
        actor: "operator",
        summary: `Strict safe-mode posting failed for ${getPostingPlatformLabel(pkg.platform)} staged package.`,
        metadata: {
          packageId: pkg.packageId,
          platform: pkg.platform,
          reason: message,
        },
      },
    ]);
    throw new Error(message);
  }
}

