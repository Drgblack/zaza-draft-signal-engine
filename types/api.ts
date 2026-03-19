import { z } from "zod";

import {
  CTA_GOALS,
  EDITORIAL_MODES,
  FINAL_DRAFT_REVIEW_STATUSES,
  FUNNEL_STAGES,
  GENERATION_SOURCES,
  ASSET_PRIMARY_TYPES,
  HOOK_TEMPLATES,
  INTERPRETATION_CONFIDENCE_LEVELS,
  INTERPRETATION_SOURCES,
  PLATFORM_PRIORITIES,
  RELEVANCE_LEVELS,
  SIGNAL_CATEGORIES,
  SIGNAL_STATUSES,
  SUGGESTED_FORMAT_PRIORITIES,
  type HookTemplate,
  type InterpretationConfidence,
  type InterpretationSource,
  type PlatformPriority,
  type RelevanceToZazaDraft,
  type CtaGoal,
  type FunnelStage,
  type SignalCreatePayload,
  type SignalGenerationInput,
  type SignalGenerationResult,
  type SignalGenerationSavePayload,
  type SignalFinalReviewSavePayload,
  type SignalInterpretationInput,
  type SignalInterpretationSavePayload,
  type SignalScoringResult,
  type SignalScoringSavePayload,
  type SignalWorkflowUpdatePayload,
  type SeverityScore,
  type SignalCategory,
  type SignalDataSource,
  type SignalRecord,
  type SuggestedFormatPriority,
} from "@/types/signal";
import type { IngestionRunSummary, ManagedIngestionSource } from "@/lib/ingestion/types";
import type { AutonomousRunSummary, PipelineRunSummary } from "@/lib/pipeline";
import type { FeedbackCategory, FeedbackValue, SignalFeedback } from "@/lib/feedback-definitions";
import type { PatternFeedbackEntry } from "@/lib/pattern-feedback-definitions";
import type { PlaybookCard } from "@/lib/playbook-card-definitions";
import type { PostingOutcome } from "@/lib/outcome-memory";
import type { PostingLogEntry } from "@/lib/posting-memory";
import type { StrategicOutcome } from "@/lib/strategic-outcome-memory";
import type { PatternSummary, SignalPattern } from "@/lib/pattern-definitions";
import type { PatternBundle } from "@/lib/pattern-bundles";
import type { ScenarioAngleAssessment, ScenarioAngleSuggestion } from "@/lib/scenario-angle";
import type { OperatorTuning } from "@/lib/tuning-definitions";
import type { AudienceSegment, Campaign, CampaignStrategy, ContentPillar } from "@/lib/campaigns";
import type { DuplicateCluster } from "@/lib/duplicate-clusters";
import type { WeeklyPlanAutoDraft } from "@/lib/weekly-plan-autodraft";
import type { WeeklyPlan, WeeklyPlanTemplate } from "@/lib/weekly-plan";
import {
  TUNING_PRESETS,
  operatorTuningSettingsSchema,
} from "@/lib/tuning-definitions";

const optionalNullableString = z.union([z.string(), z.null()]).optional();
const optionalAssetPrimaryTypeSchema = z.enum(ASSET_PRIMARY_TYPES).nullable().optional();
const optionalContentContextSchema = z.object({
  campaignId: optionalNullableString,
  pillarId: optionalNullableString,
  audienceSegmentId: optionalNullableString,
  funnelStage: z.enum(FUNNEL_STAGES).nullable().optional(),
  ctaGoal: z.enum(CTA_GOALS).nullable().optional(),
});

export const createSignalRequestSchema = z
  .object({
    sourceUrl: optionalNullableString,
    sourceTitle: z.string().trim().min(1, "Source title is required."),
    sourceType: optionalNullableString,
    sourcePublisher: optionalNullableString,
    sourceDate: optionalNullableString,
    rawExcerpt: optionalNullableString,
    manualSummary: optionalNullableString,
    signalCategory: z.enum(SIGNAL_CATEGORIES).nullable().optional(),
    severityScore: z.union([z.enum(["1", "2", "3"]), z.number().int().min(1).max(3)]).nullable().optional(),
    hookTemplateUsed: optionalNullableString,
    status: z.enum(SIGNAL_STATUSES).optional(),
  })
  .superRefine((value, context) => {
    if (!normalizeOptionalString(value.rawExcerpt) && !normalizeOptionalString(value.manualSummary)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one of raw excerpt or manual summary.",
        path: ["rawExcerpt"],
      });
    }
  });

