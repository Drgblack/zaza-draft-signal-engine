export const SIGNAL_STATUSES = [
  "New",
  "Interpreted",
  "Draft Generated",
  "Reviewed",
  "Approved",
  "Scheduled",
  "Posted",
  "Archived",
  "Rejected",
] as const;

export const SIGNAL_CATEGORIES = [
  "Risk",
  "Stress",
  "Conflict",
  "Confusion",
  "Success",
] as const;

export const SEVERITY_SCORES = [1, 2, 3] as const;

export const RELEVANCE_LEVELS = ["High", "Medium", "Low"] as const;

export const PLATFORM_PRIORITIES = [
  "X First",
  "LinkedIn First",
  "Reddit First",
  "Multi-platform",
] as const;

export const SUGGESTED_FORMAT_PRIORITIES = [
  "Text",
  "Image",
  "Video",
  "Carousel",
  "Multi-format",
] as const;

export const OUTCOME_QUALITIES = [
  "High Signal",
  "Moderate Signal",
  "Weak Signal",
  "No Data Yet",
] as const;

export const TEACHER_VOICE_SOURCES = [
  "External Public Signal",
  "Internal User Signal",
  "Founder Observation",
  "Support Pattern",
  "Product Usage Pattern",
] as const;

export const HOOK_TEMPLATES = [
  "This could cost you your job",
  "This sounds fine… but it isn’t",
  "This is what emails look like when you’re exhausted",
  "What this really shows",
  "Quiet risk teachers miss",
  "Statistic with human cost",
  "Before / after rewrite",
  "Other",
] as const;

export const INTERPRETATION_CONFIDENCE_LEVELS = ["Low", "Medium", "High"] as const;
export const INTERPRETATION_SOURCES = ["rules", "manual", "ai"] as const;
export const GENERATION_SOURCES = ["anthropic", "openai", "mock", "manual"] as const;

export type SignalStatus = (typeof SIGNAL_STATUSES)[number];
export type SignalCategory = (typeof SIGNAL_CATEGORIES)[number];
export type SeverityScore = (typeof SEVERITY_SCORES)[number];
export type RelevanceToZazaDraft = (typeof RELEVANCE_LEVELS)[number];
export type PlatformPriority = (typeof PLATFORM_PRIORITIES)[number];
export type SuggestedFormatPriority = (typeof SUGGESTED_FORMAT_PRIORITIES)[number];
export type OutcomeQuality = (typeof OUTCOME_QUALITIES)[number];
export type TeacherVoiceSource = (typeof TEACHER_VOICE_SOURCES)[number];
export type HookTemplate = (typeof HOOK_TEMPLATES)[number];
export type InterpretationConfidence = (typeof INTERPRETATION_CONFIDENCE_LEVELS)[number];
export type InterpretationSource = (typeof INTERPRETATION_SOURCES)[number];
export type GenerationSource = (typeof GENERATION_SOURCES)[number];

export interface SignalCreatePayload {
  sourceUrl: string | null;
  sourceTitle: string;
  sourceType: string | null;
  sourcePublisher: string | null;
  sourceDate: string | null;
  rawExcerpt: string | null;
  manualSummary: string | null;
  signalCategory: SignalCategory | null;
  severityScore: SeverityScore | null;
  hookTemplateUsed: string | null;
  status: SignalStatus;
}

export interface SignalInterpretationInput {
  recordId?: string;
  sourceTitle: string;
  sourceType: string | null;
  sourcePublisher: string | null;
  sourceDate: string | null;
  sourceUrl: string | null;
  rawExcerpt: string | null;
  manualSummary: string | null;
}

export interface SignalInterpretationResult {
  signalCategory: SignalCategory;
  severityScore: SeverityScore;
  signalSubtype: string;
  emotionalPattern: string;
  teacherPainPoint: string;
  relevanceToZazaDraft: RelevanceToZazaDraft;
  riskToTeacher: string;
  interpretationNotes: string;
  hookTemplateUsed: HookTemplate;
  contentAngle: string;
  platformPriority: PlatformPriority;
  suggestedFormatPriority: SuggestedFormatPriority;
  interpretationConfidence: InterpretationConfidence;
  interpretationSource: InterpretationSource;
  interpretedAt: string;
}

export interface SignalInterpretationSavePayload extends SignalInterpretationResult {
  status?: SignalStatus;
}

export interface SignalGenerationInput extends SignalInterpretationInput {
  signalCategory: SignalCategory;
  severityScore: SeverityScore;
  signalSubtype: string;
  emotionalPattern: string;
  teacherPainPoint: string;
  relevanceToZazaDraft: RelevanceToZazaDraft;
  riskToTeacher: string;
  interpretationNotes: string;
  hookTemplateUsed: HookTemplate;
  contentAngle: string;
  platformPriority: PlatformPriority;
  suggestedFormatPriority: SuggestedFormatPriority;
}

export interface SignalGenerationResult {
  xDraft: string;
  linkedInDraft: string;
  redditDraft: string;
  imagePrompt: string;
  videoScript: string;
  ctaOrClosingLine: string;
  hashtagsOrKeywords: string;
  generationSource: GenerationSource;
  generationModelVersion: string;
  promptVersion: string;
  generatedAt: string;
}

export interface SignalGenerationSavePayload extends SignalGenerationResult {
  status?: SignalStatus;
}

export interface SignalRecord {
  recordId: string;
  createdDate: string;
  createdBy: string | null;
  status: SignalStatus;
  reviewNotes: string | null;
  reuseFlag: boolean;
  scheduledDate: string | null;
  postedDate: string | null;
  sourceUrl: string | null;
  sourceTitle: string;
  sourceType: string | null;
  sourcePublisher: string | null;
  sourceDate: string | null;
  rawExcerpt: string | null;
  manualSummary: string | null;
  signalCategory: SignalCategory | null;
  severityScore: SeverityScore | null;
  signalSubtype: string | null;
  emotionalPattern: string | null;
  teacherPainPoint: string | null;
  relevanceToZazaDraft: RelevanceToZazaDraft | null;
  riskToTeacher: string | null;
  interpretationNotes: string | null;
  hookTemplateUsed: string | null;
  contentAngle: string | null;
  platformPriority: PlatformPriority | null;
  suggestedFormatPriority: SuggestedFormatPriority | null;
  xDraft: string | null;
  linkedInDraft: string | null;
  redditDraft: string | null;
  imagePrompt: string | null;
  videoScript: string | null;
  ctaOrClosingLine: string | null;
  hashtagsOrKeywords: string | null;
  posted: boolean;
  platformPostedTo: string | null;
  finalCaptionUsed: string | null;
  assetLink: string | null;
  postUrl: string | null;
  platformPerformedBest: string | null;
  likesOrReactions: number | null;
  comments: number | null;
  sharesOrReposts: number | null;
  saves: number | null;
  clicks: number | null;
  engagementScore: number | null;
  outcomeQuality: OutcomeQuality | null;
  whyItPerformedOrDidnt: string | null;
  repeatablePattern: boolean | null;
  bestHookSignalCombination: string | null;
  evergreenPotential: string | null;
  repurposeLater: boolean;
  repurposeIdeas: string | null;
  teacherVoiceSource: TeacherVoiceSource | null;
  anonymisedUserPattern: boolean | null;
  relatedZazaFrameworkTag: string | null;
  generationModelVersion: string | null;
  promptVersion: string | null;
}

export type UpdateSignalInput = Partial<Omit<SignalRecord, "recordId">>;

export type SignalDataSource = "airtable" | "mock";
