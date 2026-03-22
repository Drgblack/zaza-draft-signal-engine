import { z } from "zod";

import type { ContentOpportunity } from "@/lib/content-opportunities";
import type { NarrationSpec } from "@/lib/narration-specs";
import type { VideoPrompt } from "@/lib/video-prompts";
import type { VideoBrief } from "@/lib/video-briefs";

export const VIDEO_GENERATION_STATUSES = [
  "pending",
  "approved",
  "submitted",
  "rendering",
  "completed",
  "failed",
] as const;

export type VideoGenerationStatus = (typeof VIDEO_GENERATION_STATUSES)[number];

export const videoGenerationRequestSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  narrationSpecId: z.string().trim().min(1),
  videoPromptId: z.string().trim().min(1),
  approvedAt: z.string().trim().min(1),
  approvedBy: z.string().trim().min(1),
  status: z.enum(VIDEO_GENERATION_STATUSES),
});

export type VideoGenerationRequest = z.infer<typeof videoGenerationRequestSchema>;

function videoGenerationRequestId(videoBriefId: string): string {
  return `${videoBriefId}:generation-request`;
}

export function buildVideoGenerationRequest(input: {
  opportunity: ContentOpportunity;
  brief: VideoBrief;
  narrationSpec: NarrationSpec;
  videoPrompt: VideoPrompt;
  approvedBy: string;
  approvedAt: string;
}): VideoGenerationRequest {
  return videoGenerationRequestSchema.parse({
    id: videoGenerationRequestId(input.brief.id),
    opportunityId: input.opportunity.opportunityId,
    videoBriefId: input.brief.id,
    narrationSpecId: input.narrationSpec.id,
    videoPromptId: input.videoPrompt.id,
    approvedAt: input.approvedAt,
    approvedBy: input.approvedBy,
    status: "approved",
  });
}
