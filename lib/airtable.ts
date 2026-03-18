import { getAppConfig } from "@/lib/config";
import { mockSignalRecords } from "@/lib/mock-data";
import type { AirtableErrorResponse, AirtableFields, AirtableListResponse, AirtableRecord } from "@/types/airtable";
import type { CreateSignalInput, SignalDataSource, SignalRecord, UpdateSignalInput } from "@/types/signal";

type SignalFieldKey = Exclude<keyof SignalRecord, "recordId">;

const AIRTABLE_SIGNAL_FIELD_MAP: Record<SignalFieldKey, string> = {
  createdDate: "Created Date",
  createdBy: "Created By",
  status: "Status",
  reviewNotes: "Review Notes",
  reuseFlag: "Reuse Flag",
  scheduledDate: "Scheduled Date",
  postedDate: "Posted Date",
  sourceUrl: "Source URL",
  sourceTitle: "Source Title",
  sourceType: "Source Type",
  sourcePublisher: "Source Publisher",
  sourceDate: "Source Date",
  rawExcerpt: "Raw Excerpt",
  manualSummary: "Manual Summary",
  signalCategory: "Signal Category",
  severityScore: "Severity Score",
  signalSubtype: "Signal Subtype",
  emotionalPattern: "Emotional Pattern",
  teacherPainPoint: "Teacher Pain Point",
  relevanceToZazaDraft: "Relevance To Zaza Draft",
  riskToTeacher: "Risk To Teacher",
  interpretationNotes: "Interpretation Notes",
  hookTemplateUsed: "Hook Template Used",
  contentAngle: "Content Angle",
  platformPriority: "Platform Priority",
  suggestedFormatPriority: "Suggested Format Priority",
  xDraft: "X Draft",
  linkedInDraft: "LinkedIn Draft",
  redditDraft: "Reddit Draft",
  imagePrompt: "Image Prompt",
  videoScript: "Video Script",
  ctaOrClosingLine: "CTA Or Closing Line",
  hashtagsOrKeywords: "Hashtags Or Keywords",
  posted: "Posted",
  platformPostedTo: "Platform Posted To",
  finalCaptionUsed: "Final Caption Used",
  assetLink: "Asset Link",
  postUrl: "Post URL",
  platformPerformedBest: "Platform Performed Best",
  likesOrReactions: "Likes Or Reactions",
  comments: "Comments",
  sharesOrReposts: "Shares Or Reposts",
  saves: "Saves",
  clicks: "Clicks",
  engagementScore: "Engagement Score",
  outcomeQuality: "Outcome Quality",
  whyItPerformedOrDidnt: "Why It Performed Or Didnt",
  repeatablePattern: "Repeatable Pattern",
  bestHookSignalCombination: "Best Hook Signal Combination",
  evergreenPotential: "Evergreen Potential",
  repurposeLater: "Repurpose Later",
  repurposeIdeas: "Repurpose Ideas",
  teacherVoiceSource: "Teacher Voice Source",
  anonymisedUserPattern: "Anonymised User Pattern",
  relatedZazaFrameworkTag: "Related Zaza Framework Tag",
  generationModelVersion: "Generation Model Version",
  promptVersion: "Prompt Version",
};

const signalFieldKeys = Object.keys(AIRTABLE_SIGNAL_FIELD_MAP) as SignalFieldKey[];

class AirtableClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AirtableClientError";
  }
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getBoolean(value: unknown): boolean {
  return value === true;
}

function ensureAirtableConfig(): {
  airtablePat: string;
  airtableBaseId: string;
  airtableTableName: string;
} {
  const config = getAppConfig();
  if (!config.isAirtableConfigured || !config.airtablePat || !config.airtableBaseId || !config.airtableTableName) {
    throw new AirtableClientError("Airtable is not fully configured.", 500);
  }

  return {
    airtablePat: config.airtablePat,
    airtableBaseId: config.airtableBaseId,
    airtableTableName: config.airtableTableName,
  };
}

