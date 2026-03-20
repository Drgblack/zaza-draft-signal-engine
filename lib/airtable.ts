import { AIRTABLE_EXPECTED_FIELD_LABELS, AIRTABLE_SIGNAL_FIELD_DEFINITIONS, getAirtableFieldLabel } from "@/lib/airtable-schema";
import { getAppConfig } from "@/lib/config";
import { buildMockUpdatedSignal, getMockSignalById, mockSignalRecords } from "@/lib/mock-data";
import type { AirtableErrorResponse, AirtableFields, AirtableListResponse, AirtableRecord } from "@/types/airtable";
import type { SignalCreatePayload, SignalDataSource, SignalRecord, SignalStatus, UpdateSignalInput } from "@/types/signal";

type AirtableDiagnostics = {
  configured: boolean;
  apiReachable: boolean;
  tableReachable: boolean;
  schemaAligned: boolean;
  mappingSucceeded: boolean;
  mode: SignalDataSource;
  missingFields: string[];
  message: string;
};

interface AirtableTableMetadataResponse {
  tables?: Array<{
    id: string;
    name: string;
    fields: Array<{
      name: string;
      type: string;
    }>;
  }>;
}

interface SignalCollectionResult {
  source: SignalDataSource;
  signals: SignalRecord[];
  error?: string;
  message?: string;
}

interface SignalLookupResult {
  source: SignalDataSource;
  signal: SignalRecord | null;
  error?: string;
}

class AirtableClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: "configuration_error" | "request_error" | "mapping_error" = "request_error",
  ) {
    super(message);
    this.name = "AirtableClientError";
  }
}

function getConfiguredAirtable() {
  const config = getAppConfig();

  if (!config.isAirtableConfigured || !config.airtablePat || !config.airtableBaseId || !config.airtableTableName) {
    throw new AirtableClientError("Airtable is not configured. Mock mode is active.", 500, "configuration_error");
  }

  return {
    pat: config.airtablePat,
    baseId: config.airtableBaseId,
    tableName: config.airtableTableName,
  };
}

function buildDataUrl(path = "", searchParams?: URLSearchParams) {
  const config = getConfiguredAirtable();
  const url = new URL(`https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.tableName)}${path}`);
  if (searchParams) {
    url.search = searchParams.toString();
  }

  return { url: url.toString(), pat: config.pat };
}

function buildMetaUrl() {
  const config = getConfiguredAirtable();
  return {
    url: `https://api.airtable.com/v0/meta/bases/${config.baseId}/tables`,
    pat: config.pat,
    tableName: config.tableName,
  };
}

