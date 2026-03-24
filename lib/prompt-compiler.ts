import { z } from "zod";

import {
  extractAuthenticPhrases,
  selectAuthenticPhrasesForBrief,
} from "@/lib/authentic-language";
import {
  buildCaptionSpec,
  captionSpecSchema,
} from "@/lib/caption-specs";
import {
  buildCompositionSpec,
  compositionSpecSchema,
  type CompositionSpec,
} from "@/lib/composition-specs";
import type { ContentOpportunity } from "@/lib/content-opportunities";
import {
  getActiveProductionDefaults,
  productionDefaultsSchema,
} from "@/lib/production-defaults";
import {
  applyPromptOverrideScenePrompts,
  resolvePromptOverrideResolution,
} from "@/lib/prompt-overrides";
import {
  buildNarrationSpec,
  narrationSpecSchema,
} from "@/lib/narration-specs";
import { evaluatePhaseBTrust } from "@/lib/phase-b-trust";
import {
  buildScenePrompts,
  scenePromptSchema,
} from "@/lib/scene-prompts";
import {
  evaluateOpportunityTrust,
  evaluateFinalAssembledScriptTrust,
  evaluateTrust,
  trustAssessmentSchema,
  type TrustAssessment,
} from "@/lib/trust-evaluator";
import {
  type VideoBrief,
  videoBriefSchema,
} from "@/lib/video-briefs";

export const compiledProductionPlanSchema = z.object({
  id: z.string().trim().min(1),
  opportunityId: z.string().trim().min(1),
  videoBriefId: z.string().trim().min(1),
  defaultsSnapshot: productionDefaultsSchema,
  narrationSpec: narrationSpecSchema,
  scenePrompts: z.array(scenePromptSchema).min(1).max(4),
  captionSpec: captionSpecSchema,
  compositionSpec: compositionSpecSchema,
  finalScriptTrustAssessment: trustAssessmentSchema.nullable().default(null),
  trustAssessment: trustAssessmentSchema,
});

export type CompiledProductionPlan = z.infer<typeof compiledProductionPlanSchema>;

function compiledProductionPlanId(videoBriefId: string): string {
  return `${videoBriefId}:compiled-production-plan`;
}

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function buildCompiledText(input: {
  brief: VideoBrief;
  narrationScript: string;
  scenePrompts: Array<{ visualPrompt: string; overlayText?: string }>;
  captionSourceText: string;
  compositionSpec: CompositionSpec;
}) {
  return [
    input.brief.hook,
    input.brief.goal,
    input.brief.cta,
    input.narrationScript,
    input.captionSourceText,
    ...input.scenePrompts.flatMap((scene) => [
      scene.visualPrompt,
      scene.overlayText ?? "",
    ]),
    input.compositionSpec.transitionStyle ?? "",
    input.compositionSpec.musicMode ?? "",
  ].join(" ");
}

function approvedLanguagePreserved(
  compiledText: string,
  requiredPhrases: string[],
): boolean {
  const normalizedCompiled = normalizeText(compiledText).toLowerCase();

  return requiredPhrases.some((phrase) =>
    normalizedCompiled.includes(normalizeText(phrase).toLowerCase()),
  );
}

function selectRequiredAuthenticPhrases(opportunity: ContentOpportunity, brief: VideoBrief) {
  const teacherLanguagePhrases = extractAuthenticPhrases(opportunity)
    .filter((phrase) => phrase.sourceType === "teacher-language")
    .map((phrase) => phrase.text);

  if (teacherLanguagePhrases.length > 0) {
    return teacherLanguagePhrases;
  }

  return selectAuthenticPhrasesForBrief(opportunity, brief, 3).map(
    (phrase) => phrase.text,
  );
}

function buildCompiledTrustAssessment(input: {
  opportunity: ContentOpportunity;
  brief: VideoBrief;
  narrationScript: string;
  scenePrompts: Array<{ visualPrompt: string; overlayText?: string }>;
  captionSourceText: string;
  compositionSpec: CompositionSpec;
}): TrustAssessment {
  const opportunityTrust = evaluateOpportunityTrust(input.opportunity);
  const requiredPhrases = selectRequiredAuthenticPhrases(
    input.opportunity,
    input.brief,
  );
  const compiledText = buildCompiledText(input);
  const compiledCheck = evaluatePhaseBTrust(compiledText, {
    allowProductMention: true,
  });
  let penalty = compiledCheck.penalty;
  const reasons = [...compiledCheck.reasons, ...opportunityTrust.reasons];
  let adjusted = opportunityTrust.adjusted;

  if (opportunityTrust.status === "caution") {
    penalty += 8;
    adjusted = true;
    reasons.push("opportunity-trust-caution");
  }

  if (opportunityTrust.status === "blocked") {
    penalty += 18;
    adjusted = true;
    reasons.push("opportunity-trust-blocked");
  }

  if (!approvedLanguagePreserved(compiledText, requiredPhrases)) {
    penalty += 10;
    adjusted = true;
    reasons.push("approved-language-not-preserved");
  }

  return evaluateTrust({
    penalty,
    reasons,
    adjusted,
  });
}