function getAirtableUrl(path = "", searchParams?: URLSearchParams) {
  const config = ensureAirtableConfig();
  const baseUrl = new URL(
    `https://api.airtable.com/v0/${config.airtableBaseId}/${encodeURIComponent(config.airtableTableName)}${path}`,
  );

  if (searchParams) {
    baseUrl.search = searchParams.toString();
  }

  return {
    url: baseUrl.toString(),
    token: config.airtablePat,
  };
}

async function airtableRequest<TResponse>(path = "", init?: RequestInit, searchParams?: URLSearchParams): Promise<TResponse> {
  const { url, token } = getAirtableUrl(path, searchParams);

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
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

function mapFromAirtable(record: AirtableRecord<AirtableFields>): SignalRecord {
  const fields = record.fields;

  return {
    recordId: record.id,
    createdDate: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.createdDate]) ?? record.createdTime,
    createdBy: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.createdBy]),
    status: (getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.status]) as SignalRecord["status"]) ?? "New",
    reviewNotes: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.reviewNotes]),
    reuseFlag: getBoolean(fields[AIRTABLE_SIGNAL_FIELD_MAP.reuseFlag]),
    scheduledDate: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.scheduledDate]),
    postedDate: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.postedDate]),
    sourceUrl: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.sourceUrl]),
    sourceTitle: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.sourceTitle]) ?? "Untitled Signal",
    sourceType: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.sourceType]),
    sourcePublisher: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.sourcePublisher]),
    sourceDate: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.sourceDate]),
    rawExcerpt: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.rawExcerpt]),
    manualSummary: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.manualSummary]),
    signalCategory: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.signalCategory]) as SignalRecord["signalCategory"],
    severityScore: getNumber(fields[AIRTABLE_SIGNAL_FIELD_MAP.severityScore]) as SignalRecord["severityScore"],
    signalSubtype: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.signalSubtype]),
    emotionalPattern: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.emotionalPattern]),
    teacherPainPoint: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.teacherPainPoint]),
    relevanceToZazaDraft: getString(
      fields[AIRTABLE_SIGNAL_FIELD_MAP.relevanceToZazaDraft],
    ) as SignalRecord["relevanceToZazaDraft"],
    riskToTeacher: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.riskToTeacher]),
    interpretationNotes: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.interpretationNotes]),
    hookTemplateUsed: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.hookTemplateUsed]),
    contentAngle: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.contentAngle]),
    platformPriority: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.platformPriority]) as SignalRecord["platformPriority"],
    suggestedFormatPriority: getString(
      fields[AIRTABLE_SIGNAL_FIELD_MAP.suggestedFormatPriority],
    ) as SignalRecord["suggestedFormatPriority"],
    xDraft: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.xDraft]),
    linkedInDraft: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.linkedInDraft]),
    redditDraft: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.redditDraft]),
    imagePrompt: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.imagePrompt]),
    videoScript: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.videoScript]),
    ctaOrClosingLine: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.ctaOrClosingLine]),
    hashtagsOrKeywords: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.hashtagsOrKeywords]),
    posted: getBoolean(fields[AIRTABLE_SIGNAL_FIELD_MAP.posted]),
    platformPostedTo: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.platformPostedTo]),
    finalCaptionUsed: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.finalCaptionUsed]),
    assetLink: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.assetLink]),
    postUrl: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.postUrl]),
    platformPerformedBest: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.platformPerformedBest]),
    likesOrReactions: getNumber(fields[AIRTABLE_SIGNAL_FIELD_MAP.likesOrReactions]),
    comments: getNumber(fields[AIRTABLE_SIGNAL_FIELD_MAP.comments]),
    sharesOrReposts: getNumber(fields[AIRTABLE_SIGNAL_FIELD_MAP.sharesOrReposts]),
    saves: getNumber(fields[AIRTABLE_SIGNAL_FIELD_MAP.saves]),
    clicks: getNumber(fields[AIRTABLE_SIGNAL_FIELD_MAP.clicks]),
    engagementScore: getNumber(fields[AIRTABLE_SIGNAL_FIELD_MAP.engagementScore]),
    outcomeQuality: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.outcomeQuality]) as SignalRecord["outcomeQuality"],
    whyItPerformedOrDidnt: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.whyItPerformedOrDidnt]),
    repeatablePattern: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.repeatablePattern]),
    bestHookSignalCombination: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.bestHookSignalCombination]),
    evergreenPotential:
      fields[AIRTABLE_SIGNAL_FIELD_MAP.evergreenPotential] === null
        ? null
        : getBoolean(fields[AIRTABLE_SIGNAL_FIELD_MAP.evergreenPotential]),
    repurposeLater: getBoolean(fields[AIRTABLE_SIGNAL_FIELD_MAP.repurposeLater]),
    repurposeIdeas: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.repurposeIdeas]),
    teacherVoiceSource: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.teacherVoiceSource]) as SignalRecord["teacherVoiceSource"],
    anonymisedUserPattern: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.anonymisedUserPattern]),
    relatedZazaFrameworkTag: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.relatedZazaFrameworkTag]),
    generationModelVersion: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.generationModelVersion]),
    promptVersion: getString(fields[AIRTABLE_SIGNAL_FIELD_MAP.promptVersion]),
  };
}

