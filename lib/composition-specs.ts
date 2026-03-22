import { z } from "zod";

import type { CaptionSpec } from "@/lib/caption-specs";
import type { ProductionDefaults } from "@/lib/production-defaults";
import type { NarrationSpec } from "@/lib/narration-specs";
import type { ScenePrompt } from "@/lib/scene-prompts";
import type { VideoBrief } from "@/lib/video-briefs";

export const compositionSpecSchema = z.object({
  id: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  aspectRatio: z.enum(["9:16", "1:1", "16:9"]),
  resolution: z.enum(["720p", "1080p"]),
  sceneOrder: z.array(z.string().trim().min(1)).min(1).max(4),
  narrationSpecId: z.string().trim().min(1),
  captionSpecId: z.string().trim().min(1),
  transitionStyle: z.string().trim().min(1).optional(),
  musicMode: z.enum(["none", "light-bed"]).optional(),
});

export type CompositionSpec = z.infer<typeof compositionSpecSchema>;

function compositionSpecId(videoBriefId: string): string {
  return `${videoBriefId}:composition-spec`;
}

export function buildCompositionSpec(input: {
  brief: VideoBrief;
  narrationSpec: NarrationSpec;
  captionSpec: CaptionSpec;
  scenePrompts: ScenePrompt[];
  defaults: ProductionDefaults;
}): CompositionSpec {
  return compositionSpecSchema.parse({
    id: compositionSpecId(input.brief.id),
    videoBriefId: input.brief.id,
    aspectRatio: input.defaults.aspectRatio,
    resolution: input.defaults.resolution,
    sceneOrder: [...input.scenePrompts]
      .sort((left, right) => left.order - right.order)
      .map((scene) => scene.id),
    narrationSpecId: input.narrationSpec.id,
    captionSpecId: input.captionSpec.id,
    transitionStyle: input.defaults.compositionDefaults.transitionStyle,
    musicMode: input.defaults.compositionDefaults.musicMode,
  });
}
