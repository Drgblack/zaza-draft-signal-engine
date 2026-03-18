import {
  OUTCOME_QUALITIES,
  PLATFORM_PRIORITIES,
  RELEVANCE_LEVELS,
  SIGNAL_CATEGORIES,
  SIGNAL_STATUSES,
  SUGGESTED_FORMAT_PRIORITIES,
  type SignalRecord,
} from "@/types/signal";

export type SignalFieldKey = Exclude<keyof SignalRecord, "recordId">;
export type AirtableFieldKind = "text" | "number" | "checkbox" | "select" | "select-number" | "text-boolean";

export interface AirtableSignalFieldDefinition {
  label: string;
  kind: AirtableFieldKind;
  allowedValues?: readonly string[];
}

export const AIRTABLE_RECORD_ID_FIELD = "Record ID";

export const AIRTABLE_SIGNAL_FIELD_DEFINITIONS: Record<SignalFieldKey, AirtableSignalFieldDefinition> = {
  createdDate: { label: "Created Date", kind: "text" },
  createdBy: { label: "Created By", kind: "text" },
  status: { label: "Status", kind: "select", allowedValues: SIGNAL_STATUSES },
  reviewNotes: { label: "Review Notes", kind: "text" },
  reuseFlag: { label: "Reuse Flag", kind: "text-boolean" },
  scheduledDate: { label: "Scheduled Date", kind: "text" },
  postedDate: { label: "Posted Date", kind: "text" },
  sourceUrl: { label: "Source URL", kind: "text" },
  sourceTitle: { label: "Source Title", kind: "text" },
  sourceType: { label: "Source Type", kind: "text" },
  sourcePublisher: { label: "Source Publisher", kind: "text" },
  sourceDate: { label: "Source Date", kind: "text" },
  rawExcerpt: { label: "Raw Excerpt", kind: "text" },
  manualSummary: { label: "Manual Summary", kind: "text" },
  signalCategory: { label: "Signal Category", kind: "select", allowedValues: SIGNAL_CATEGORIES },
  severityScore: { label: "Severity Score", kind: "select-number", allowedValues: ["1", "2", "3"] },
  signalSubtype: { label: "Signal Subtype", kind: "text" },
  emotionalPattern: { label: "Emotional Pattern", kind: "text" },
  teacherPainPoint: { label: "Teacher Pain Point", kind: "text" },
  relevanceToZazaDraft: { label: "Relevance to Zaza Draft", kind: "select", allowedValues: RELEVANCE_LEVELS },
  riskToTeacher: { label: "Risk to Teacher", kind: "text" },
  interpretationNotes: { label: "Interpretation Notes", kind: "text" },
  hookTemplateUsed: { label: "Hook Template Used", kind: "text" },
  contentAngle: { label: "Content Angle", kind: "text" },
  platformPriority: { label: "Platform Priority", kind: "select", allowedValues: PLATFORM_PRIORITIES },
  suggestedFormatPriority: {
    label: "Suggested Format Priority",
    kind: "select",
    allowedValues: SUGGESTED_FORMAT_PRIORITIES,
  },
  xDraft: { label: "X Draft", kind: "text" },
  linkedInDraft: { label: "LinkedIn Draft", kind: "text" },
  redditDraft: { label: "Reddit Draft", kind: "text" },
  imagePrompt: { label: "Image Prompt", kind: "text" },
  videoScript: { label: "Video Script", kind: "text" },
  ctaOrClosingLine: { label: "CTA / Closing Line", kind: "text" },
  hashtagsOrKeywords: { label: "Hashtags / Keywords", kind: "text" },
  posted: { label: "Posted?", kind: "checkbox" },
  platformPostedTo: { label: "Platform Posted To", kind: "text" },
  finalCaptionUsed: { label: "Final Caption Used", kind: "text" },
  assetLink: { label: "Asset Link", kind: "text" },
  postUrl: { label: "Post URL", kind: "text" },
  platformPerformedBest: { label: "Platform Performed Best", kind: "select" },
  likesOrReactions: { label: "Likes / Reactions", kind: "number" },
  comments: { label: "Comments", kind: "number" },
  sharesOrReposts: { label: "Shares / Reposts", kind: "number" },
  saves: { label: "Saves", kind: "number" },
  clicks: { label: "Clicks", kind: "number" },
  engagementScore: { label: "Engagement Score", kind: "number" },
  outcomeQuality: { label: "Outcome Quality", kind: "select", allowedValues: OUTCOME_QUALITIES },
  whyItPerformedOrDidnt: { label: "Why It Performed / Didn’t", kind: "text" },
  repeatablePattern: { label: "Repeatable Pattern?", kind: "checkbox" },
  bestHookSignalCombination: { label: "Best Hook-Signal Combination", kind: "text" },
  evergreenPotential: { label: "Evergreen Potential", kind: "select" },
  repurposeLater: { label: "Repurpose Later", kind: "checkbox" },
  repurposeIdeas: { label: "Repurpose Ideas", kind: "text" },
  teacherVoiceSource: { label: "Teacher Voice Source", kind: "text" },
  anonymisedUserPattern: { label: "Anonymised User Pattern?", kind: "checkbox" },
  relatedZazaFrameworkTag: { label: "Related Zaza Framework Tag", kind: "text" },
  generationModelVersion: { label: "Generation Model Version", kind: "text" },
  promptVersion: { label: "Prompt Version", kind: "text" },
};

export const AIRTABLE_SIGNAL_FIELD_KEYS = Object.keys(AIRTABLE_SIGNAL_FIELD_DEFINITIONS) as SignalFieldKey[];
export const AIRTABLE_EXPECTED_FIELD_LABELS = [
  AIRTABLE_RECORD_ID_FIELD,
  ...AIRTABLE_SIGNAL_FIELD_KEYS.map((key) => AIRTABLE_SIGNAL_FIELD_DEFINITIONS[key].label),
];

export function getAirtableFieldLabel(key: SignalFieldKey): string {
  return AIRTABLE_SIGNAL_FIELD_DEFINITIONS[key].label;
}
