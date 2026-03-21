import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { appendAuditEventsSafe } from "@/lib/audit";
import type { PostingPlatform } from "@/lib/posting-memory";
import { getPostingPlatformLabel } from "@/lib/posting-memory";
import type { SignalRecord } from "@/types/signal";

const FOUNDER_OVERRIDE_STORE_PATH = path.join(
  process.cwd(),
  "data",
  "founder-overrides.json",
);

const FOUNDER_OVERRIDE_AUDIT_SUBJECT = "founder-overrides";

export const FOUNDER_OVERRIDE_TYPES = [
  "temporary_rule",
  "priority_shift",
  "strategic_direction",
] as const;

export const FOUNDER_OVERRIDE_TARGET_AREAS = [
  "platform_priority",
  "experiment_pacing",
  "messaging_focus",
  "conversion_pressure",
  "distribution_strategy",
  "campaign_focus",
  "planning_focus",
] as const;

export const FOUNDER_OVERRIDE_PRIORITIES = ["high", "medium", "low"] as const;
export const FOUNDER_OVERRIDE_STATUSES = ["active", "expired", "removed"] as const;

export type FounderOverrideType = (typeof FOUNDER_OVERRIDE_TYPES)[number];
export type FounderOverrideTargetArea = (typeof FOUNDER_OVERRIDE_TARGET_AREAS)[number];
export type FounderOverridePriority = (typeof FOUNDER_OVERRIDE_PRIORITIES)[number];
export type FounderOverrideStatus = (typeof FOUNDER_OVERRIDE_STATUSES)[number];

export interface FounderOverrideRecord {
  overrideId: string;
  overrideType: FounderOverrideType;
  targetArea: FounderOverrideTargetArea;
  instruction: string;
  duration: string;
  durationHours: number;
  priority: FounderOverridePriority;
  createdAt: string;
  expiresAt: string;
  status: FounderOverrideStatus;
  removedAt: string | null;
}

export interface FounderOverrideState {
  generatedAt: string;
  activeOverrides: FounderOverrideRecord[];
  recentExpiredOverrides: FounderOverrideRecord[];
  topNotes: string[];
  preferredPlatforms: PostingPlatform[];
  experimentDirection: "reduce" | "increase" | null;
  conversionPressureDirection: "increase" | "decrease" | null;
  distributionDirection: "single" | "multi" | null;
  messagingThemes: string[];
  campaignFocusNotes: string[];
}

const founderOverrideSchema = z.object({
  overrideId: z.string().trim().min(1),
  overrideType: z.enum(FOUNDER_OVERRIDE_TYPES),
  targetArea: z.enum(FOUNDER_OVERRIDE_TARGET_AREAS),
  instruction: z.string().trim().min(1),
  duration: z.string().trim().min(1),
  durationHours: z.number().int().min(1).max(24 * 30),
  priority: z.enum(FOUNDER_OVERRIDE_PRIORITIES),
  createdAt: z.string().trim().min(1),
  expiresAt: z.string().trim().min(1),
  status: z.enum(FOUNDER_OVERRIDE_STATUSES),
  removedAt: z.string().trim().nullable(),
});

const founderOverrideStoreSchema = z.object({
  items: z.array(founderOverrideSchema).max(200).default([]),
  updatedAt: z.string().trim().nullable().default(null),
});

