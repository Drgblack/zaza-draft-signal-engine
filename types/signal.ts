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

export type SignalStatus = (typeof SIGNAL_STATUSES)[number];
export type SignalCategory = (typeof SIGNAL_CATEGORIES)[number];
export type SeverityScore = (typeof SEVERITY_SCORES)[number];
export type RelevanceToZazaDraft = (typeof RELEVANCE_LEVELS)[number];
export type PlatformPriority = (typeof PLATFORM_PRIORITIES)[number];
export type SuggestedFormatPriority = (typeof SUGGESTED_FORMAT_PRIORITIES)[number];
export type OutcomeQuality = (typeof OUTCOME_QUALITIES)[number];
export type TeacherVoiceSource = (typeof TEACHER_VOICE_SOURCES)[number];

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
