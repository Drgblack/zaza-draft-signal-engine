import type { EditorialMode } from "@/types/signal";

export const PLAYBOOK_CARD_STATUSES = ["active", "retired"] as const;
export type PlaybookCardStatus = (typeof PLAYBOOK_CARD_STATUSES)[number];

export const PLAYBOOK_CARD_STATUS_LABELS: Record<PlaybookCardStatus, string> = {
  active: "Active",
  retired: "Retired",
};

export interface PlaybookCard {
  id: string;
  title: string;
  summary: string;
  situation: string;
  whatWorks: string;
  whatToAvoid: string;
  suggestedModes: EditorialMode[];
  relatedPatternIds: string[];
  relatedBundleIds: string[];
  relatedTags: string[];
  status: PlaybookCardStatus;
  createdAt: string;
  createdBy: string;
}

export interface PlaybookCardSummary {
  id: string;
  title: string;
  summary: string;
  status: PlaybookCardStatus;
}

export interface PlaybookCardFormValues {
  title: string;
  summary: string;
  situation: string;
  whatWorks: string;
  whatToAvoid: string;
  suggestedModes: EditorialMode[];
  relatedPatternIds: string[];
  relatedBundleIds: string[];
  relatedTags: string[];
  status: PlaybookCardStatus;
}

export interface PlaybookCardMatch {
  card: PlaybookCard;
  reason: string;
  score: number;
  matchedOn: string[];
}