async function airtableFetch<TResponse>(
  target: { url: string; pat: string },
  init?: RequestInit,
): Promise<TResponse> {
  const response = await fetch(target.url, {
    ...init,
    headers: {
      Authorization: `Bearer ${target.pat}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as AirtableErrorResponse | null;
    throw new AirtableClientError(
      errorBody?.error?.message ?? `Airtable request failed with status ${response.status}.`,
      response.status,
    );
  }

  return (await response.json()) as TResponse;
}

function parseText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  return null;
}

function parseCheckbox(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "y"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "0", "n"].includes(normalized)) {
      return false;
    }
  }

  return value === null || value === undefined ? null : null;
}

function parseSelect<T extends readonly string[]>(value: unknown, allowedValues: T): T[number] | null {
  const parsed = parseText(value);
  if (!parsed) {
    return null;
  }

  return allowedValues.includes(parsed as T[number]) ? (parsed as T[number]) : null;
}

function parseSeverityScore(value: unknown): SignalRecord["severityScore"] {
  const parsedNumber = parseNumber(value);
  if (parsedNumber === 1 || parsedNumber === 2 || parsedNumber === 3) {
    return parsedNumber;
  }

  return null;
}

function serializeText(value: unknown): string | undefined {
  return parseText(value) ?? undefined;
}

function serializeNumber(value: unknown): number | undefined {
  const parsed = parseNumber(value);
  return parsed ?? undefined;
}

function serializeCheckbox(value: unknown): boolean | undefined {
  const parsed = parseCheckbox(value);
  return parsed ?? undefined;
}

function serializeTextBoolean(value: unknown): string | undefined {
  const parsed = parseCheckbox(value);
  if (parsed === null) {
    return undefined;
  }

  return parsed ? "Yes" : "No";
}

function serializeSelect(value: unknown, allowedValues?: readonly string[]): string | undefined {
  const parsed = parseText(value);
  if (!parsed) {
    return undefined;
  }

  if (allowedValues && !allowedValues.includes(parsed)) {
    throw new AirtableClientError(`Invalid select value "${parsed}" for Airtable field.`, 400, "mapping_error");
  }

  return parsed;
}

function serializeSeverityScore(value: SignalRecord["severityScore"]): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return String(value);
}

function serializeSignalField(key: keyof Omit<SignalRecord, "recordId">, value: SignalRecord[typeof key]): AirtableFields[string] {
  const field = AIRTABLE_SIGNAL_FIELD_DEFINITIONS[key];

  switch (field.kind) {
    case "text":
      return serializeText(value);
    case "number":
      return serializeNumber(value);
    case "checkbox":
      return serializeCheckbox(value);
    case "select":
      return serializeSelect(value, field.allowedValues);
    case "select-number":
      return serializeSeverityScore(value as SignalRecord["severityScore"]);
    case "text-boolean":
      return serializeTextBoolean(value);
    default:
      return undefined;
  }
}

function getFieldValue(fields: AirtableFields, key: keyof Omit<SignalRecord, "recordId">) {
  return fields[getAirtableFieldLabel(key)];
}

function mapRecordFromAirtable(record: AirtableRecord<AirtableFields>): SignalRecord {
  const fields = record.fields;

  return {
    recordId: record.id,
    createdDate: parseText(getFieldValue(fields, "createdDate")) ?? record.createdTime,
    createdBy: parseText(getFieldValue(fields, "createdBy")),
    status:
      (parseSelect(getFieldValue(fields, "status"), AIRTABLE_SIGNAL_FIELD_DEFINITIONS.status.allowedValues ?? []) as SignalRecord["status"] | null) ??
      "New",
    reviewNotes: parseText(getFieldValue(fields, "reviewNotes")),
    reuseFlag: parseCheckbox(getFieldValue(fields, "reuseFlag")) ?? false,
    ingestionSource: parseText(getFieldValue(fields, "ingestionSource")),
    ingestionMethod: parseText(getFieldValue(fields, "ingestionMethod")),
    signalRelevanceScore: parseNumber(getFieldValue(fields, "signalRelevanceScore")),
    signalNoveltyScore: parseNumber(getFieldValue(fields, "signalNoveltyScore")),
    signalUrgencyScore: parseNumber(getFieldValue(fields, "signalUrgencyScore")),
    brandFitScore: parseNumber(getFieldValue(fields, "brandFitScore")),
    sourceTrustScore: parseNumber(getFieldValue(fields, "sourceTrustScore")),
    duplicateClusterId: parseText(getFieldValue(fields, "duplicateClusterId")),
    keepRejectRecommendation: parseSelect(
      getFieldValue(fields, "keepRejectRecommendation"),
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.keepRejectRecommendation.allowedValues ?? [],
    ) as SignalRecord["keepRejectRecommendation"],
    whySelected: parseText(getFieldValue(fields, "whySelected")),
    whyRejected: parseText(getFieldValue(fields, "whyRejected")),
    autoGenerated: parseCheckbox(getFieldValue(fields, "autoGenerated")),
    needsHumanReview: parseCheckbox(getFieldValue(fields, "needsHumanReview")),
    qualityGateResult: parseSelect(
      getFieldValue(fields, "qualityGateResult"),
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.qualityGateResult.allowedValues ?? [],
    ) as SignalRecord["qualityGateResult"],
    similarityToExistingContent: parseNumber(getFieldValue(fields, "similarityToExistingContent")),
    reviewPriority: parseSelect(
      getFieldValue(fields, "reviewPriority"),
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.reviewPriority.allowedValues ?? [],
    ) as SignalRecord["reviewPriority"],
    scheduledDate: parseText(getFieldValue(fields, "scheduledDate")),
    postedDate: parseText(getFieldValue(fields, "postedDate")),
    sourceUrl: parseText(getFieldValue(fields, "sourceUrl")),
    sourceTitle: parseText(getFieldValue(fields, "sourceTitle")) ?? "Untitled Signal",
    sourceType: parseText(getFieldValue(fields, "sourceType")),
    sourcePublisher: parseText(getFieldValue(fields, "sourcePublisher")),
    sourceDate: parseText(getFieldValue(fields, "sourceDate")),
    rawExcerpt: parseText(getFieldValue(fields, "rawExcerpt")),
    manualSummary: parseText(getFieldValue(fields, "manualSummary")),
    scenarioAngle: parseText(getFieldValue(fields, "scenarioAngle")),
    signalCategory: parseSelect(
      getFieldValue(fields, "signalCategory"),
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.signalCategory.allowedValues ?? [],
    ) as SignalRecord["signalCategory"],
    severityScore: parseSeverityScore(getFieldValue(fields, "severityScore")),
    signalSubtype: parseText(getFieldValue(fields, "signalSubtype")),
    emotionalPattern: parseText(getFieldValue(fields, "emotionalPattern")),
    teacherPainPoint: parseText(getFieldValue(fields, "teacherPainPoint")),
    relevanceToZazaDraft: parseSelect(
      getFieldValue(fields, "relevanceToZazaDraft"),
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.relevanceToZazaDraft.allowedValues ?? [],
    ) as SignalRecord["relevanceToZazaDraft"],
    riskToTeacher: parseText(getFieldValue(fields, "riskToTeacher")),
    interpretationNotes: parseText(getFieldValue(fields, "interpretationNotes")),
    hookTemplateUsed: parseText(getFieldValue(fields, "hookTemplateUsed")),
    contentAngle: parseText(getFieldValue(fields, "contentAngle")),
    platformPriority: parseSelect(
      getFieldValue(fields, "platformPriority"),
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.platformPriority.allowedValues ?? [],
    ) as SignalRecord["platformPriority"],
    suggestedFormatPriority: parseSelect(
      getFieldValue(fields, "suggestedFormatPriority"),
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.suggestedFormatPriority.allowedValues ?? [],
    ) as SignalRecord["suggestedFormatPriority"],
    xDraft: parseText(getFieldValue(fields, "xDraft")),
    linkedInDraft: parseText(getFieldValue(fields, "linkedInDraft")),
    redditDraft: parseText(getFieldValue(fields, "redditDraft")),
    finalXDraft: parseText(getFieldValue(fields, "finalXDraft")),
    finalLinkedInDraft: parseText(getFieldValue(fields, "finalLinkedInDraft")),
    finalRedditDraft: parseText(getFieldValue(fields, "finalRedditDraft")),
    xReviewStatus: parseSelect(
      getFieldValue(fields, "xReviewStatus"),
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.xReviewStatus.allowedValues ?? [],
    ) as SignalRecord["xReviewStatus"],
    linkedInReviewStatus: parseSelect(
      getFieldValue(fields, "linkedInReviewStatus"),
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.linkedInReviewStatus.allowedValues ?? [],
    ) as SignalRecord["linkedInReviewStatus"],
    redditReviewStatus: parseSelect(
      getFieldValue(fields, "redditReviewStatus"),
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.redditReviewStatus.allowedValues ?? [],
    ) as SignalRecord["redditReviewStatus"],
    finalReviewNotes: parseText(getFieldValue(fields, "finalReviewNotes")),
    finalReviewStartedAt: parseText(getFieldValue(fields, "finalReviewStartedAt")),
    finalReviewedAt: parseText(getFieldValue(fields, "finalReviewedAt")),
    imagePrompt: parseText(getFieldValue(fields, "imagePrompt")),
    videoScript: parseText(getFieldValue(fields, "videoScript")),
    ctaOrClosingLine: parseText(getFieldValue(fields, "ctaOrClosingLine")),
    hashtagsOrKeywords: parseText(getFieldValue(fields, "hashtagsOrKeywords")),
    posted: parseCheckbox(getFieldValue(fields, "posted")) ?? false,
    platformPostedTo: parseText(getFieldValue(fields, "platformPostedTo")),
    finalCaptionUsed: parseText(getFieldValue(fields, "finalCaptionUsed")),
    assetLink: parseText(getFieldValue(fields, "assetLink")),
    postUrl: parseText(getFieldValue(fields, "postUrl")),
    platformPerformedBest: parseText(getFieldValue(fields, "platformPerformedBest")),
    likesOrReactions: parseNumber(getFieldValue(fields, "likesOrReactions")),
    comments: parseNumber(getFieldValue(fields, "comments")),
    sharesOrReposts: parseNumber(getFieldValue(fields, "sharesOrReposts")),
    saves: parseNumber(getFieldValue(fields, "saves")),
    clicks: parseNumber(getFieldValue(fields, "clicks")),
    engagementScore: parseNumber(getFieldValue(fields, "engagementScore")),
    outcomeQuality: parseSelect(
      getFieldValue(fields, "outcomeQuality"),
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.outcomeQuality.allowedValues ?? [],
    ) as SignalRecord["outcomeQuality"],
    whyItPerformedOrDidnt: parseText(getFieldValue(fields, "whyItPerformedOrDidnt")),
    repeatablePattern: parseCheckbox(getFieldValue(fields, "repeatablePattern")),
    bestHookSignalCombination: parseText(getFieldValue(fields, "bestHookSignalCombination")),
    evergreenPotential: parseText(getFieldValue(fields, "evergreenPotential")),
    repurposeLater: parseCheckbox(getFieldValue(fields, "repurposeLater")) ?? false,
    repurposeIdeas: parseText(getFieldValue(fields, "repurposeIdeas")),
    teacherVoiceSource: parseText(getFieldValue(fields, "teacherVoiceSource")) as SignalRecord["teacherVoiceSource"],
    anonymisedUserPattern: parseCheckbox(getFieldValue(fields, "anonymisedUserPattern")),
    relatedZazaFrameworkTag: parseText(getFieldValue(fields, "relatedZazaFrameworkTag")),
    editorialMode: parseSelect(
      getFieldValue(fields, "editorialMode"),
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.editorialMode.allowedValues ?? [],
    ) as SignalRecord["editorialMode"],
    founderVoiceMode: parseSelect(
      getFieldValue(fields, "founderVoiceMode"),
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.founderVoiceMode.allowedValues ?? [],
    ) as SignalRecord["founderVoiceMode"],
    founderVoiceAppliedAt: parseText(getFieldValue(fields, "founderVoiceAppliedAt")),
    campaignId: parseText(getFieldValue(fields, "campaignId")),
    pillarId: parseText(getFieldValue(fields, "pillarId")),
    audienceSegmentId: parseText(getFieldValue(fields, "audienceSegmentId")),
    funnelStage: parseSelect(
      getFieldValue(fields, "funnelStage"),
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.funnelStage.allowedValues ?? [],
    ) as SignalRecord["funnelStage"],
    ctaGoal: parseSelect(
      getFieldValue(fields, "ctaGoal"),
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.ctaGoal.allowedValues ?? [],
    ) as SignalRecord["ctaGoal"],
    generationModelVersion: parseText(getFieldValue(fields, "generationModelVersion")),
    promptVersion: parseText(getFieldValue(fields, "promptVersion")),
    assetBundleJson: parseText(getFieldValue(fields, "assetBundleJson")),
    repurposingBundleJson: parseText(getFieldValue(fields, "repurposingBundleJson")),
    publishPrepBundleJson: parseText(getFieldValue(fields, "publishPrepBundleJson")),
    selectedRepurposedOutputIdsJson: parseText(getFieldValue(fields, "selectedRepurposedOutputIdsJson")),
    autoRepairHistoryJson: parseText(getFieldValue(fields, "autoRepairHistoryJson")),
    preferredAssetType: parseSelect(
      getFieldValue(fields, "preferredAssetType"),
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.preferredAssetType.allowedValues ?? [],
    ) as SignalRecord["preferredAssetType"],
    selectedImageAssetId: parseText(getFieldValue(fields, "selectedImageAssetId")),
    selectedVideoConceptId: parseText(getFieldValue(fields, "selectedVideoConceptId")),
    generatedImageUrl: parseText(getFieldValue(fields, "generatedImageUrl")),
  };
}

function mapUpdateInputToAirtableFields(input: UpdateSignalInput): AirtableFields {
  const fields: AirtableFields = {};

  for (const [key, value] of Object.entries(input) as Array<[keyof UpdateSignalInput, UpdateSignalInput[keyof UpdateSignalInput]]>) {
    if (value === undefined) {
      continue;
    }

    const serialized = serializeSignalField(key as keyof Omit<SignalRecord, "recordId">, value as never);
    if (serialized !== undefined) {
      fields[getAirtableFieldLabel(key as keyof Omit<SignalRecord, "recordId">)] = serialized;
    }
  }

  return fields;
}

function mapCreatePayloadToAirtableFields(input: SignalCreatePayload): AirtableFields {
  return {
    [getAirtableFieldLabel("createdDate")]: new Date().toISOString(),
    [getAirtableFieldLabel("createdBy")]: serializeText(input.createdBy) ?? "Dashboard Intake",
    [getAirtableFieldLabel("status")]: input.status,
    [getAirtableFieldLabel("sourceTitle")]: input.sourceTitle,
    ...(serializeText(input.sourceUrl) ? { [getAirtableFieldLabel("sourceUrl")]: serializeText(input.sourceUrl) } : {}),
    ...(serializeText(input.sourceType) ? { [getAirtableFieldLabel("sourceType")]: serializeText(input.sourceType) } : {}),
    ...(serializeText(input.sourcePublisher)
      ? { [getAirtableFieldLabel("sourcePublisher")]: serializeText(input.sourcePublisher) }
      : {}),
    ...(serializeText(input.sourceDate) ? { [getAirtableFieldLabel("sourceDate")]: serializeText(input.sourceDate) } : {}),
    ...(serializeText(input.rawExcerpt) ? { [getAirtableFieldLabel("rawExcerpt")]: serializeText(input.rawExcerpt) } : {}),
    ...(serializeText(input.manualSummary)
      ? { [getAirtableFieldLabel("manualSummary")]: serializeText(input.manualSummary) }
      : {}),
    ...(serializeText(input.scenarioAngle)
      ? { [getAirtableFieldLabel("scenarioAngle")]: serializeText(input.scenarioAngle) }
      : {}),
    ...(serializeSelect(input.signalCategory, AIRTABLE_SIGNAL_FIELD_DEFINITIONS.signalCategory.allowedValues)
      ? {
          [getAirtableFieldLabel("signalCategory")]: serializeSelect(
            input.signalCategory,
            AIRTABLE_SIGNAL_FIELD_DEFINITIONS.signalCategory.allowedValues,
          ),
        }
      : {}),
    ...(serializeSeverityScore(input.severityScore)
      ? { [getAirtableFieldLabel("severityScore")]: serializeSeverityScore(input.severityScore) }
      : {}),
    ...(serializeText(input.hookTemplateUsed)
      ? { [getAirtableFieldLabel("hookTemplateUsed")]: serializeText(input.hookTemplateUsed) }
      : {}),
    ...(serializeText(input.ingestionSource)
      ? { [getAirtableFieldLabel("ingestionSource")]: serializeText(input.ingestionSource) }
      : {}),
    ...(serializeText(input.ingestionMethod)
      ? { [getAirtableFieldLabel("ingestionMethod")]: serializeText(input.ingestionMethod) }
      : {}),
    ...(serializeSelect(
      input.keepRejectRecommendation,
      AIRTABLE_SIGNAL_FIELD_DEFINITIONS.keepRejectRecommendation.allowedValues,
    )
      ? {
          [getAirtableFieldLabel("keepRejectRecommendation")]: serializeSelect(
            input.keepRejectRecommendation,
            AIRTABLE_SIGNAL_FIELD_DEFINITIONS.keepRejectRecommendation.allowedValues,
          ),
        }
      : {}),
    ...(serializeText(input.whySelected)
      ? { [getAirtableFieldLabel("whySelected")]: serializeText(input.whySelected) }
      : {}),
    ...(serializeSelect(input.reviewPriority, AIRTABLE_SIGNAL_FIELD_DEFINITIONS.reviewPriority.allowedValues)
      ? {
          [getAirtableFieldLabel("reviewPriority")]: serializeSelect(
            input.reviewPriority,
            AIRTABLE_SIGNAL_FIELD_DEFINITIONS.reviewPriority.allowedValues,
          ),
        }
      : {}),
    ...(serializeText(input.campaignId) ? { [getAirtableFieldLabel("campaignId")]: serializeText(input.campaignId) } : {}),
    ...(serializeText(input.pillarId) ? { [getAirtableFieldLabel("pillarId")]: serializeText(input.pillarId) } : {}),
    ...(serializeText(input.audienceSegmentId)
      ? { [getAirtableFieldLabel("audienceSegmentId")]: serializeText(input.audienceSegmentId) }
      : {}),
    ...(serializeSelect(input.funnelStage, AIRTABLE_SIGNAL_FIELD_DEFINITIONS.funnelStage.allowedValues)
      ? {
          [getAirtableFieldLabel("funnelStage")]: serializeSelect(
            input.funnelStage,
            AIRTABLE_SIGNAL_FIELD_DEFINITIONS.funnelStage.allowedValues,
          ),
        }
      : {}),
    ...(serializeSelect(input.ctaGoal, AIRTABLE_SIGNAL_FIELD_DEFINITIONS.ctaGoal.allowedValues)
      ? {
          [getAirtableFieldLabel("ctaGoal")]: serializeSelect(
            input.ctaGoal,
            AIRTABLE_SIGNAL_FIELD_DEFINITIONS.ctaGoal.allowedValues,
          ),
        }
      : {}),
    [getAirtableFieldLabel("posted")]: false,
    [getAirtableFieldLabel("autoGenerated")]: serializeCheckbox(input.autoGenerated) ?? false,
    [getAirtableFieldLabel("needsHumanReview")]: serializeCheckbox(input.needsHumanReview) ?? false,
    [getAirtableFieldLabel("repurposeLater")]: false,
  };
}

function escapeAirtableFormulaValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function deriveDisplayEngagementScore(signal: SignalRecord): number | null {
  if (signal.engagementScore !== null && signal.engagementScore !== undefined) {
    return signal.engagementScore;
  }

  const likes = signal.likesOrReactions ?? 0;
  const comments = signal.comments ?? 0;
  const shares = signal.sharesOrReposts ?? 0;
  const saves = signal.saves ?? 0;

  const score = saves * 4 + shares * 3 + comments * 2 + likes;
  return score > 0 ? score : null;
}

export function getSafeAirtableErrorMessage(error: unknown): string {
  if (error instanceof AirtableClientError) {
    if (error.code === "mapping_error") {
      return "Airtable field mapping rejected the request payload.";
    }

    if (error.status === 401 || error.status === 403) {
      return "Airtable credentials were rejected. Check the PAT permissions.";
    }

    if (error.status === 404) {
      return "The Airtable base or table could not be reached.";
    }

    return `Airtable request failed (${error.status}).`;
  }

  return "Airtable request failed.";
}

export async function listSignals({
  limit = 50,
  status,
}: {
  limit?: number;
  status?: SignalStatus;
} = {}): Promise<SignalRecord[]> {
  const signals: SignalRecord[] = [];
  let offset: string | undefined;

  do {
    const searchParams = new URLSearchParams();
    searchParams.set("pageSize", String(Math.min(limit, 100)));
    searchParams.set("sort[0][field]", getAirtableFieldLabel("createdDate"));
    searchParams.set("sort[0][direction]", "desc");
    if (status) {
      searchParams.set("filterByFormula", `{${getAirtableFieldLabel("status")}}='${escapeAirtableFormulaValue(status)}'`);
    }
    if (offset) {
      searchParams.set("offset", offset);
    }

    const response = await airtableFetch<AirtableListResponse>(buildDataUrl("", searchParams));
    signals.push(...response.records.map(mapRecordFromAirtable));
    offset = response.offset;
  } while (offset && signals.length < limit);

  return signals.slice(0, limit);
}

export async function getSignal(recordId: string): Promise<SignalRecord> {
  const response = await airtableFetch<AirtableRecord<AirtableFields>>(buildDataUrl(`/${recordId}`));
  return mapRecordFromAirtable(response);
}

export async function createSignal(input: SignalCreatePayload): Promise<SignalRecord> {
  const response = await airtableFetch<AirtableRecord<AirtableFields>>(buildDataUrl(), {
    method: "POST",
    body: JSON.stringify({
      fields: mapCreatePayloadToAirtableFields(input),
    }),
  });

  return mapRecordFromAirtable(response);
}

export async function updateSignal(recordId: string, input: UpdateSignalInput): Promise<SignalRecord> {
  const response = await airtableFetch<AirtableRecord<AirtableFields>>(buildDataUrl(`/${recordId}`), {
    method: "PATCH",
    body: JSON.stringify({
      fields: mapUpdateInputToAirtableFields(input),
    }),
  });

  return mapRecordFromAirtable(response);
}

export async function getSignalWithFallback(recordId: string): Promise<SignalLookupResult> {
  const config = getAppConfig();

  if (!config.isAirtableConfigured) {
    return {
      source: "mock",
      signal: getMockSignalById(recordId),
      error: getMockSignalById(recordId) ? undefined : "Signal not found in mock data.",
    };
  }

  try {
    return {
      source: "airtable",
      signal: await getSignal(recordId),
    };
  } catch (error) {
    return {
      source: "airtable",
      signal: null,
      error: getSafeAirtableErrorMessage(error),
    };
  }
}

export async function saveSignalWithFallback(recordId: string, input: UpdateSignalInput): Promise<{
  source: SignalDataSource;
  persisted: boolean;
  signal: SignalRecord | null;
  error?: string;
}> {
  const config = getAppConfig();

  if (!config.isAirtableConfigured) {
    const signal = buildMockUpdatedSignal(recordId, input);
    return {
      source: "mock",
      persisted: false,
      signal,
      error: signal ? undefined : "Signal not found in mock data.",
    };
  }

  try {
    return {
      source: "airtable",
      persisted: true,
      signal: await updateSignal(recordId, input),
    };
  } catch (error) {
    return {
      source: "airtable",
      persisted: false,
      signal: null,
      error: getSafeAirtableErrorMessage(error),
    };
  }
}

export async function listSignalsWithFallback({
  limit = 50,
  status,
}: {
  limit?: number;
  status?: SignalStatus;
} = {}): Promise<SignalCollectionResult> {
  const config = getAppConfig();

  if (!config.isAirtableConfigured) {
    const signals = status ? mockSignalRecords.filter((signal) => signal.status === status) : mockSignalRecords;
    return {
      source: "mock",
      signals: signals.slice(0, limit),
      message: "Mock mode active because Airtable environment variables are missing.",
    };
  }

  try {
    const signals = await listSignals({ limit, status });
    return {
      source: "airtable",
      signals,
      message: signals.length === 0 ? "Airtable is connected. The table is currently empty." : "Airtable is connected.",
    };
  } catch (error) {
    return {
      source: "airtable",
      signals: [],
      error: `${getSafeAirtableErrorMessage(error)} Check /api/signals/health for diagnostics.`,
    };
  }
}

export async function getAirtableDiagnostics(): Promise<AirtableDiagnostics> {
  const config = getAppConfig();

  if (!config.isAirtableConfigured) {
    return {
      configured: false,
      apiReachable: false,
      tableReachable: false,
      schemaAligned: false,
      mappingSucceeded: false,
      mode: "mock",
      missingFields: [],
      message: "Airtable is not configured. Mock mode is active.",
    };
  }

  try {
    const metaTarget = buildMetaUrl();
    const metadata = await airtableFetch<AirtableTableMetadataResponse>({
      url: metaTarget.url,
      pat: metaTarget.pat,
    });

    const table = metadata.tables?.find((item) => item.name === metaTarget.tableName);
    if (!table) {
      return {
        configured: true,
        apiReachable: true,
        tableReachable: false,
        schemaAligned: false,
        mappingSucceeded: false,
        mode: "airtable",
        missingFields: AIRTABLE_EXPECTED_FIELD_LABELS,
        message: "Airtable API is reachable, but the configured table name was not found.",
      };
    }

    const actualFields = new Set(table.fields.map((field) => field.name));
    const missingFields = AIRTABLE_EXPECTED_FIELD_LABELS.filter((field) => !actualFields.has(field));

    try {
      await listSignals({ limit: 1 });
      return {
        configured: true,
        apiReachable: true,
        tableReachable: true,
        schemaAligned: missingFields.length === 0,
        mappingSucceeded: true,
        mode: "airtable",
        missingFields,
        message:
          missingFields.length === 0
            ? "Airtable is configured, reachable, and field mapping succeeded."
            : "Airtable is reachable, but the live table is missing one or more expected fields.",
      };
    } catch (error) {
      return {
        configured: true,
        apiReachable: true,
        tableReachable: true,
        schemaAligned: missingFields.length === 0,
        mappingSucceeded: false,
        mode: "airtable",
        missingFields,
        message: `${getSafeAirtableErrorMessage(error)} Mapping the sample response did not complete cleanly.`,
      };
    }
  } catch (error) {
    return {
      configured: true,
      apiReachable: false,
      tableReachable: false,
      schemaAligned: false,
      mappingSucceeded: false,
      mode: "airtable",
      missingFields: [],
      message: getSafeAirtableErrorMessage(error),
    };
  }
}
