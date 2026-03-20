import { z } from "zod";

export const RELATIONSHIP_STAGES = [
  "new",
  "contacted",
  "replied",
  "engaged",
  "collaborator",
] as const;

export const INFLUENCER_INTERACTION_TYPES = [
  "message_sent",
  "follow_up_sent",
  "reply_received",
  "note",
] as const;

export const INFLUENCER_PLATFORMS = [
  "linkedin",
  "x",
  "reddit",
  "email",
  "instagram",
  "other",
] as const;

export type RelationshipStage = (typeof RELATIONSHIP_STAGES)[number];
export type InfluencerInteractionType = (typeof INFLUENCER_INTERACTION_TYPES)[number];
export type InfluencerPlatform = (typeof INFLUENCER_PLATFORMS)[number];

export const influencerRecordSchema = z.object({
  influencerId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  platform: z.enum(INFLUENCER_PLATFORMS),
  handle: z.string().trim().nullable().default(null),
  tags: z.array(z.string().trim().min(1)).max(8).default([]),
  relationshipStage: z.enum(RELATIONSHIP_STAGES),
  lastInteraction: z.string().trim().nullable().default(null),
  notes: z.string().trim().nullable().default(null),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

export const influencerInteractionSchema = z.object({
  interactionId: z.string().trim().min(1),
  influencerId: z.string().trim().min(1),
  interactionType: z.enum(INFLUENCER_INTERACTION_TYPES),
  message: z.string().trim().nullable().default(null),
  context: z.string().trim().nullable().default(null),
  signalId: z.string().trim().nullable().default(null),
  timestamp: z.string().trim().min(1),
});

export function getRelationshipStageLabel(stage: RelationshipStage) {
  switch (stage) {
    case "contacted":
      return "Contacted";
    case "replied":
      return "Replied";
    case "engaged":
      return "Engaged";
    case "collaborator":
      return "Collaborator";
    case "new":
    default:
      return "New";
  }
}

export function getInteractionTypeLabel(interactionType: InfluencerInteractionType) {
  switch (interactionType) {
    case "message_sent":
      return "Message sent";
    case "follow_up_sent":
      return "Follow-up sent";
    case "reply_received":
      return "Reply received";
    case "note":
    default:
      return "Note";
  }
}