export const statusFilterSchema = z.object({
  status: z.enum(SIGNAL_STATUSES).optional(),
});

export const interpretRequestSchema = z.object({
  signalId: z.string().trim().min(1).optional(),
  signal: z
    .object({
      recordId: z.string().trim().min(1).optional(),
      sourceTitle: z.string().trim().min(1, "Source title is required."),
      sourceType: optionalNullableString,
      sourcePublisher: optionalNullableString,
      sourceDate: optionalNullableString,
      sourceUrl: optionalNullableString,
      rawExcerpt: optionalNullableString,
      manualSummary: optionalNullableString,
      scenarioAngle: optionalNullableString,
    })
    .optional(),
}).superRefine((value, context) => {
  if (!value.signalId && !value.signal) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either a signalId or a structured signal payload.",
      path: ["signalId"],
    });
  }
});

export const scenarioAngleSuggestRequestSchema = z
  .object({
    signalId: z.string().trim().min(1).optional(),
    signal: z
      .object({
        recordId: z.string().trim().min(1).optional(),
        sourceTitle: z.string().trim().min(1, "Source title is required."),
        sourceType: optionalNullableString,
        sourcePublisher: optionalNullableString,
        sourceDate: optionalNullableString,
        sourceUrl: optionalNullableString,
        rawExcerpt: optionalNullableString,
        manualSummary: optionalNullableString,
        scenarioAngle: optionalNullableString,
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (!value.signalId && !value.signal) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either a signalId or a structured signal payload.",
        path: ["signalId"],
      });
    }
  });

export const interpretationResultSchema = z.object({
  signalCategory: z.enum(SIGNAL_CATEGORIES),
  severityScore: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  signalSubtype: z.string().trim().min(1),
  emotionalPattern: z.string().trim().min(1),
  teacherPainPoint: z.string().trim().min(1),
  relevanceToZazaDraft: z.enum(RELEVANCE_LEVELS),
  riskToTeacher: z.string().trim().min(1),
  interpretationNotes: z.string().trim().min(1),
  hookTemplateUsed: z.enum(HOOK_TEMPLATES),
  contentAngle: z.string().trim().min(1),
  platformPriority: z.enum(PLATFORM_PRIORITIES),
  suggestedFormatPriority: z.enum(SUGGESTED_FORMAT_PRIORITIES),
  interpretationConfidence: z.enum(INTERPRETATION_CONFIDENCE_LEVELS),
  interpretationSource: z.enum(INTERPRETATION_SOURCES),
  interpretedAt: z.string().trim().min(1),
});

export const saveInterpretationRequestSchema = interpretationResultSchema
  .extend({
    scenarioAngle: optionalNullableString,
    status: z.enum(SIGNAL_STATUSES).optional(),
  })
  .merge(optionalContentContextSchema);

export const generationSignalSchema = z.object({
  recordId: z.string().trim().min(1).optional(),
  sourceTitle: z.string().trim().min(1),
  sourceType: optionalNullableString,
  sourcePublisher: optionalNullableString,
  sourceDate: optionalNullableString,
  sourceUrl: optionalNullableString,
  rawExcerpt: optionalNullableString,
  manualSummary: optionalNullableString,
  scenarioAngle: optionalNullableString,
  signalCategory: z.enum(SIGNAL_CATEGORIES),
  severityScore: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  signalSubtype: z.string().trim().min(1),
  emotionalPattern: z.string().trim().min(1),
  teacherPainPoint: z.string().trim().min(1),
  relevanceToZazaDraft: z.enum(RELEVANCE_LEVELS),
  riskToTeacher: z.string().trim().min(1),
  interpretationNotes: z.string().trim().min(1),
  hookTemplateUsed: z.enum(HOOK_TEMPLATES),
  contentAngle: z.string().trim().min(1),
  platformPriority: z.enum(PLATFORM_PRIORITIES),
  suggestedFormatPriority: z.enum(SUGGESTED_FORMAT_PRIORITIES),
});

export const generateRequestSchema = z
  .object({
    signalId: z.string().trim().min(1).optional(),
    signal: generationSignalSchema.optional(),
    patternId: z.string().trim().min(1).optional(),
    suggestedPatternId: z.string().trim().min(1).optional(),
    editorialMode: z.enum(EDITORIAL_MODES).optional(),
  })
  .superRefine((value, context) => {
    if (!value.signalId && !value.signal) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either a signalId or a generation payload.",
        path: ["signalId"],
      });
    }
  });