type FounderOverrideStore = z.infer<typeof founderOverrideStoreSchema>;

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function toDurationLabel(hours: number) {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }

  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function buildOverrideId(now: Date) {
  return `override-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
}

function lower(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function hasAnyKeyword(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function extractPreferredPlatforms(overrides: FounderOverrideRecord[]) {
  const platforms: PostingPlatform[] = [];

  for (const override of overrides) {
    if (override.targetArea !== "platform_priority" && override.targetArea !== "distribution_strategy") {
      continue;
    }

    const instruction = lower(override.instruction);
    if ((instruction.includes("linkedin") || instruction.includes("linked in")) && !platforms.includes("linkedin")) {
      platforms.push("linkedin");
    }
    if (instruction.includes("reddit") && !platforms.includes("reddit")) {
      platforms.push("reddit");
    }
    if (
      (instruction.includes(" x ") ||
        instruction.startsWith("x ") ||
        instruction.endsWith(" x") ||
        instruction.includes("twitter")) &&
      !platforms.includes("x")
    ) {
      platforms.push("x");
    }
  }

  return platforms;
}

function extractExperimentDirection(overrides: FounderOverrideRecord[]) {
  for (const override of overrides) {
    if (override.targetArea !== "experiment_pacing") {
      continue;
    }

    const instruction = lower(override.instruction);
    if (hasAnyKeyword(instruction, ["reduce", "fewer", "pause", "slow"])) {
      return "reduce" as const;
    }
    if (hasAnyKeyword(instruction, ["increase", "more", "push"])) {
      return "increase" as const;
    }
  }

  return null;
}

function extractConversionDirection(overrides: FounderOverrideRecord[]) {
  for (const override of overrides) {
    if (override.targetArea !== "conversion_pressure") {
      continue;
    }

    const instruction = lower(override.instruction);
    if (hasAnyKeyword(instruction, ["increase", "stronger", "harder", "more"])) {
      return "increase" as const;
    }
    if (hasAnyKeyword(instruction, ["reduce", "soften", "lighter", "less"])) {
      return "decrease" as const;
    }
  }

  return null;
}

function extractDistributionDirection(overrides: FounderOverrideRecord[]) {
  for (const override of overrides) {
    if (override.targetArea !== "distribution_strategy") {
      continue;
    }

    const instruction = lower(override.instruction);
    if (hasAnyKeyword(instruction, ["single", "one platform", "focus one"])) {
      return "single" as const;
    }
    if (hasAnyKeyword(instruction, ["multi", "cross-post", "cross post", "multi-platform"])) {
      return "multi" as const;
    }
  }

  return null;
}

function summarizeOverride(override: FounderOverrideRecord) {
  switch (override.targetArea) {
    case "platform_priority":
      return `Founder override: ${override.instruction}`;
    case "experiment_pacing":
      return `Experiment direction: ${override.instruction}`;
    case "messaging_focus":
      return `Messaging focus: ${override.instruction}`;
    case "conversion_pressure":
      return `Conversion pressure: ${override.instruction}`;
    case "distribution_strategy":
      return `Distribution emphasis: ${override.instruction}`;
    case "campaign_focus":
      return `Campaign focus: ${override.instruction}`;
    case "planning_focus":
    default:
      return `Founder override: ${override.instruction}`;
  }
}

function buildTopNotes(
  activeOverrides: FounderOverrideRecord[],
  recentExpiredOverrides: FounderOverrideRecord[],
) {
  const notes: string[] = [];

  for (const override of activeOverrides.slice(0, 3)) {
    uniquePush(
      notes,
      `${summarizeOverride(override)} (expires ${new Date(override.expiresAt).toLocaleDateString("en-GB")}).`,
    );
  }

  if (!notes[0] && recentExpiredOverrides[0]) {
    uniquePush(notes, `${summarizeOverride(recentExpiredOverrides[0])} has expired.`);
  }

  if (!notes[0]) {
    uniquePush(notes, "No founder overrides are active right now.");
  }

  return notes.slice(0, 4);
}

function buildState(items: FounderOverrideRecord[], now: Date): FounderOverrideState {
  const activeOverrides = items
    .filter((item) => item.status === "active")
    .sort((left, right) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return (
        priorityOrder[right.priority] - priorityOrder[left.priority] ||
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      );
    });
  const recentExpiredOverrides = items
    .filter((item) => item.status === "expired")
    .sort(
      (left, right) =>
        new Date(right.expiresAt).getTime() - new Date(left.expiresAt).getTime(),
    )
    .slice(0, 4);
  const messagingThemes = activeOverrides
    .filter(
      (override) =>
        override.targetArea === "messaging_focus" ||
        override.targetArea === "planning_focus",
    )
    .map((override) => override.instruction)
    .slice(0, 4);
  const campaignFocusNotes = activeOverrides
    .filter((override) => override.targetArea === "campaign_focus")
    .map((override) => override.instruction)
    .slice(0, 4);

  return {
    generatedAt: now.toISOString(),
    activeOverrides,
    recentExpiredOverrides,
    topNotes: buildTopNotes(activeOverrides, recentExpiredOverrides),
    preferredPlatforms: extractPreferredPlatforms(activeOverrides),
    experimentDirection: extractExperimentDirection(activeOverrides),
    conversionPressureDirection: extractConversionDirection(activeOverrides),
    distributionDirection: extractDistributionDirection(activeOverrides),
    messagingThemes,
    campaignFocusNotes,
  };
}

async function readStore(): Promise<FounderOverrideStore> {
  try {
    const raw = await readFile(FOUNDER_OVERRIDE_STORE_PATH, "utf8");
    return founderOverrideStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return founderOverrideStoreSchema.parse({ items: [], updatedAt: null });
    }

    throw error;
  }
}

async function writeStore(store: FounderOverrideStore) {
  await mkdir(path.dirname(FOUNDER_OVERRIDE_STORE_PATH), { recursive: true });
  await writeFile(FOUNDER_OVERRIDE_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function matchFounderOverrideThemesToSignal(
  signal: SignalRecord,
  state: FounderOverrideState | null | undefined,
) {
  if (!state?.messagingThemes.length) {
    return [];
  }

  const haystack = [
    signal.sourceTitle,
    signal.manualSummary,
    signal.contentAngle,
    signal.teacherPainPoint,
    signal.interpretationNotes,
    signal.scenarioAngle,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return state.messagingThemes.filter((theme) => {
    const normalizedTheme = lower(theme);
    if (!normalizedTheme) {
      return false;
    }
    if (haystack.includes(normalizedTheme)) {
      return true;
    }

    const tokens = normalizedTheme
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length >= 4 && !["focus", "week", "this", "with", "more"].includes(token));

    const matchedTokenCount = tokens.filter((token) => haystack.includes(token)).length;
    return matchedTokenCount >= Math.min(2, tokens.length);
  });
}

export function getFounderOverrideGenerationHints(
  state: FounderOverrideState | null | undefined,
  signal?: SignalRecord | null,
) {
  if (!state?.activeOverrides.length) {
    return [];
  }

  const hints: string[] = [];

  for (const override of state.activeOverrides.slice(0, 4)) {
    uniquePush(
      hints,
      `${summarizeOverride(override)} Keep this bounded and only apply it where the current signal clearly supports it.`,
    );
  }

  if (signal) {
    for (const theme of matchFounderOverrideThemesToSignal(signal, state).slice(0, 2)) {
      uniquePush(hints, `This signal matches the current founder messaging focus: ${theme}.`);
    }
  }

  return hints.slice(0, 4);
}

export function getFounderOverrideDistributionAdjustment(
  state: FounderOverrideState | null | undefined,
  platform: PostingPlatform,
) {
  if (!state?.activeOverrides.length) {
    return { scoreDelta: 0, reasons: [] as string[] };
  }

  const reasons: string[] = [];
  let scoreDelta = 0;

  if (state.preferredPlatforms.includes(platform)) {
    scoreDelta += 1.4;
    uniquePush(
      reasons,
      `Founder override currently prioritizes ${getPostingPlatformLabel(platform)}.`,
    );
  }

  if (state.distributionDirection === "single") {
    scoreDelta += 0.2;
    uniquePush(reasons, "Founder override temporarily favors tighter single-platform focus.");
  } else if (state.distributionDirection === "multi") {
    scoreDelta += 0.35;
    uniquePush(reasons, "Founder override temporarily allows broader multi-platform reuse.");
  }

  return {
    scoreDelta,
    reasons,
  };
}

export async function syncFounderOverrideState(input?: {
  now?: Date;
}): Promise<FounderOverrideState> {
  const now = input?.now ?? new Date();
  const store = await readStore();
  const expiredThisRun: FounderOverrideRecord[] = [];
  const nextItems = store.items.map((item) => {
    if (item.status === "active" && new Date(item.expiresAt).getTime() <= now.getTime()) {
      const expired = {
        ...item,
        status: "expired" as const,
      };
      expiredThisRun.push(expired);
      return expired;
    }

    return item;
  });

  if (expiredThisRun.length > 0) {
    await writeStore({
      items: nextItems,
      updatedAt: now.toISOString(),
    });
    await appendAuditEventsSafe(
      expiredThisRun.map((override) => ({
        signalId: FOUNDER_OVERRIDE_AUDIT_SUBJECT,
        eventType: "FOUNDER_OVERRIDE_EXPIRED",
        actor: "system",
        summary: `${summarizeOverride(override)} expired automatically.`,
        metadata: {
          overrideId: override.overrideId,
          targetArea: override.targetArea,
          priority: override.priority,
        },
      })),
    );
  }

  return buildState(nextItems, now);
}

export async function createFounderOverride(input: {
  overrideType: FounderOverrideType;
  targetArea: FounderOverrideTargetArea;
  instruction: string;
  durationHours: number;
  priority: FounderOverridePriority;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const store = await readStore();
  const record: FounderOverrideRecord = {
    overrideId: buildOverrideId(now),
    overrideType: input.overrideType,
    targetArea: input.targetArea,
    instruction: normalizeText(input.instruction),
    duration: toDurationLabel(input.durationHours),
    durationHours: input.durationHours,
    priority: input.priority,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.durationHours * 60 * 60 * 1000).toISOString(),
    status: "active",
    removedAt: null,
  };

  const nextItems = [record, ...store.items].slice(0, 200);
  await writeStore({
    items: nextItems,
    updatedAt: now.toISOString(),
  });
  await appendAuditEventsSafe([
    {
      signalId: FOUNDER_OVERRIDE_AUDIT_SUBJECT,
      eventType: "FOUNDER_OVERRIDE_APPLIED",
      actor: "operator",
      summary: `${summarizeOverride(record)} applied for ${record.duration}.`,
      metadata: {
        overrideId: record.overrideId,
        targetArea: record.targetArea,
        priority: record.priority,
        duration: record.duration,
      },
    },
  ]);

  return buildState(nextItems, now);
}

export async function removeFounderOverride(
  overrideId: string,
  input?: { now?: Date },
) {
  const now = input?.now ?? new Date();
  const store = await readStore();
  const nextItems = store.items.map((item) =>
    item.overrideId === overrideId && item.status === "active"
      ? {
          ...item,
          status: "removed" as const,
          removedAt: now.toISOString(),
        }
      : item,
  );

  await writeStore({
    items: nextItems,
    updatedAt: now.toISOString(),
  });

  return buildState(nextItems, now);
}
