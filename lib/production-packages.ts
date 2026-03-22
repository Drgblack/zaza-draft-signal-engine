import { z } from "zod";

import type { ContentOpportunity } from "@/lib/content-opportunities";
import {
  buildNarrationSpec,
  narrationSpecSchema,
} from "@/lib/narration-specs";
import {
  buildVideoPrompt,
  videoPromptSchema,
} from "@/lib/video-prompts";
import {
  type VideoBrief,
  videoBriefSchema,
} from "@/lib/video-briefs";

export const productionPackageSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  title: z.string().trim().min(1),
  brief: videoBriefSchema,
  narrationSpec: narrationSpecSchema,
  videoPrompt: videoPromptSchema,
  overlayLines: z.array(z.string().trim().min(1)).max(4),
  cta: z.string().trim().min(1),
  exportFormat: z.literal("json"),
  version: z.literal(1),
});

export type ProductionPackage = z.infer<typeof productionPackageSchema>;

function productionPackageId(videoBriefId: string) {
  return `${videoBriefId}:production-package`;
}

function requireStableBrief(opportunity: ContentOpportunity): VideoBrief {
  if (
    !opportunity.selectedAngleId ||
    !opportunity.selectedHookId ||
    !opportunity.selectedVideoBrief
  ) {
    throw new Error("A stable selected video brief is required before export.");
  }

  return opportunity.selectedVideoBrief;
}

function getReusableNarrationSpec(
  opportunity: ContentOpportunity,
  brief: VideoBrief,
) {
  const narrationSpec = opportunity.generationState?.narrationSpec;

  if (!narrationSpec || narrationSpec.videoBriefId !== brief.id) {
    return null;
  }

  return narrationSpec;
}

function getReusableVideoPrompt(
  opportunity: ContentOpportunity,
  brief: VideoBrief,
) {
  const videoPrompt = opportunity.generationState?.videoPrompt;

  if (!videoPrompt || videoPrompt.videoBriefId !== brief.id) {
    return null;
  }

  return videoPrompt;
}

export function buildProductionPackage(input: {
  opportunity: ContentOpportunity;
}): ProductionPackage {
  const brief = requireStableBrief(input.opportunity);
  const narrationSpec =
    getReusableNarrationSpec(input.opportunity, brief) ??
    buildNarrationSpec(input.opportunity, brief);
  const videoPrompt =
    getReusableVideoPrompt(input.opportunity, brief) ??
    buildVideoPrompt(input.opportunity, brief);

  return productionPackageSchema.parse({
    id: productionPackageId(brief.id),
    opportunityId: input.opportunity.opportunityId,
    videoBriefId: brief.id,
    createdAt: new Date().toISOString(),
    title: brief.title,
    brief,
    narrationSpec,
    videoPrompt,
    overlayLines: brief.overlayLines,
    cta: brief.cta,
    exportFormat: "json",
    version: 1,
  });
}