export const generationResultSchema = z.object({
  xDraft: z.string().trim().min(1),
  linkedInDraft: z.string().trim().min(1),
  redditDraft: z.string().trim().min(1),
  imagePrompt: z.string().trim().min(1),
  videoScript: z.string().trim().min(1),
  ctaOrClosingLine: z.string().trim().min(1),
  hashtagsOrKeywords: z.string().trim().min(1),
  assetBundleJson: optionalNullableString,
  repurposingBundleJson: optionalNullableString,
  publishPrepBundleJson: optionalNullableString,
  selectedRepurposedOutputIdsJson: optionalNullableString,
  preferredAssetType: optionalAssetPrimaryTypeSchema,
  selectedImageAssetId: optionalNullableString,
  selectedVideoConceptId: optionalNullableString,
  generatedImageUrl: optionalNullableString,
  generationSource: z.enum(GENERATION_SOURCES),
  generationModelVersion: z.string().trim().min(1),
  promptVersion: z.string().trim().min(1),
  generatedAt: z.string().trim().min(1),
});

export const saveGenerationRequestSchema = generationResultSchema
  .extend({
    editorialMode: z.enum(EDITORIAL_MODES),
    status: z.enum(SIGNAL_STATUSES).optional(),
  })
  .merge(optionalContentContextSchema);

export const workflowUpdateRequestSchema = z
  .object({
    status: z.enum(SIGNAL_STATUSES),
    scheduledDate: optionalNullableString,
    postedDate: optionalNullableString,
    platformPostedTo: optionalNullableString,
    postUrl: optionalNullableString,
    finalCaptionUsed: optionalNullableString,
    reviewNotes: optionalNullableString,
  })
  .superRefine((value, context) => {
    const scheduledDate = normalizeOptionalString(value.scheduledDate);
    const postedDate = normalizeOptionalString(value.postedDate);

    if (scheduledDate && Number.isNaN(new Date(scheduledDate).getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scheduled date must be a valid date.",
        path: ["scheduledDate"],
      });
    }

    if (postedDate && Number.isNaN(new Date(postedDate).getTime())) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Posted date must be a valid date.",
        path: ["postedDate"],
      });
    }

    if (value.status === "Scheduled" && !scheduledDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Scheduled records require a scheduled date.",
        path: ["scheduledDate"],
      });
    }
  });

export const finalReviewUpdateRequestSchema = z.object({
  finalXDraft: optionalNullableString,
  finalLinkedInDraft: optionalNullableString,
  finalRedditDraft: optionalNullableString,
  xReviewStatus: z.enum(FINAL_DRAFT_REVIEW_STATUSES).nullable(),
  linkedInReviewStatus: z.enum(FINAL_DRAFT_REVIEW_STATUSES).nullable(),
  redditReviewStatus: z.enum(FINAL_DRAFT_REVIEW_STATUSES).nullable(),
  finalReviewNotes: optionalNullableString,
  assetBundleJson: optionalNullableString,
  repurposingBundleJson: optionalNullableString,
  publishPrepBundleJson: optionalNullableString,
  selectedRepurposedOutputIdsJson: optionalNullableString,
  preferredAssetType: optionalAssetPrimaryTypeSchema,
  selectedImageAssetId: optionalNullableString,
  selectedVideoConceptId: optionalNullableString,
  generatedImageUrl: optionalNullableString,
  evergreenCandidateId: optionalNullableString,
});

export const ingestRequestSchema = z.object({
  sourceIds: z.array(z.string().trim().min(1)).optional(),
});

export const sourceRegistryUpdateRequestSchema = z.object({
  enabled: z.boolean().optional(),
  maxItemsPerRun: z.number().int().min(1).max(100).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  notes: z.string().trim().optional(),
}).refine((value) => Object.values(value).some((entry) => entry !== undefined), {
  message: "Provide at least one source setting to update.",
});

