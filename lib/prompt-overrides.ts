import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  factoryReviewReasonCodeSchema,
} from "@/lib/video-factory-review-reasons";
import {
  PERFORMANCE_SIGNAL_EVENT_TYPES,
  performanceSignalSchema,
} from "@/lib/performance-signals";
import {
  productionDefaultsSchema,
  type ProductionDefaults,
} from "@/lib/production-defaults";
import { trustAssessmentSchema, evaluateOpportunityTrust } from "@/lib/trust-evaluator";
import {
  VIDEO_BRIEF_FORMATS,
  type VideoBrief,
} from "@/lib/video-briefs";
import { scenePromptSchema, type ScenePrompt } from "@/lib/scene-prompts";
import type { ContentOpportunity } from "@/lib/content-opportunities";

function promptOverrideStorePath() {
  return path.join(process.cwd(), "data", "prompt-overrides.json");
}

export const PROMPT_OVERRIDE_RULE_TARGETS = [
  "reduce_motion",
  "simplify_overlays",
  "suppress_music",
  "prefer_visual_providers",
] as const;

const promptOverrideCategorySchema = z.enum([
  "parent-complaint-emails",
  "emotionally-charged-reply",
  "report-card-comments",
  "general-teacher-communication",
]);

export const promptOverrideRuleSchema = z.object({
  id: z.string().trim().min(1),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).default(100),
  description: z.string().trim().min(1),
  conditions: z
    .object({
      painPointCategories: z.array(promptOverrideCategorySchema).min(1).optional(),
      trustRisks: z.array(z.enum(["low", "medium", "high"])).min(1).optional(),
      trustStatuses: z
        .array(trustAssessmentSchema.shape.status)
        .min(1)
        .optional(),
      briefFormats: z.array(z.enum(VIDEO_BRIEF_FORMATS)).min(1).optional(),
      reasonCodesAnyOf: z.array(factoryReviewReasonCodeSchema).min(1).optional(),
      qualityFailureCodesAnyOf: z.array(z.string().trim().min(1)).min(1).optional(),
      performanceEventTypesAnyOf: z
        .array(z.enum(PERFORMANCE_SIGNAL_EVENT_TYPES))
        .min(1)
        .optional(),
    })
    .default({}),
  overrides: z
    .object({
      reduceMotion: z.boolean().optional(),
      simplifyOverlays: z.boolean().optional(),
      suppressMusic: z.boolean().optional(),
      preferredVisualProviders: z.array(z.string().trim().min(1)).min(1).optional(),
    })
    .refine(
      (overrides) =>
        Boolean(
          overrides.reduceMotion ||
            overrides.simplifyOverlays ||
            overrides.suppressMusic ||
            (overrides.preferredVisualProviders?.length ?? 0) > 0,
        ),
      "At least one override target is required.",
    ),
  changedAt: z.string().trim().min(1),
  changedSource: z.string().trim().min(1),
  changeNote: z.string().trim().min(1).nullable().default(null),
});

export const promptOverrideStoreSchema = z.object({
  updatedAt: z.string().trim().nullable().default(null),
  rules: z.array(promptOverrideRuleSchema).default([]),
});

export type PromptOverrideRule = z.infer<typeof promptOverrideRuleSchema>;
export type PromptOverrideStore = z.infer<typeof promptOverrideStoreSchema>;

export type PromptOverrideResolution = {
  appliedRules: PromptOverrideRule[];
  appliedRuleIds: string[];
  painPointCategory: z.infer<typeof promptOverrideCategorySchema>;
  effectiveDefaults: ProductionDefaults;
  overlayMode: "default" | "simple";
};

type PromptOverrideContext = {
  painPointCategory: z.infer<typeof promptOverrideCategorySchema>;
  trustRisk: ContentOpportunity["trustRisk"];
  trustStatus: z.infer<typeof trustAssessmentSchema>["status"];
  briefFormat: VideoBrief["format"];
  reasonCodes: z.infer<typeof factoryReviewReasonCodeSchema>[];
  qualityFailureCodes: string[];
  performanceEventTypes: z.infer<typeof performanceSignalSchema>["eventType"][];
};

function buildDefaultStore(): PromptOverrideStore {
  return promptOverrideStoreSchema.parse({
    updatedAt: null,
    rules: [],
  });
}

function normalizeStore(store: PromptOverrideStore): PromptOverrideStore {
  return promptOverrideStoreSchema.parse({
    updatedAt: store.updatedAt,
    rules: [...store.rules]
      .map((rule) => promptOverrideRuleSchema.parse(rule))
      .sort(
        (left, right) =>
          left.priority - right.priority ||
          left.changedAt.localeCompare(right.changedAt) ||
          left.id.localeCompare(right.id),
      ),
  });
}