function downgradeCompositionSpecForTrust(
  compositionSpec: CompositionSpec,
  trustAssessment: TrustAssessment,
): {
  compositionSpec: CompositionSpec;
  downgraded: boolean;
} {
  if (
    trustAssessment.status === "safe" ||
    compositionSpec.musicMode !== "light-bed"
  ) {
    return {
      compositionSpec,
      downgraded: false,
    };
  }

  return {
    compositionSpec: compositionSpecSchema.parse({
      ...compositionSpec,
      musicMode: "none",
    }),
    downgraded: true,
  };
}

export function compileVideoBriefForProduction(input: {
  opportunity: ContentOpportunity;
  brief: VideoBrief;
  defaultsSnapshot?: z.infer<typeof productionDefaultsSchema> | null;
}): CompiledProductionPlan {
  const brief = videoBriefSchema.parse(input.brief);
  const defaultsSnapshot = productionDefaultsSchema.parse(
    input.defaultsSnapshot ?? getActiveProductionDefaults(),
  );
  const overrideResolution = resolvePromptOverrideResolution({
    opportunity: input.opportunity,
    brief,
    defaultsSnapshot,
  });
  const effectiveDefaultsSnapshot = productionDefaultsSchema.parse(
    overrideResolution.effectiveDefaults,
  );
  const narrationSpec = buildNarrationSpec(input.opportunity, brief);
  const baseScenePrompts = buildScenePrompts({
    opportunity: input.opportunity,
    brief,
    defaults: effectiveDefaultsSnapshot,
  });
  const scenePrompts = applyPromptOverrideScenePrompts({
    scenePrompts: baseScenePrompts,
    resolution: overrideResolution,
  });
  const captionSpec = buildCaptionSpec({
    brief,
    narrationSpec,
    defaults: effectiveDefaultsSnapshot,
  });
  const initialCompositionSpec = buildCompositionSpec({
    brief,
    narrationSpec,
    captionSpec,
    scenePrompts,
    defaults: effectiveDefaultsSnapshot,
  });
  const initialTrustAssessment = buildCompiledTrustAssessment({
    opportunity: input.opportunity,
    brief,
    narrationScript: narrationSpec.script,
    scenePrompts,
    captionSourceText: captionSpec.sourceText,
    compositionSpec: initialCompositionSpec,
  });
  const downgradedComposition = downgradeCompositionSpecForTrust(
    initialCompositionSpec,
    initialTrustAssessment,
  );
  const finalScriptTrustAssessment = evaluateFinalAssembledScriptTrust({
    opportunity: input.opportunity,
    brief,
    narrationScript: narrationSpec.script,
  });
  const downgradedTrustAssessment = downgradedComposition.downgraded
    ? buildCompiledTrustAssessment({
        opportunity: input.opportunity,
        brief,
        narrationScript: narrationSpec.script,
        scenePrompts,
        captionSourceText: captionSpec.sourceText,
        compositionSpec: downgradedComposition.compositionSpec,
      })
    : null;
  const trustAssessment = downgradedTrustAssessment
    ? trustAssessmentSchema.parse({
        ...downgradedTrustAssessment,
        reasons: [
          ...downgradedTrustAssessment.reasons,
          "composition-downgraded-for-trust",
        ],
        adjusted: true,
      })
    : initialTrustAssessment;

  if (trustAssessment.status === "blocked") {
    throw new Error(
      `Compiled production plan failed trust checks: ${trustAssessment.reasons[0] ?? "untrustworthy output"}.`,
    );
  }

  return compiledProductionPlanSchema.parse({
    id: compiledProductionPlanId(brief.id),
    opportunityId: input.opportunity.opportunityId,
    videoBriefId: brief.id,
    defaultsSnapshot: effectiveDefaultsSnapshot,
    narrationSpec,
    scenePrompts,
    captionSpec,
    compositionSpec: downgradedComposition.compositionSpec,
    finalScriptTrustAssessment,
    trustAssessment,
  });
}