export const scoringResultSchema = z.object({
  signalRelevanceScore: z.number().min(0).max(100),
  signalNoveltyScore: z.number().min(0).max(100),
  signalUrgencyScore: z.number().min(0).max(100),
  brandFitScore: z.number().min(0).max(100),
  sourceTrustScore: z.number().min(0).max(100),
  keepRejectRecommendation: z.enum(["Keep", "Review", "Reject"]),
  whySelected: z.union([z.string().trim().min(1), z.null()]),
  whyRejected: z.union([z.string().trim().min(1), z.null()]),
  needsHumanReview: z.boolean(),
  qualityGateResult: z.enum(["Pass", "Needs Review", "Fail"]),
  reviewPriority: z.enum(["Low", "Medium", "High", "Urgent"]),
  similarityToExistingContent: z.union([z.number().min(0).max(100), z.null()]),
  duplicateClusterId: z.union([z.string().trim().min(1), z.null()]),
  scoringVersion: z.string().trim().min(1),
  scoredAt: z.string().trim().min(1),
});

export const scoreRequestSchema = z
  .object({
    signalId: z.string().trim().min(1).optional(),
    save: z.boolean().optional(),
    batch: z
      .object({
        limit: z.number().int().min(1).max(50).optional(),
        status: z.enum(SIGNAL_STATUSES).optional(),
        onlyMissingScores: z.boolean().optional(),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (!value.signalId && !value.batch) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either a signalId or a batch scoring payload.",
        path: ["signalId"],
      });
    }
  });

export const pipelineRunRequestSchema = z.object({
  ingestFresh: z.boolean().optional(),
  sourceIds: z.array(z.string().trim().min(1)).optional(),
  maxCandidates: z.number().int().min(1).max(30).optional(),
});

export const autonomousRunRequestSchema = z.object({
  ingestFresh: z.boolean().optional(),
  sourceIds: z.array(z.string().trim().min(1)).optional(),
  maxCandidates: z.number().int().min(1).max(30).optional(),
});

export const tuningPresetSchema = z.enum(TUNING_PRESETS);
export const duplicateClusterSimilarityTypeSchema = z.enum(["same_story", "same_angle", "different_angle"]);
export const duplicateClusterConfidenceSchema = z.enum(["high", "moderate", "low"]);
export const duplicateClusterActionSchema = z.enum([
  "confirm_cluster",
  "reject_cluster",
  "suppress_duplicate",
  "restore_duplicate",
  "reopen_cluster",
]);
export const duplicateClusterInputSchema = z.object({
  clusterId: z.string().trim().min(1),
  signalIds: z.array(z.string().trim().min(1)).min(2).max(12),
  canonicalSignalId: z.string().trim().min(1),
  similarityType: duplicateClusterSimilarityTypeSchema,
  clusterConfidence: duplicateClusterConfidenceSchema,
  clusterReason: z.string().trim().min(1),
});
export const duplicateClusterActionRequestSchema = z.object({
  action: duplicateClusterActionSchema,
  cluster: duplicateClusterInputSchema,
  targetSignalId: optionalNullableString,
});

export const campaignStatusSchema = z.enum(["active", "inactive"]);

export const createCampaignRequestSchema = z.object({
  name: z.string().trim().min(1, "Campaign name is required."),
  description: z.string().trim().min(1, "Campaign description is required."),
  status: campaignStatusSchema,
  goal: optionalNullableString,
  startDate: optionalNullableString,
  endDate: optionalNullableString,
});

export const updateCampaignRequestSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    status: campaignStatusSchema.optional(),
    goal: optionalNullableString,
    startDate: optionalNullableString,
    endDate: optionalNullableString,
  })
  .refine((value) => Boolean(value.id), {
    message: "Campaign id is required.",
  });

export const createContentPillarRequestSchema = z.object({
  name: z.string().trim().min(1, "Pillar name is required."),
  description: z.string().trim().min(1, "Pillar description is required."),
});

export const updateContentPillarRequestSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
});

export const createAudienceSegmentRequestSchema = z.object({
  name: z.string().trim().min(1, "Audience name is required."),
  description: z.string().trim().min(1, "Audience description is required."),
});

export const updateAudienceSegmentRequestSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
});

export const campaignManagementRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("campaign"),
    action: z.enum(["create", "update"]),
    data: z.union([createCampaignRequestSchema, updateCampaignRequestSchema]),
  }),
  z.object({
    kind: z.literal("pillar"),
    action: z.enum(["create", "update"]),
    data: z.union([createContentPillarRequestSchema, updateContentPillarRequestSchema]),
  }),
  z.object({
    kind: z.literal("audience"),
    action: z.enum(["create", "update"]),
    data: z.union([createAudienceSegmentRequestSchema, updateAudienceSegmentRequestSchema]),
  }),
]);