function readPersistedStoreSync(): PromptOverrideStore {
  try {
    const raw = readFileSync(promptOverrideStorePath(), "utf8");
    return normalizeStore(promptOverrideStoreSchema.parse(JSON.parse(raw)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return buildDefaultStore();
    }

    throw error;
  }
}

async function writePersistedStore(store: PromptOverrideStore): Promise<void> {
  const storePath = promptOverrideStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(
    storePath,
    `${JSON.stringify(normalizeStore(store), null, 2)}\n`,
    "utf8",
  );
}

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function includesAny(haystack: string[], needles: string[] | undefined) {
  if (!needles || needles.length === 0) {
    return true;
  }

  return needles.some((needle) => haystack.includes(needle));
}

function derivePainPointCategory(
  opportunity: Pick<
    ContentOpportunity,
    "title" | "primaryPainPoint" | "teacherLanguage" | "whyNow"
  >,
): z.infer<typeof promptOverrideCategorySchema> {
  const combined = normalizeText(
    [
      opportunity.title,
      opportunity.primaryPainPoint,
      opportunity.whyNow,
      ...opportunity.teacherLanguage,
    ].join(" "),
  );

  if (
    combined.includes("parent") &&
    (combined.includes("complaint") ||
      combined.includes("email") ||
      combined.includes("message"))
  ) {
    return "parent-complaint-emails";
  }

  if (
    combined.includes("angry") ||
    combined.includes("upset") ||
    combined.includes("escalat") ||
    combined.includes("emotion")
  ) {
    return "emotionally-charged-reply";
  }

  if (
    combined.includes("report card") ||
    combined.includes("comment writing") ||
    combined.includes("grading comment")
  ) {
    return "report-card-comments";
  }

  return "general-teacher-communication";
}

function collectReasonCodes(
  opportunity: Pick<ContentOpportunity, "generationState">,
) {
  const reasonCodes = new Set<z.infer<typeof factoryReviewReasonCodeSchema>>();
  const generationState = opportunity.generationState;

  for (const entry of generationState?.runLedger ?? []) {
    for (const reasonCode of entry.regenerationReasonCodes ?? []) {
      reasonCodes.add(reasonCode);
    }
    for (const reasonCode of entry.decisionStructuredReasons ?? []) {
      reasonCodes.add(reasonCode);
    }
  }

  for (const reasonCode of generationState?.renderJob?.regenerationReasonCodes ?? []) {
    reasonCodes.add(reasonCode);
  }

  for (const reasonCode of generationState?.assetReview?.structuredReasons ?? []) {
    reasonCodes.add(reasonCode);
  }

  return [...reasonCodes];
}

function collectQualityFailureCodes(
  opportunity: Pick<ContentOpportunity, "generationState">,
) {
  const codes = new Set<string>();
  const generationState = opportunity.generationState;

  for (const failure of generationState?.latestQualityCheck?.failures ?? []) {
    codes.add(failure.code);
  }

  for (const failure of generationState?.renderJob?.qualityCheck?.failures ?? []) {
    codes.add(failure.code);
  }

  for (const entry of generationState?.runLedger ?? []) {
    for (const failure of entry.qualityCheck?.failures ?? []) {
      codes.add(failure.code);
    }
  }

  return [...codes];
}

function collectPerformanceEventTypes(
  opportunity: Pick<ContentOpportunity, "generationState">,
) {
  return Array.from(
    new Set(
      (opportunity.generationState?.performanceSignals ?? []).map(
        (signal) => signal.eventType,
      ),
    ),
  );
}

function buildPromptOverrideContext(input: {
  opportunity: ContentOpportunity;
  brief: VideoBrief;
}): PromptOverrideContext {
  return {
    painPointCategory: derivePainPointCategory(input.opportunity),
    trustRisk: input.opportunity.trustRisk,
    trustStatus: evaluateOpportunityTrust(input.opportunity).status,
    briefFormat: input.brief.format,
    reasonCodes: collectReasonCodes(input.opportunity),
    qualityFailureCodes: collectQualityFailureCodes(input.opportunity),
    performanceEventTypes: collectPerformanceEventTypes(input.opportunity),
  };
}

function matchesRule(
  rule: PromptOverrideRule,
  context: PromptOverrideContext,
) {
  if (!rule.isActive) {
    return false;
  }

  if (
    rule.conditions.painPointCategories &&
    !rule.conditions.painPointCategories.includes(context.painPointCategory)
  ) {
    return false;
  }

  if (
    rule.conditions.trustRisks &&
    !rule.conditions.trustRisks.includes(context.trustRisk)
  ) {
    return false;
  }

  if (
    rule.conditions.trustStatuses &&
    !rule.conditions.trustStatuses.includes(context.trustStatus)
  ) {
    return false;
  }

  if (
    rule.conditions.briefFormats &&
    !rule.conditions.briefFormats.includes(context.briefFormat)
  ) {
    return false;
  }

  if (!includesAny(context.reasonCodes, rule.conditions.reasonCodesAnyOf)) {
    return false;
  }

  if (
    !includesAny(context.qualityFailureCodes, rule.conditions.qualityFailureCodesAnyOf)
  ) {
    return false;
  }

  if (
    !includesAny(
      context.performanceEventTypes,
      rule.conditions.performanceEventTypesAnyOf,
    )
  ) {
    return false;
  }

  return true;
}

function reducedMotionStyle(current: string) {
  const normalized = current.trim();
  if (
    normalized.toLowerCase().includes("minimal movement") ||
    normalized.toLowerCase().includes("extra hold time")
  ) {
    return normalized;
  }

  return "Minimal movement, longer holds, and extra readable pacing.";
}

function reorderPreferredProviders(
  currentOrder: string[],
  preferredProviders: string[],
) {
  const normalizedCurrent = Array.from(
    new Set(currentOrder.filter((provider) => provider.trim().length > 0)),
  );
  const preferred = preferredProviders.filter(
    (provider) => normalizedCurrent.includes(provider),
  );
  const remaining = normalizedCurrent.filter(
    (provider) => !preferred.includes(provider),
  );

  return [...preferred, ...remaining];
}

function simplifyOverlayText(value: string) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  const stripped = collapsed.replace(/[.!?]+$/g, "");
  const words = stripped.split(" ").filter(Boolean).slice(0, 4);
  const simplified = words.join(" ").trim();

  if (simplified.length <= 28) {
    return simplified;
  }

  return simplified.slice(0, 28).trimEnd();
}

