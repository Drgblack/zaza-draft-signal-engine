import { z } from "zod";

import { buildFounderVoicePromptBlock, isFounderVoiceOn } from "@/lib/founder-voice";
import type { AudienceMemorySegment } from "@/lib/audience-memory";
import type { InfluencerInteraction, InfluencerRecord } from "@/lib/influencer-graph";
import { getInteractionTypeLabel, getRelationshipStageLabel } from "@/lib/influencer-graph-definitions";
import type { ZazaConnectSignalHints } from "@/lib/zaza-connect-bridge";
import { generateStructuredJson, getGenerationProviderConfig } from "@/lib/llm";
import type { FounderVoiceMode, SignalRecord } from "@/types/signal";

export const OUTREACH_TYPES = [
  "initial_contact",
  "follow_up",
  "reply",
  "collaboration_pitch",
  "thank_you",
] as const;

export const OUTREACH_TONES = [
  "friendly",
  "professional",
] as const;

export const OUTREACH_PLATFORMS = [
  "linkedin",
  "x",
  "email",
  "instagram",
  "general",
] as const;

export type OutreachType = (typeof OUTREACH_TYPES)[number];
export type OutreachTone = (typeof OUTREACH_TONES)[number];
export type OutreachPlatform = (typeof OUTREACH_PLATFORMS)[number];

export interface OutreachContext {
  signal: SignalRecord;
  outreachType: OutreachType;
  platform: OutreachPlatform;
  tone: OutreachTone;
  influencer?: InfluencerRecord | null;
  recentInteractions?: InfluencerInteraction[];
  recipientName?: string | null;
  creatorFocus?: string | null;
  relationshipContext?: string | null;
  collaborationGoal?: string | null;
  inboundMessage?: string | null;
  founderVoiceMode?: FounderVoiceMode | null;
  zazaConnectHints?: ZazaConnectSignalHints | null;
  audienceMemoryHint?: AudienceMemorySegment | null;
}

export const outreachResultSchema = z.object({
  message: z.string().trim().min(1),
  tone: z.enum(OUTREACH_TONES),
  purpose: z.string().trim().min(1),
  contextSummary: z.string().trim().nullable().default(null),
});

export type OutreachResult = z.infer<typeof outreachResultSchema> & {
  outreachType: OutreachType;
  platform: OutreachPlatform;
  founderVoiceMode: FounderVoiceMode;
  generationSource: "anthropic" | "openai" | "mock";
  generationModelVersion: string;
  generatedAt: string;
};

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function getSignalFocus(signal: SignalRecord): string {
  return (
    normalizeText(signal.scenarioAngle) ??
    normalizeText(signal.contentAngle) ??
    normalizeText(signal.manualSummary) ??
    normalizeText(signal.sourceTitle) ??
    "teacher communication pressure"
  );
}

function getOutreachPurposeLabel(type: OutreachType): string {
  switch (type) {
    case "initial_contact":
      return "Start a warm, specific conversation.";
    case "follow_up":
      return "Re-open a relevant conversation without pressure.";
    case "reply":
      return "Reply helpfully to an inbound message.";
    case "collaboration_pitch":
      return "Suggest a small, relevant collaboration.";
    case "thank_you":
    default:
      return "Thank someone in a calm, human way.";
  }
}

function getPlatformGuidance(platform: OutreachPlatform): string {
  switch (platform) {
    case "linkedin":
      return "Professional, warm, compact. One short paragraph is usually enough.";
    case "x":
      return "Short, direct, and conversational.";
    case "instagram":
      return "Warm, light, and human. Avoid polished marketing tone.";
    case "email":
      return "Still compact, but slightly fuller and clearer.";
    case "general":
    default:
      return "Short, natural, and easy to send manually.";
  }
}

function buildContextSummary(input: OutreachContext): string | null {
  const parts = [
    input.influencer ? `${input.influencer.name} (${getRelationshipStageLabel(input.influencer.relationshipStage)})` : null,
    normalizeText(input.recipientName),
    normalizeText(input.creatorFocus),
    normalizeText(input.relationshipContext),
    normalizeText(input.collaborationGoal),
    ...(input.zazaConnectHints?.matchedThemes ?? []).slice(0, 2),
    ...(input.zazaConnectHints?.collaborationNotes ?? []).slice(0, 1),
  ].filter((value): value is string => Boolean(value));

  if (parts.length === 0) {
    return null;
  }

  return parts.join(" | ");
}