export const tuningUpdateRequestSchema = z
  .object({
    preset: tuningPresetSchema.optional(),
    settings: operatorTuningSettingsSchema.partial().optional(),
  })
  .refine((value) => value.preset !== undefined || value.settings !== undefined, {
    message: "Provide either a preset or one or more setting updates.",
  });

export interface SignalsApiResponse {
  success: boolean;
  source: SignalDataSource;
  signals: SignalRecord[];
  message?: string;
  error?: string;
}

export interface CreateSignalApiResponse {
  success: boolean;
  source: SignalDataSource;
  persisted: boolean;
  signal: SignalRecord;
  message: string;
  errorCode?: "validation_error" | "airtable_error" | "unknown_error";
}

export interface AirtableHealthResponse {
  success: boolean;
  diagnostics: {
    configured: boolean;
    apiReachable: boolean;
    tableReachable: boolean;
    schemaAligned: boolean;
    mappingSucceeded: boolean;
    mode: SignalDataSource;
    missingFields: string[];
    message: string;
  };
}

export interface InterpretationResponse {
  success: true;
  signal: SignalInterpretationInput;
  interpretation: {
    signalCategory: SignalCategory;
    severityScore: SeverityScore;
    signalSubtype: string;
    emotionalPattern: string;
    teacherPainPoint: string;
    relevanceToZazaDraft: RelevanceToZazaDraft;
    riskToTeacher: string;
    hookTemplateUsed: HookTemplate;
    contentAngle: string;
    interpretationConfidence: InterpretationConfidence;
    interpretationSource: InterpretationSource;
    interpretedAt: string;
    interpretationNotes: string;
    platformPriority: PlatformPriority;
    suggestedFormatPriority: SuggestedFormatPriority;
  };
}

export interface SaveInterpretationResponse {
  success: boolean;
  persisted: boolean;
  source: SignalDataSource;
  signal: SignalRecord;
  message: string;
  error?: string;
}

export interface ScenarioAngleSuggestResponse {
  success: boolean;
  signal?: SignalInterpretationInput;
  assessment?: ScenarioAngleAssessment;
  suggestions?: ScenarioAngleSuggestion[];
  source?: "anthropic" | "openai" | "mock";
  promptVersion?: string;
  message?: string;
  error?: string;
}

export interface GenerationResponse {
  success: true;
  signal: SignalGenerationInput;
  outputs: SignalGenerationResult;
  appliedPattern?: PatternSummary | null;
  editorialMode: SignalRecord["editorialMode"];
  message?: string;
  usedFallback?: boolean;
}

export interface SaveGenerationResponse {
  success: boolean;
  persisted: boolean;
  source: SignalDataSource;
  signal: SignalRecord;
  message: string;
  error?: string;
}

export interface SaveWorkflowResponse {
  success: boolean;
  persisted: boolean;
  source: SignalDataSource;
  signal: SignalRecord | null;
  message: string;
  error?: string;
}

export interface SaveFinalReviewResponse {
  success: boolean;
  persisted: boolean;
  source: SignalDataSource;
  signal: SignalRecord | null;
  message: string;
  error?: string;
}

export interface SaveFeedbackResponse {
  success: boolean;
  persisted: boolean;
  source: SignalDataSource;
  feedback: SignalFeedback | null;
  message: string;
  error?: string;
}

export interface PostingLogResponse {
  success: boolean;
  persisted: boolean;
  entry: PostingLogEntry | null;
  entries: PostingLogEntry[];
  signal: SignalRecord | null;
  message: string;
  error?: string;
}

export interface PostingOutcomeResponse {
  success: boolean;
  persisted: boolean;
  outcome: PostingOutcome | null;
  previousOutcome: PostingOutcome | null;
  message: string;
  error?: string;
}

export interface StrategicOutcomeResponse {
  success: boolean;
  persisted: boolean;
  outcome: StrategicOutcome | null;
  previousOutcome: StrategicOutcome | null;
  message: string;
  error?: string;
}

export interface FeedbackSummaryResponse {
  success: boolean;
  source: SignalDataSource;
  categories: Array<{
    category: FeedbackCategory;
    value: FeedbackValue;
    count: number;
  }>;
}

export interface PatternResponse {
  success: boolean;
  persisted: boolean;
  pattern: SignalPattern | null;
  message: string;
  error?: string;
}

export interface PatternListResponse {
  success: boolean;
  patterns: SignalPattern[];
  error?: string;
}