export function listPromptOverrideRules(): PromptOverrideRule[] {
  return readPersistedStoreSync().rules.map((rule) => promptOverrideRuleSchema.parse(rule));
}

export async function upsertPromptOverrideRule(
  rule: PromptOverrideRule,
): Promise<PromptOverrideRule> {
  const store = readPersistedStoreSync();
  const parsedRule = promptOverrideRuleSchema.parse(rule);
  const nextRules = [
    parsedRule,
    ...store.rules.filter((currentRule) => currentRule.id !== parsedRule.id),
  ];

  await writePersistedStore({
    updatedAt: parsedRule.changedAt,
    rules: nextRules,
  });

  return parsedRule;
}

export function resolvePromptOverrideResolution(input: {
  opportunity: ContentOpportunity;
  brief: VideoBrief;
  defaultsSnapshot: ProductionDefaults;
}): PromptOverrideResolution {
  const context = buildPromptOverrideContext({
    opportunity: input.opportunity,
    brief: input.brief,
  });
  const matchingRules = listPromptOverrideRules().filter((rule) =>
    matchesRule(rule, context),
  );
  let effectiveDefaults = productionDefaultsSchema.parse(input.defaultsSnapshot);
  let overlayMode: PromptOverrideResolution["overlayMode"] = "default";

  for (const rule of matchingRules) {
    if (rule.overrides.reduceMotion) {
      effectiveDefaults = productionDefaultsSchema.parse({
        ...effectiveDefaults,
        motionStyle: reducedMotionStyle(effectiveDefaults.motionStyle),
      });
    }

    if (rule.overrides.suppressMusic) {
      effectiveDefaults = productionDefaultsSchema.parse({
        ...effectiveDefaults,
        compositionDefaults: {
          ...effectiveDefaults.compositionDefaults,
          musicMode: "none",
        },
      });
    }

    if (
      rule.overrides.preferredVisualProviders &&
      rule.overrides.preferredVisualProviders.length > 0
    ) {
      effectiveDefaults = productionDefaultsSchema.parse({
        ...effectiveDefaults,
        providerFallbacks: {
          ...effectiveDefaults.providerFallbacks,
          visuals: reorderPreferredProviders(
            effectiveDefaults.providerFallbacks.visuals,
            rule.overrides.preferredVisualProviders,
          ),
        },
      });
    }

    if (rule.overrides.simplifyOverlays) {
      overlayMode = "simple";
    }
  }

  return {
    appliedRules: matchingRules,
    appliedRuleIds: matchingRules.map((rule) => rule.id),
    painPointCategory: context.painPointCategory,
    effectiveDefaults,
    overlayMode,
  };
}

export function applyPromptOverrideScenePrompts(input: {
  scenePrompts: ScenePrompt[];
  resolution: PromptOverrideResolution;
}): ScenePrompt[] {
  if (input.resolution.overlayMode !== "simple") {
    return input.scenePrompts;
  }

  return input.scenePrompts.map((scenePrompt) => {
    if (!scenePrompt.overlayText) {
      return scenePrompt;
    }

    const simplifiedOverlay = simplifyOverlayText(scenePrompt.overlayText);
    if (!simplifiedOverlay || simplifiedOverlay === scenePrompt.overlayText) {
      return scenePrompt;
    }

    return scenePromptSchema.parse({
      ...scenePrompt,
      overlayText: simplifiedOverlay,
      visualPrompt: scenePrompt.visualPrompt.replace(
        `Overlay text: "${scenePrompt.overlayText}"`,
        `Overlay text: "${simplifiedOverlay}"`,
      ),
    });
  });
}
