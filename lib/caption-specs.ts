import { z } from "zod";

import type { ProductionDefaults } from "@/lib/production-defaults";
import type { NarrationSpec } from "@/lib/narration-specs";
import type { VideoBrief } from "@/lib/video-briefs";

export const captionSpecSchema = z.object({
  id: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  sourceText: z.string().trim().min(1),
  stylePreset: z.string().trim().min(1),
  placement: z.enum(["center", "lower-third"]),
  casing: z.enum(["sentence", "title", "upper"]),
});

export type CaptionSpec = z.infer<typeof captionSpecSchema>;

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function captionSpecId(videoBriefId: string): string {
  return `${videoBriefId}:caption-spec`;
}

export function buildCaptionSpec(input: {
  brief: VideoBrief;
  narrationSpec: NarrationSpec;
  defaults: ProductionDefaults;
}): CaptionSpec {
  const sourceText =
    normalizeText(input.narrationSpec.script) ||
    input.brief.overlayLines.join(" ");

  return captionSpecSchema.parse({
    id: captionSpecId(input.brief.id),
    videoBriefId: input.brief.id,
    sourceText,
    stylePreset: input.defaults.captionStyle.preset,
    placement: input.defaults.captionStyle.placement,
    casing: input.defaults.captionStyle.casing,
  });
}