export interface PatternBundleResponse {
  success: boolean;
  persisted: boolean;
  bundle: PatternBundle | null;
  message: string;
  error?: string;
}

export interface PatternBundleListResponse {
  success: boolean;
  bundles: PatternBundle[];
  error?: string;
}

export interface PatternFeedbackResponse {
  success: boolean;
  persisted: boolean;
  feedback: PatternFeedbackEntry | null;
  message: string;
  error?: string;
}

export interface PlaybookCardResponse {
  success: boolean;
  persisted: boolean;
  card: PlaybookCard | null;
  message: string;
  error?: string;
}

export interface PlaybookCardListResponse {
  success: boolean;
  cards: PlaybookCard[];
  error?: string;
}

export interface IngestApiResponse {
  success: boolean;
  mode: SignalDataSource;
  result?: IngestionRunSummary;
  error?: string;
}

export interface SourceRegistryResponse {
  success: boolean;
  source: SignalDataSource;
  sources?: ManagedIngestionSource[];
  message?: string;
  error?: string;
}

export interface UpdateSourceRegistryResponse {
  success: boolean;
  source: SignalDataSource;
  sourceRecord?: ManagedIngestionSource;
  message?: string;
  error?: string;
}

export interface ScoreResponse {
  success: boolean;
  persisted: boolean;
  source: SignalDataSource;
  signal?: SignalRecord;
  scoring?: SignalScoringResult;
  message: string;
  error?: string;
}

export interface ScoreBatchResponse {
  success: boolean;
  persisted: boolean;
  source: SignalDataSource;
  processed: number;
  saved: number;
  results: Array<{
    recordId: string;
    sourceTitle: string;
    recommendation: SignalScoringResult["keepRejectRecommendation"];
    reviewPriority: SignalScoringResult["reviewPriority"];
    persisted: boolean;
    error?: string;
  }>;
  message: string;
  error?: string;
}

export interface PipelineRunResponse {
  success: boolean;
  source: SignalDataSource;
  result?: PipelineRunSummary;
  error?: string;
}

export interface AutonomousRunResponse {
  success: boolean;
  source: SignalDataSource;
  result?: AutonomousRunSummary;
  error?: string;
}

export interface TuningResponse {
  success: boolean;
  tuning: OperatorTuning | null;
  message?: string;
  error?: string;
}

export interface CampaignStrategyResponse {
  success: boolean;
  strategy: CampaignStrategy | null;
  message?: string;
  error?: string;
}

export interface CampaignManagementResponse {
  success: boolean;
  strategy: CampaignStrategy | null;
  campaign?: Campaign | null;
  pillar?: ContentPillar | null;
  audienceSegment?: AudienceSegment | null;
  message?: string;
  error?: string;
}

export interface WeeklyPlanResponse {
  success: boolean;
  plan: WeeklyPlan | null;
  templates: WeeklyPlanTemplate[];
  recentPlans?: WeeklyPlan[];
  draft?: WeeklyPlanAutoDraft | null;
  message?: string;
  error?: string;
}

export interface DuplicateClusterActionResponse {
  success: boolean;
  persisted: boolean;
  source: SignalDataSource;
  cluster: DuplicateCluster | null;
  message: string;
  error?: string;
}

export function normalizeSeverityScore(value: unknown): SeverityScore | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numericValue = typeof value === "string" ? Number(value) : value;
  if (numericValue === 1 || numericValue === 2 || numericValue === 3) {
    return numericValue;
  }

  return null;
}

export function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toCreateSignalPayload(value: z.infer<typeof createSignalRequestSchema>): SignalCreatePayload {
  return {
    sourceUrl: normalizeOptionalString(value.sourceUrl),
    sourceTitle: value.sourceTitle.trim(),
    sourceType: normalizeOptionalString(value.sourceType),
    sourcePublisher: normalizeOptionalString(value.sourcePublisher),
    sourceDate: normalizeOptionalString(value.sourceDate),
    rawExcerpt: normalizeOptionalString(value.rawExcerpt),
    manualSummary: normalizeOptionalString(value.manualSummary),
    signalCategory: value.signalCategory ?? null,
    severityScore: normalizeSeverityScore(value.severityScore),
    hookTemplateUsed: normalizeOptionalString(value.hookTemplateUsed),
    status: value.status ?? "New",
  };
}