function buildMockMessage(input: OutreachContext): OutreachResult {
  const recipient = normalizeText(input.recipientName) ?? "there";
  const focus = getSignalFocus(input.signal);
  const creatorFocus = normalizeText(input.creatorFocus);
  const collaborationGoal = normalizeText(input.collaborationGoal);
  const inboundMessage = normalizeText(input.inboundMessage);
  const founderVoiceMode = input.founderVoiceMode ?? "founder_voice_on";
  const relationshipLabel = input.influencer
    ? getRelationshipStageLabel(input.influencer.relationshipStage).toLowerCase()
    : null;
  const latestInteraction = input.recentInteractions?.[0] ?? null;
  const connectTheme = input.zazaConnectHints?.matchedThemes[0] ?? null;
  const connectCollaboration = input.zazaConnectHints?.collaborationNotes[0] ?? null;
  const audienceNote = input.audienceMemoryHint?.summary[0] ?? null;

  let message: string;

  switch (input.outreachType) {
    case "initial_contact":
      message = relationshipLabel && relationshipLabel !== "new"
        ? `Hi ${recipient}, your recent note brought me back to ${focus.toLowerCase()}. I thought it was worth reopening the thread because the teacher-language problem still feels under-served${connectTheme ? `, especially around ${connectTheme.toLowerCase()}` : ""}${audienceNote ? `. ${audienceNote}` : ""}.`
        : `Hi ${recipient}, I’ve been following your work${creatorFocus ? ` around ${creatorFocus}` : ""}. Your recent take made me think about ${focus.toLowerCase()}${connectTheme ? ` and the broader ${connectTheme.toLowerCase()} angle` : ""}. I’m building Zaza around calmer, teacher-first communication support, and I thought I’d say hello properly${audienceNote ? `. ${audienceNote}` : ""}.`;
      break;
    case "follow_up":
      message = `Hi ${recipient}, just following up because your perspective still feels relevant to ${focus.toLowerCase()}. No pressure on this.${latestInteraction?.message ? ` Your last note about "${latestInteraction.message}" has stayed with me.` : ""}${connectCollaboration ? ` I still think there may be a practical overlap around ${connectCollaboration.toLowerCase()}.` : " I thought there might be a useful overlap worth comparing notes on."}`;
      break;
    case "reply":
      message = inboundMessage
        ? `Thanks, ${recipient}. That makes sense. I agree the real issue is often ${focus.toLowerCase()}, not the louder surface detail. I’m happy to compare notes if useful.`
        : `Thanks, ${recipient}. I appreciate the reply. I think there is a useful overlap here around ${focus.toLowerCase()}.`;
      break;
    case "collaboration_pitch":
      message = `Hi ${recipient}, I think there could be a small collaboration angle here${collaborationGoal ? ` around ${collaborationGoal.toLowerCase()}` : connectCollaboration ? ` around ${connectCollaboration.toLowerCase()}` : ""}. Nothing overbuilt. Just something practical that helps teachers think more clearly about ${focus.toLowerCase()}.`;
      break;
    case "thank_you":
    default:
      message = `Hi ${recipient}, thank you for the time and the thoughtful response. I found your perspective useful, especially around ${focus.toLowerCase()}.`;
      break;
  }

  if (isFounderVoiceOn(founderVoiceMode)) {
    message = message
      .replace(/\bgame[- ]changer\b/gi, "useful shift")
      .replace(/\bexcited\b/gi, "glad")
      .replace(/\!/g, ".")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  return {
    message,
    tone: input.tone,
    purpose: getOutreachPurposeLabel(input.outreachType),
    contextSummary: buildContextSummary(input),
    outreachType: input.outreachType,
    platform: input.platform,
    founderVoiceMode,
    generationSource: "mock",
    generationModelVersion: "mock-outreach-v1",
    generatedAt: new Date().toISOString(),
  };
}

function buildSystemPrompt(input: OutreachContext): string {
  return [
    "You are generating short outreach support copy for Zaza Draft.",
    "Return exactly one JSON object matching the required schema and nothing else.",
    "Keep the message short, natural, and manually sendable.",
    "This is not cold outreach spam. It is relationship-first communication.",
    "Avoid hype, pressure, flattery, overfamiliarity, and marketing language.",
    "Do not sound automated.",
    "Do not promise partnerships or outcomes that were not stated.",
    "Prefer curiosity, relevance, and human warmth.",
    "Respect relationship stage. Do not write like this is a first cold message when prior interaction exists.",
    ...buildFounderVoicePromptBlock(input.founderVoiceMode ?? "founder_voice_on"),
    `Platform guidance: ${getPlatformGuidance(input.platform)}`,
  ].join("\n");
}

function buildUserPrompt(input: OutreachContext): string {
  return JSON.stringify(
    {
      task: "Generate one short outreach or reply message.",
      outreachType: input.outreachType,
      purpose: getOutreachPurposeLabel(input.outreachType),
      platform: input.platform,
      tone: input.tone,
      founderVoiceMode: input.founderVoiceMode ?? "founder_voice_on",
      influencer: input.influencer
        ? {
            influencerId: input.influencer.influencerId,
            name: input.influencer.name,
            platform: input.influencer.platform,
            handle: input.influencer.handle,
            tags: input.influencer.tags,
            relationshipStage: input.influencer.relationshipStage,
            lastInteraction: input.influencer.lastInteraction,
          }
        : null,
      recentInteractions: (input.recentInteractions ?? []).slice(0, 3).map((interaction) => ({
        interactionType: getInteractionTypeLabel(interaction.interactionType),
        message: normalizeText(interaction.message),
        context: normalizeText(interaction.context),
        timestamp: interaction.timestamp,
      })),
      recipient: {
        name: normalizeText(input.recipientName),
        creatorFocus: normalizeText(input.creatorFocus),
        relationshipContext: normalizeText(input.relationshipContext),
        collaborationGoal: normalizeText(input.collaborationGoal),
        inboundMessage: normalizeText(input.inboundMessage),
      },
      zazaConnectBridge: input.zazaConnectHints
        ? {
            matchedThemes: input.zazaConnectHints.matchedThemes,
            creatorTags: input.zazaConnectHints.creatorTags,
            collaborationNotes: input.zazaConnectHints.collaborationNotes,
            replySignals: input.zazaConnectHints.replySignals,
            relationshipHints: input.zazaConnectHints.relationshipHints,
            summary: input.zazaConnectHints.summary,
          }
        : null,
      audienceMemory: input.audienceMemoryHint
        ? {
            segmentName: input.audienceMemoryHint.segmentName,
            strongestModes: input.audienceMemoryHint.strongestModes.map((row) => row.label),
            strongestPlatforms: input.audienceMemoryHint.strongestPlatforms.map((row) => row.label),
            preferredCtaStyles: input.audienceMemoryHint.preferredCtaStyles,
            toneCautions: input.audienceMemoryHint.toneCautions,
            summary: input.audienceMemoryHint.summary,
          }
        : null,
      signal: {
        sourceTitle: input.signal.sourceTitle,
        scenarioAngle: normalizeText(input.signal.scenarioAngle),
        contentAngle: normalizeText(input.signal.contentAngle),
        manualSummary: normalizeText(input.signal.manualSummary),
        editorialMode: input.signal.editorialMode,
        founderVoiceMode: input.signal.founderVoiceMode,
      },
      rules: {
        length: "Usually 2-4 sentences. Keep it concise.",
        tone: "Natural, human, calm, and non-promotional.",
        avoid: [
          "buzzwords",
          "growth-hack language",
          "false urgency",
          "generic influencer flattery",
          "hard sell CTA",
        ],
      },
    },
    null,
    2,
  );
}

export async function generateOutreachMessage(input: OutreachContext): Promise<OutreachResult> {
  const config = getGenerationProviderConfig();
  const founderVoiceMode = input.founderVoiceMode ?? "founder_voice_on";

  if (config.provider === "mock") {
    return buildMockMessage({
      ...input,
      founderVoiceMode,
    });
  }

  try {
    const generation = await generateStructuredJson({
      systemPrompt: buildSystemPrompt({
        ...input,
        founderVoiceMode,
      }),
      userPrompt: buildUserPrompt({
        ...input,
        founderVoiceMode,
      }),
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["message", "tone", "purpose", "contextSummary"],
        properties: {
          message: { type: "string" },
          tone: { type: "string", enum: [...OUTREACH_TONES] },
          purpose: { type: "string" },
          contextSummary: { type: ["string", "null"] },
        },
      },
    });

    const parsed = outreachResultSchema.parse(JSON.parse(generation.rawJson));

    return {
      ...parsed,
      outreachType: input.outreachType,
      platform: input.platform,
      founderVoiceMode,
      generationSource: generation.source,
      generationModelVersion: generation.modelVersion,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return buildMockMessage({
      ...input,
      founderVoiceMode,
    });
  }
}