function mapToAirtable(input: Partial<Omit<SignalRecord, "recordId">>): AirtableFields {
  const fields: AirtableFields = {};

  for (const key of signalFieldKeys) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }

    fields[AIRTABLE_SIGNAL_FIELD_MAP[key]] = value as AirtableFields[string];
  }

  return fields;
}

export async function listSignals(limit = 50): Promise<SignalRecord[]> {
  const signals: SignalRecord[] = [];
  let offset: string | undefined;

  do {
    const searchParams = new URLSearchParams();
    searchParams.set("pageSize", String(Math.min(limit, 100)));
    searchParams.set("sort[0][field]", AIRTABLE_SIGNAL_FIELD_MAP.createdDate);
    searchParams.set("sort[0][direction]", "desc");
    if (offset) {
      searchParams.set("offset", offset);
    }

    const response = await airtableRequest<AirtableListResponse>("", undefined, searchParams);
    signals.push(...response.records.map(mapFromAirtable));
    offset = response.offset;
  } while (offset && signals.length < limit);

  return signals.slice(0, limit);
}

export async function getSignal(recordId: string): Promise<SignalRecord> {
  const response = await airtableRequest<AirtableRecord<AirtableFields>>(`/${recordId}`);
  return mapFromAirtable(response);
}

export async function createSignal(input: CreateSignalInput): Promise<SignalRecord> {
  const response = await airtableRequest<AirtableRecord<AirtableFields>>("", {
    method: "POST",
    body: JSON.stringify({
      fields: mapToAirtable({
        createdDate: input.createdDate ?? new Date().toISOString(),
        status: input.status ?? "New",
        posted: input.posted ?? false,
        repurposeLater: input.repurposeLater ?? false,
        reuseFlag: input.reuseFlag ?? false,
        ...input,
      }),
    }),
  });

  return mapFromAirtable(response);
}

export async function updateSignal(recordId: string, input: UpdateSignalInput): Promise<SignalRecord> {
  const response = await airtableRequest<AirtableRecord<AirtableFields>>(`/${recordId}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: mapToAirtable(input),
    }),
  });

  return mapFromAirtable(response);
}

export async function listSignalsWithFallback(): Promise<{
  source: SignalDataSource;
  signals: SignalRecord[];
  error?: string;
}> {
  const config = getAppConfig();

  if (!config.isAirtableConfigured) {
    return {
      source: "mock",
      signals: mockSignalRecords,
    };
  }

  try {
    return {
      source: "airtable",
      signals: await listSignals(),
    };
  } catch (error) {
    return {
      source: "mock",
      signals: mockSignalRecords,
      error: error instanceof Error ? error.message : "Falling back to mock data.",
    };
  }
}