export function toInterpretationInput(
  value: NonNullable<z.infer<typeof interpretRequestSchema>["signal"]>,
): SignalInterpretationInput {
  return {
    recordId: value.recordId,
    sourceTitle: value.sourceTitle.trim(),
    sourceType: normalizeOptionalString(value.sourceType),
    sourcePublisher: normalizeOptionalString(value.sourcePublisher),
    sourceDate: normalizeOptionalString(value.sourceDate),
    sourceUrl: normalizeOptionalString(value.sourceUrl),
    rawExcerpt: normalizeOptionalString(value.rawExcerpt),
    manualSummary: normalizeOptionalString(value.manualSummary),
    scenarioAngle: normalizeOptionalString(value.scenarioAngle),
  };
}

export function toInterpretationSavePayload(
  value: z.infer<typeof saveInterpretationRequestSchema>,
): SignalInterpretationSavePayload {
  return {
    signalCategory: value.signalCategory,
    severityScore: value.severityScore,
    signalSubtype: value.signalSubtype.trim(),
    emotionalPattern: value.emotionalPattern.trim(),
    teacherPainPoint: value.teacherPainPoint.trim(),
    relevanceToZazaDraft: value.relevanceToZazaDraft,
    riskToTeacher: value.riskToTeacher.trim(),
    interpretationNotes: value.interpretationNotes.trim(),
    hookTemplateUsed: value.hookTemplateUsed,
    contentAngle: value.contentAngle.trim(),
    platformPriority: value.platformPriority,
    suggestedFormatPriority: value.suggestedFormatPriority,
    interpretationConfidence: value.interpretationConfidence,
    interpretationSource: value.interpretationSource,
    interpretedAt: value.interpretedAt,
    scenarioAngle: normalizeOptionalString(value.scenarioAngle),
    campaignId: normalizeOptionalString(value.campaignId),
    pillarId: normalizeOptionalString(value.pillarId),
    audienceSegmentId: normalizeOptionalString(value.audienceSegmentId),
    funnelStage: (value.funnelStage ?? null) as FunnelStage | null,
    ctaGoal: (value.ctaGoal ?? null) as CtaGoal | null,
    status: value.status,
  };
}

export function toGenerationInput(
  value: z.infer<typeof generationSignalSchema>,
): SignalGenerationInput {
  return {
    recordId: value.recordId,
    sourceTitle: value.sourceTitle.trim(),
    sourceType: normalizeOptionalString(value.sourceType),
    sourcePublisher: normalizeOptionalString(value.sourcePublisher),
    sourceDate: normalizeOptionalString(value.sourceDate),
    sourceUrl: normalizeOptionalString(value.sourceUrl),
    rawExcerpt: normalizeOptionalString(value.rawExcerpt),
    manualSummary: normalizeOptionalString(value.manualSummary),
    scenarioAngle: normalizeOptionalString(value.scenarioAngle),
    signalCategory: value.signalCategory,
    severityScore: value.severityScore,
    signalSubtype: value.signalSubtype.trim(),
    emotionalPattern: value.emotionalPattern.trim(),
    teacherPainPoint: value.teacherPainPoint.trim(),
    relevanceToZazaDraft: value.relevanceToZazaDraft,
    riskToTeacher: value.riskToTeacher.trim(),
    interpretationNotes: value.interpretationNotes.trim(),
    hookTemplateUsed: value.hookTemplateUsed,
    contentAngle: value.contentAngle.trim(),
    platformPriority: value.platformPriority,
    suggestedFormatPriority: value.suggestedFormatPriority,
  };
}

export function toGenerationSavePayload(
  value: z.infer<typeof saveGenerationRequestSchema>,
): SignalGenerationSavePayload {
  return {
    xDraft: value.xDraft.trim(),
    linkedInDraft: value.linkedInDraft.trim(),
    redditDraft: value.redditDraft.trim(),
    imagePrompt: value.imagePrompt.trim(),
    videoScript: value.videoScript.trim(),
    ctaOrClosingLine: value.ctaOrClosingLine.trim(),
    hashtagsOrKeywords: value.hashtagsOrKeywords.trim(),
    assetBundleJson: normalizeOptionalString(value.assetBundleJson),
    repurposingBundleJson: normalizeOptionalString(value.repurposingBundleJson),
    publishPrepBundleJson: normalizeOptionalString(value.publishPrepBundleJson),
    selectedRepurposedOutputIdsJson: normalizeOptionalString(value.selectedRepurposedOutputIdsJson),
    preferredAssetType: value.preferredAssetType ?? null,
    selectedImageAssetId: normalizeOptionalString(value.selectedImageAssetId),
    selectedVideoConceptId: normalizeOptionalString(value.selectedVideoConceptId),
    generatedImageUrl: normalizeOptionalString(value.generatedImageUrl),
    generationSource: value.generationSource,
    generationModelVersion: value.generationModelVersion.trim(),
    promptVersion: value.promptVersion.trim(),
    generatedAt: value.generatedAt,
    editorialMode: value.editorialMode,
    campaignId: normalizeOptionalString(value.campaignId),
    pillarId: normalizeOptionalString(value.pillarId),
    audienceSegmentId: normalizeOptionalString(value.audienceSegmentId),
    funnelStage: (value.funnelStage ?? null) as FunnelStage | null,
    ctaGoal: (value.ctaGoal ?? null) as CtaGoal | null,
    status: value.status,
  };
}

export function toScoringSavePayload(
  value: z.infer<typeof scoringResultSchema>,
): SignalScoringSavePayload {
  return {
    signalRelevanceScore: Math.round(value.signalRelevanceScore),
    signalNoveltyScore: Math.round(value.signalNoveltyScore),
    signalUrgencyScore: Math.round(value.signalUrgencyScore),
    brandFitScore: Math.round(value.brandFitScore),
    sourceTrustScore: Math.round(value.sourceTrustScore),
    keepRejectRecommendation: value.keepRejectRecommendation,
    whySelected: value.whySelected,
    whyRejected: value.whyRejected,
    needsHumanReview: value.needsHumanReview,
    qualityGateResult: value.qualityGateResult,
    reviewPriority: value.reviewPriority,
    similarityToExistingContent:
      value.similarityToExistingContent === null ? null : Math.round(value.similarityToExistingContent),
    duplicateClusterId: value.duplicateClusterId,
    scoringVersion: value.scoringVersion.trim(),
    scoredAt: value.scoredAt,
  };
}

function normalizeDateTimeString(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function toWorkflowSavePayload(
  value: z.infer<typeof workflowUpdateRequestSchema>,
): SignalWorkflowUpdatePayload {
  return {
    status: value.status,
    scheduledDate: normalizeDateTimeString(value.scheduledDate),
    postedDate: normalizeDateTimeString(value.postedDate),
    platformPostedTo: normalizeOptionalString(value.platformPostedTo),
    postUrl: normalizeOptionalString(value.postUrl),
    finalCaptionUsed: normalizeOptionalString(value.finalCaptionUsed),
    reviewNotes: normalizeOptionalString(value.reviewNotes),
  };
}

export function toFinalReviewSavePayload(
  value: z.infer<typeof finalReviewUpdateRequestSchema>,
): SignalFinalReviewSavePayload {
  return {
    finalXDraft: normalizeOptionalString(value.finalXDraft),
    finalLinkedInDraft: normalizeOptionalString(value.finalLinkedInDraft),
    finalRedditDraft: normalizeOptionalString(value.finalRedditDraft),
    xReviewStatus: value.xReviewStatus,
    linkedInReviewStatus: value.linkedInReviewStatus,
    redditReviewStatus: value.redditReviewStatus,
    finalReviewNotes: normalizeOptionalString(value.finalReviewNotes),
    assetBundleJson: normalizeOptionalString(value.assetBundleJson),
    repurposingBundleJson: normalizeOptionalString(value.repurposingBundleJson),
    publishPrepBundleJson: normalizeOptionalString(value.publishPrepBundleJson),
    selectedRepurposedOutputIdsJson: normalizeOptionalString(value.selectedRepurposedOutputIdsJson),
    preferredAssetType: value.preferredAssetType ?? null,
    selectedImageAssetId: normalizeOptionalString(value.selectedImageAssetId),
    selectedVideoConceptId: normalizeOptionalString(value.selectedVideoConceptId),
    generatedImageUrl: normalizeOptionalString(value.generatedImageUrl),
    evergreenCandidateId: normalizeOptionalString(value.evergreenCandidateId),
  };
}

export const DEFAULT_INTERPRETATION = {
  signalCategory: "Stress" as SignalCategory,
  severityScore: 2 as SeverityScore,
  relevanceToZazaDraft: "High" as RelevanceToZazaDraft,
  hookTemplateUsed: "This sounds fine… but it isn’t",
  platformPriority: "LinkedIn First" as PlatformPriority,
  suggestedFormatPriority: "Text" as SuggestedFormatPriority,
};
