import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { CampaignStrategy } from "@/lib/campaigns";
import { getSignalContentContextSummary } from "@/lib/campaigns";
import type { PostingLogEntry, PostingPlatform } from "@/lib/posting-memory";
import { getPostingPlatformLabel, POSTING_PLATFORMS } from "@/lib/posting-memory";
import { EDITORIAL_MODE_DEFINITIONS } from "@/lib/editorial-modes";
import {
  EDITORIAL_MODES,
  FUNNEL_STAGES,
  type EditorialMode,
  type FunnelStage,
  type SignalRecord,
} from "@/types/signal";

export const WEEKLY_PLAN_PRIORITY_VALUES = [0, 1, 2, 3] as const;
export const WEEKLY_PLAN_CONTENT_SOURCES = ["freshSignals", "evergreen", "reusedHighPerformers"] as const;
export const WEEKLY_PLAN_PLAN_SOURCES = ["manual", "auto_draft"] as const;
export const WEEKLY_PLAN_PLANNING_CONFIDENCE_LEVELS = ["high", "moderate", "low"] as const;
export const WEEKLY_PLAN_TEMPLATE_IDS = [
  "balanced_mix",
  "awareness_push",
  "lead_generation",
  "campaign_heavy",
] as const;

export type WeeklyPlanPriority = (typeof WEEKLY_PLAN_PRIORITY_VALUES)[number];
export type WeeklyPlanContentSourceKey = (typeof WEEKLY_PLAN_CONTENT_SOURCES)[number];
export type WeeklyPlanPlanSource = (typeof WEEKLY_PLAN_PLAN_SOURCES)[number];
export type WeeklyPlanPlanningConfidence = (typeof WEEKLY_PLAN_PLANNING_CONFIDENCE_LEVELS)[number];
export type WeeklyPlanTemplateId = (typeof WEEKLY_PLAN_TEMPLATE_IDS)[number];

export const WEEKLY_PLAN_PRIORITY_LABELS: Record<WeeklyPlanPriority, string> = {
  0: "Off",
  1: "Light",
  2: "Balanced",
  3: "Priority",
};

export const WEEKLY_PLAN_PRIORITY_DESCRIPTIONS: Record<WeeklyPlanPriority, string> = {
  0: "Not a focus this week.",
  1: "Useful if it fits naturally.",
  2: "Keep a steady presence.",
  3: "Actively fill this this week.",
};

export const WEEKLY_PLAN_CONTENT_SOURCE_LABELS: Record<WeeklyPlanContentSourceKey, string> = {
  freshSignals: "Fresh signals",
  evergreen: "Evergreen",
  reusedHighPerformers: "Reused high performers",
};

export const WEEKLY_PLAN_FUNNEL_LABELS: Record<FunnelStage, string> = {
  Awareness: "Awareness",
  Trust: "Trust",
  Consideration: "Consideration / lead intent",
  Conversion: "Conversion",
  Retention: "Retention",
};

const prioritySchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

const funnelMixSchema = z.object({
  Awareness: prioritySchema,
  Trust: prioritySchema,
  Consideration: prioritySchema,
  Conversion: prioritySchema,
  Retention: prioritySchema,
});

const modeMixSchema = z.object(
  Object.fromEntries(EDITORIAL_MODES.map((mode) => [mode, prioritySchema])) as Record<EditorialMode, typeof prioritySchema>,
);

const contentSourceMixSchema = z.object({
  freshSignals: prioritySchema,
  evergreen: prioritySchema,
  reusedHighPerformers: prioritySchema,
});

const planningConfidenceSchema = z.enum(WEEKLY_PLAN_PLANNING_CONFIDENCE_LEVELS);

const weeklyPlanSchema = z.object({
  id: z.string().trim().min(1),
  weekStartDate: z.string().trim().min(1),
  theme: z.string().trim().nullable(),
  goals: z.array(z.string().trim().min(1)).max(8),
  activeCampaignIds: z.array(z.string().trim().min(1)).max(10),
  targetPlatforms: z.array(z.enum(POSTING_PLATFORMS)).max(3),
  targetFunnelMix: funnelMixSchema,
  targetModeMix: modeMixSchema,
  targetContentSources: contentSourceMixSchema,
  notes: z.string().trim().nullable(),
  planSource: z.enum(WEEKLY_PLAN_PLAN_SOURCES).default("manual"),
  proposalReasons: z.array(z.string().trim().min(1)).max(8).default([]),
  identifiedGaps: z.array(z.string().trim().min(1)).max(8).default([]),
  planningConfidence: planningConfidenceSchema.nullable().default(null),
  autoDraftGeneratedAt: z.string().trim().nullable().default(null),
  autoDraftAcceptedAt: z.string().trim().nullable().default(null),
  autoDraftAcceptedWithEdits: z.boolean().default(false),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

const weeklyPlanStoreSchema = z.object({
  plans: z.array(weeklyPlanSchema),
  updatedAt: z.string().trim().min(1),
});

export const weeklyPlanInputSchema = z.object({
  weekStartDate: z.string().trim().min(1),
  theme: z.string().trim().nullable().optional(),
  goals: z.array(z.string().trim().min(1)).max(8).optional(),
  activeCampaignIds: z.array(z.string().trim().min(1)).max(10).optional(),
  targetPlatforms: z.array(z.enum(POSTING_PLATFORMS)).max(3).optional(),
  targetFunnelMix: funnelMixSchema.optional(),
  targetModeMix: modeMixSchema.optional(),
  targetContentSources: contentSourceMixSchema.optional(),
  notes: z.string().trim().nullable().optional(),
  planSource: z.enum(WEEKLY_PLAN_PLAN_SOURCES).optional(),
  proposalReasons: z.array(z.string().trim().min(1)).max(8).optional(),
  identifiedGaps: z.array(z.string().trim().min(1)).max(8).optional(),
  planningConfidence: planningConfidenceSchema.nullable().optional(),
  autoDraftGeneratedAt: z.string().trim().nullable().optional(),
  autoDraftAcceptedAt: z.string().trim().nullable().optional(),
  autoDraftAcceptedWithEdits: z.boolean().optional(),
});

const WEEKLY_PLAN_STORE_PATH = path.join(process.cwd(), "data", "weekly-plan.json");

export type WeeklyPlan = z.infer<typeof weeklyPlanSchema>;
export type WeeklyPlanInput = z.infer<typeof weeklyPlanInputSchema>;
export type WeeklyPlanStore = z.infer<typeof weeklyPlanStoreSchema>;

export interface WeeklyPlanTemplate {
  id: WeeklyPlanTemplateId;
  label: string;
  description: string;
  theme: string | null;
  goals: string[];
  targetPlatforms: PostingPlatform[];
  targetFunnelMix: Record<FunnelStage, WeeklyPlanPriority>;
  targetModeMix: Record<EditorialMode, WeeklyPlanPriority>;
  targetContentSources: Record<WeeklyPlanContentSourceKey, WeeklyPlanPriority>;
}

export interface WeeklyPlanRow {
  key: string;
  label: string;
  target: WeeklyPlanPriority;
  actualCount: number;
  status: "aligned" | "gap" | "overrepresented" | "neutral";
}

export interface WeeklyPlanAlignment {
  scoreDelta: number;
  boosts: string[];
  cautions: string[];
  summary: string;
}

export interface WeeklyPlanState {
  plan: WeeklyPlan;
  weekLabel: string;
  activeCampaignNames: string[];
  platformRows: WeeklyPlanRow[];
  funnelRows: WeeklyPlanRow[];
  modeRows: WeeklyPlanRow[];
  contentSourceRows: WeeklyPlanRow[];
  campaignRows: Array<{ id: string; label: string; actualCount: number; missing: boolean }>;
  gaps: string[];
  summaries: string[];
}

export interface WeeklyPlanInsights {
  currentPlan: WeeklyPlan | null;
  currentState: WeeklyPlanState | null;
  currentPlanSource: WeeklyPlanPlanSource | null;
  autoDraftPlanCount: number;
  acceptedAutoDraftCount: number;
  editedAutoDraftCount: number;
  commonAdjustmentTriggers: string[];
  effectivenessRows: Array<{
    weekLabel: string;
    theme: string | null;
    highValueCount: number;
    leadTotal: number;
    topPlatformLabel: string | null;
  }>;
}

function startOfWeek(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function formatWeekStart(date: Date): string {
  return startOfWeek(date).toISOString().slice(0, 10);
}

function sanitizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function createDefaultPriorityMap<T extends string>(keys: readonly T[], defaults: Partial<Record<T, WeeklyPlanPriority>> = {}): Record<T, WeeklyPlanPriority> {
  return Object.fromEntries(keys.map((key) => [key, defaults[key] ?? 0])) as Record<T, WeeklyPlanPriority>;
}

export const WEEKLY_PLAN_TEMPLATES: WeeklyPlanTemplate[] = [
  {
    id: "balanced_mix",
    label: "Balanced mix",
    description: "Keep a healthy spread across platforms, trust content, and practical execution.",
    theme: "Balanced weekly mix",
    goals: ["Keep the queue balanced across trust and awareness.", "Maintain at least one campaign-supporting post."],
    targetPlatforms: ["linkedin", "x", "reddit"],
    targetFunnelMix: {
      Awareness: 2,
      Trust: 3,
      Consideration: 1,
      Conversion: 1,
      Retention: 1,
    },
    targetModeMix: createDefaultPriorityMap(EDITORIAL_MODES, {
      helpful_tip: 3,
      professional_guidance: 2,
      calm_insight: 2,
      risk_warning: 1,
    }),
    targetContentSources: {
      freshSignals: 3,
      evergreen: 2,
      reusedHighPerformers: 1,
    },
  },
  {
    id: "awareness_push",
    label: "Awareness push week",
    description: "Lean into sharper awareness and risk framing while keeping trust content visible.",
    theme: "Awareness push",
    goals: ["Increase reach and problem visibility.", "Keep enough trust content to avoid one-note output."],
    targetPlatforms: ["linkedin", "x"],
    targetFunnelMix: {
      Awareness: 3,
      Trust: 2,
      Consideration: 1,
      Conversion: 0,
      Retention: 0,
    },
    targetModeMix: createDefaultPriorityMap(EDITORIAL_MODES, {
      awareness: 3,
      risk_warning: 3,
      this_could_happen_to_you: 2,
      helpful_tip: 1,
    }),
    targetContentSources: {
      freshSignals: 3,
      evergreen: 1,
      reusedHighPerformers: 0,
    },
  },
  {
    id: "lead_generation",
    label: "Lead generation week",
    description: "Shift toward consideration and conversion without losing credibility.",
    theme: "Lead-generation push",
    goals: ["Move more output toward product intent.", "Keep conversion content grounded in real teacher problems."],
    targetPlatforms: ["linkedin", "x"],
    targetFunnelMix: {
      Awareness: 1,
      Trust: 2,
      Consideration: 3,
      Conversion: 2,
      Retention: 0,
    },
    targetModeMix: createDefaultPriorityMap(EDITORIAL_MODES, {
      professional_guidance: 3,
      thought_leadership: 2,
      helpful_tip: 2,
      calm_insight: 1,
    }),
    targetContentSources: {
      freshSignals: 2,
      evergreen: 2,
      reusedHighPerformers: 2,
    },
  },
  {
    id: "campaign_heavy",
    label: "Campaign-heavy week",
    description: "Support active campaigns first while still preserving enough mix to avoid fatigue.",
    theme: "Campaign support week",
    goals: ["Make active campaigns visible across the week.", "Avoid overloading one funnel stage or one platform."],
    targetPlatforms: ["linkedin", "x", "reddit"],
    targetFunnelMix: {
      Awareness: 2,
      Trust: 2,
      Consideration: 2,
      Conversion: 1,
      Retention: 0,
    },
    targetModeMix: createDefaultPriorityMap(EDITORIAL_MODES, {
      helpful_tip: 2,
      professional_guidance: 2,
      awareness: 2,
      thought_leadership: 1,
    }),
    targetContentSources: {
      freshSignals: 2,
      evergreen: 1,
      reusedHighPerformers: 1,
    },
  },
];

function buildPlanFromTemplate(template: WeeklyPlanTemplate, strategy: CampaignStrategy, weekStartDate: string): WeeklyPlan {
  const activeCampaignIds = strategy.campaigns
    .filter((campaign) => campaign.status === "active")
    .slice(0, 3)
    .map((campaign) => campaign.id);
  const timestamp = new Date().toISOString();

  return weeklyPlanSchema.parse({
    id: `weekly-plan-${weekStartDate}`,
    weekStartDate,
    theme: template.theme,
    goals: template.goals,
    activeCampaignIds,
    targetPlatforms: template.targetPlatforms,
    targetFunnelMix: template.targetFunnelMix,
    targetModeMix: template.targetModeMix,
    targetContentSources: template.targetContentSources,
    notes: null,
    planSource: "manual",
    proposalReasons: [],
    identifiedGaps: [],
    planningConfidence: null,
    autoDraftGeneratedAt: null,
    autoDraftAcceptedAt: null,
    autoDraftAcceptedWithEdits: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function buildDefaultWeeklyPlan(strategy: CampaignStrategy, weekStartDate = formatWeekStart(new Date())): WeeklyPlan {
  return buildPlanFromTemplate(WEEKLY_PLAN_TEMPLATES[0], strategy, weekStartDate);
}

async function readPersistedWeeklyPlanStore(): Promise<WeeklyPlanStore | null> {
  try {
    const raw = await readFile(WEEKLY_PLAN_STORE_PATH, "utf8");
    return weeklyPlanStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function writeWeeklyPlanStore(store: WeeklyPlanStore): Promise<void> {
  await mkdir(path.dirname(WEEKLY_PLAN_STORE_PATH), { recursive: true });
  await writeFile(WEEKLY_PLAN_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function getWeeklyPlanStore(strategy: CampaignStrategy): Promise<WeeklyPlanStore> {
  const existing = await readPersistedWeeklyPlanStore();
  if (existing) {
    return existing;
  }

  const defaultPlan = buildDefaultWeeklyPlan(strategy);
  return weeklyPlanStoreSchema.parse({
    plans: [defaultPlan],
    updatedAt: defaultPlan.updatedAt,
  });
}

export async function getCurrentWeeklyPlan(strategy: CampaignStrategy, now = new Date()): Promise<WeeklyPlan> {
  const weekStartDate = formatWeekStart(now);
  const store = await getWeeklyPlanStore(strategy);
  const existing = store.plans.find((plan) => plan.weekStartDate === weekStartDate);

  if (existing) {
    return existing;
  }

  const nextPlan = buildDefaultWeeklyPlan(strategy, weekStartDate);
  const nextStore = weeklyPlanStoreSchema.parse({
    plans: [...store.plans, nextPlan].sort((left, right) => right.weekStartDate.localeCompare(left.weekStartDate)),
    updatedAt: new Date().toISOString(),
  });
  await writeWeeklyPlanStore(nextStore);
  return nextPlan;
}

export async function upsertWeeklyPlan(strategy: CampaignStrategy, input: WeeklyPlanInput): Promise<WeeklyPlan> {
  const store = await getWeeklyPlanStore(strategy);
  const existing = store.plans.find((plan) => plan.weekStartDate === input.weekStartDate);
  const timestamp = new Date().toISOString();
  const base = existing ?? buildDefaultWeeklyPlan(strategy, input.weekStartDate);
  const plan = weeklyPlanSchema.parse({
    ...base,
    weekStartDate: input.weekStartDate,
    theme: sanitizeOptionalText(input.theme ?? base.theme),
    goals: (input.goals ?? base.goals).map((goal) => goal.trim()).filter(Boolean),
    activeCampaignIds: input.activeCampaignIds ?? base.activeCampaignIds,
    targetPlatforms: input.targetPlatforms ?? base.targetPlatforms,
    targetFunnelMix: input.targetFunnelMix ?? base.targetFunnelMix,
    targetModeMix: input.targetModeMix ?? base.targetModeMix,
    targetContentSources: input.targetContentSources ?? base.targetContentSources,
    notes: sanitizeOptionalText(input.notes ?? base.notes),
    planSource: input.planSource ?? base.planSource,
    proposalReasons: input.proposalReasons ?? base.proposalReasons,
    identifiedGaps: input.identifiedGaps ?? base.identifiedGaps,
    planningConfidence:
      input.planningConfidence !== undefined ? input.planningConfidence : base.planningConfidence,
    autoDraftGeneratedAt:
      input.autoDraftGeneratedAt !== undefined ? input.autoDraftGeneratedAt : base.autoDraftGeneratedAt,
    autoDraftAcceptedAt:
      input.autoDraftAcceptedAt !== undefined ? input.autoDraftAcceptedAt : base.autoDraftAcceptedAt,
    autoDraftAcceptedWithEdits:
      input.autoDraftAcceptedWithEdits !== undefined
        ? input.autoDraftAcceptedWithEdits
        : base.autoDraftAcceptedWithEdits,
    updatedAt: timestamp,
  });

  const nextStore = weeklyPlanStoreSchema.parse({
    plans: [
      plan,
      ...store.plans.filter((item) => item.weekStartDate !== plan.weekStartDate),
    ].sort((left, right) => right.weekStartDate.localeCompare(left.weekStartDate)),
    updatedAt: timestamp,
  });

  await writeWeeklyPlanStore(nextStore);
  return plan;
}

function isDateInWeek(value: string | null | undefined, weekStart: Date, weekEnd: Date): boolean {
  if (!value) {
    return false;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && parsed >= weekStart.getTime() && parsed < weekEnd.getTime();
}

export function classifySignalWeeklySource(signal: SignalRecord): WeeklyPlanContentSourceKey {
  const created = new Date(signal.createdDate).getTime();
  const ageDays = Number.isFinite(created) ? Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000)) : 0;
  const evergreenHint = `${signal.sourceType ?? ""} ${signal.evergreenPotential ?? ""} ${signal.repurposeIdeas ?? ""}`.toLowerCase();

  if (signal.repeatablePattern || /evergreen|reusable|repeat|pillar/i.test(evergreenHint)) {
    return "reusedHighPerformers";
  }

  if (
    ageDays >= 21 ||
    signal.sourceType === "Internal Note" ||
    signal.sourceType === "Support Ticket" ||
    signal.sourceType === "Customer Call"
  ) {
    return "evergreen";
  }

  return "freshSignals";
}

function formatWeekLabel(weekStartDate: string): string {
  const start = new Date(`${weekStartDate}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const formatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function countMap<T extends string>(values: T[]): Map<T, number> {
  const map = new Map<T, number>();
  for (const value of values) {
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return map;
}

function rowStatus(target: WeeklyPlanPriority, actualCount: number): WeeklyPlanRow["status"] {
  if (target >= 2 && actualCount === 0) {
    return "gap";
  }

  if (target <= 1 && actualCount >= 3) {
    return "overrepresented";
  }

  if (target > 0 && actualCount > 0) {
    return "aligned";
  }

  return "neutral";
}

function uniquePush(target: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

export function buildWeeklyPlanState(
  plan: WeeklyPlan,
  strategy: CampaignStrategy,
  signals: SignalRecord[],
  postingEntries: PostingLogEntry[],
): WeeklyPlanState {
  const weekStart = new Date(`${plan.weekStartDate}T00:00:00Z`);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const relevantSignals = signals.filter(
    (signal) =>
      isDateInWeek(signal.createdDate, weekStart, weekEnd) ||
      isDateInWeek(signal.postedDate, weekStart, weekEnd) ||
      (signal.finalReviewedAt && isDateInWeek(signal.finalReviewedAt, weekStart, weekEnd)),
  );
  const relevantSignalIds = new Set(relevantSignals.map((signal) => signal.recordId));
  const relevantPostingEntries = postingEntries.filter(
    (entry) => isDateInWeek(entry.postedAt, weekStart, weekEnd) || relevantSignalIds.has(entry.signalId),
  );

  const platformCounts = countMap(
    relevantPostingEntries.map((entry) => entry.platform).filter((platform): platform is PostingPlatform => Boolean(platform)),
  );
  const funnelCounts = countMap(
    relevantSignals.map((signal) => signal.funnelStage).filter((stage): stage is FunnelStage => Boolean(stage)),
  );
  const modeCounts = countMap(
    relevantSignals.map((signal) => signal.editorialMode).filter((mode): mode is EditorialMode => Boolean(mode)),
  );
  const sourceCounts = countMap(relevantSignals.map((signal) => classifySignalWeeklySource(signal)));
  const campaignCounts = countMap(
    relevantSignals.map((signal) => signal.campaignId).filter((campaignId): campaignId is string => Boolean(campaignId)),
  );

  const platformRows = POSTING_PLATFORMS.map((platform) => {
    const target = (plan.targetPlatforms.includes(platform) ? 3 : 1) as WeeklyPlanPriority;

    return {
      key: platform,
      label: getPostingPlatformLabel(platform),
      target,
      actualCount: platformCounts.get(platform) ?? 0,
      status: rowStatus(target, platformCounts.get(platform) ?? 0),
    };
  });
  const funnelRows = FUNNEL_STAGES.map((stage) => ({
    key: stage,
    label: WEEKLY_PLAN_FUNNEL_LABELS[stage],
    target: plan.targetFunnelMix[stage],
    actualCount: funnelCounts.get(stage) ?? 0,
    status: rowStatus(plan.targetFunnelMix[stage], funnelCounts.get(stage) ?? 0),
  }));
  const modeRows = EDITORIAL_MODES.map((mode) => ({
    key: mode,
    label: EDITORIAL_MODE_DEFINITIONS[mode].label,
    target: plan.targetModeMix[mode],
    actualCount: modeCounts.get(mode) ?? 0,
    status: rowStatus(plan.targetModeMix[mode], modeCounts.get(mode) ?? 0),
  }));
  const contentSourceRows = WEEKLY_PLAN_CONTENT_SOURCES.map((sourceKey) => ({
    key: sourceKey,
    label: WEEKLY_PLAN_CONTENT_SOURCE_LABELS[sourceKey],
    target: plan.targetContentSources[sourceKey],
    actualCount: sourceCounts.get(sourceKey) ?? 0,
    status: rowStatus(plan.targetContentSources[sourceKey], sourceCounts.get(sourceKey) ?? 0),
  }));
  const campaignRows = plan.activeCampaignIds.map((campaignId) => {
    const campaign = strategy.campaigns.find((item) => item.id === campaignId);

    return {
      id: campaignId,
      label: campaign?.name ?? campaignId,
      actualCount: campaignCounts.get(campaignId) ?? 0,
      missing: (campaignCounts.get(campaignId) ?? 0) === 0,
    };
  });

  const gaps: string[] = [];
  for (const row of funnelRows) {
    if (row.status === "gap") {
      uniquePush(gaps, `No ${row.label.toLowerCase()} content has surfaced yet this week.`);
    }
  }
  for (const row of platformRows) {
    if (row.status === "gap") {
      uniquePush(gaps, `No ${row.label} content is prepared yet for this week.`);
    }
  }
  for (const row of modeRows.filter((entry) => entry.target >= 2)) {
    if (row.status === "gap") {
      uniquePush(gaps, `${row.label} is planned this week but is not showing up yet.`);
    } else if (row.status === "overrepresented") {
      uniquePush(gaps, `${row.label} is starting to dominate the weekly mix.`);
    }
  }
  for (const row of campaignRows) {
    if (row.missing) {
      uniquePush(gaps, `${row.label} has no supporting content yet this week.`);
    }
  }

  const summaries: string[] = [];
  const firstGapFunnel = funnelRows.find((row) => row.status === "gap");
  if (firstGapFunnel) {
    uniquePush(summaries, `${firstGapFunnel.label} is the clearest weekly funnel gap right now.`);
  }
  const firstGapPlatform = platformRows.find((row) => row.status === "gap");
  if (firstGapPlatform) {
    uniquePush(summaries, `${firstGapPlatform.label} is still missing from the weekly platform mix.`);
  }
  const firstOverMode = modeRows.find((row) => row.status === "overrepresented");
  if (firstOverMode) {
    uniquePush(summaries, `${firstOverMode.label} is currently over-represented against the weekly plan.`);
  }
  if (gaps.length === 0) {
    uniquePush(summaries, "Current weekly mix looks broadly aligned with the plan.");
  }

  return {
    plan,
    weekLabel: formatWeekLabel(plan.weekStartDate),
    activeCampaignNames: campaignRows.map((row) => row.label),
    platformRows,
    funnelRows,
    modeRows,
    contentSourceRows,
    campaignRows,
    gaps: gaps.slice(0, 6),
    summaries: summaries.slice(0, 3),
  };
}

export function getWeeklyPlanAlignment(
  signal: SignalRecord,
  plan: WeeklyPlan | null,
  strategy: CampaignStrategy,
  state?: WeeklyPlanState | null,
): WeeklyPlanAlignment {
  if (!plan) {
    return {
      scoreDelta: 0,
      boosts: [],
      cautions: [],
      summary: "No weekly plan is active.",
    };
  }

  const context = getSignalContentContextSummary(signal, strategy);
  const boosts: string[] = [];
  const cautions: string[] = [];
  let scoreDelta = 0;

  if (context.campaignId && plan.activeCampaignIds.includes(context.campaignId)) {
    scoreDelta += 1;
    uniquePush(boosts, "Supports the current campaign plan");
  } else if (plan.activeCampaignIds.length > 0) {
    uniquePush(cautions, "Does not directly support this week's active campaigns");
  }

  if (context.funnelStage) {
    const target = plan.targetFunnelMix[context.funnelStage];
    const row = state?.funnelRows.find((item) => item.key === context.funnelStage);
    if (target >= 2 && (row?.actualCount ?? 0) === 0) {
      scoreDelta += 1;
      uniquePush(boosts, `Fills the ${WEEKLY_PLAN_FUNNEL_LABELS[context.funnelStage].toLowerCase()} gap`);
    } else if (target === 0) {
      scoreDelta -= 1;
      uniquePush(cautions, `${WEEKLY_PLAN_FUNNEL_LABELS[context.funnelStage]} is not a weekly priority`);
    }
  }

  if (signal.editorialMode) {
    const target = plan.targetModeMix[signal.editorialMode];
    const row = state?.modeRows.find((item) => item.key === signal.editorialMode);
    if (target >= 2 && (row?.actualCount ?? 0) === 0) {
      scoreDelta += 1;
      uniquePush(boosts, `Adds needed ${EDITORIAL_MODE_DEFINITIONS[signal.editorialMode].label} coverage`);
    } else if (row?.status === "overrepresented") {
      scoreDelta -= 1;
      uniquePush(cautions, `${EDITORIAL_MODE_DEFINITIONS[signal.editorialMode].label} is already heavy this week`);
    }
  }

  const suggestedPlatform = signal.platformPriority === "LinkedIn First"
    ? "linkedin"
    : signal.platformPriority === "Reddit First"
      ? "reddit"
      : "x";
  const platformRow = state?.platformRows.find((row) => row.key === suggestedPlatform);
  if (plan.targetPlatforms.includes(suggestedPlatform)) {
    if ((platformRow?.actualCount ?? 0) === 0) {
      scoreDelta += 1;
      uniquePush(boosts, `Helps fill the ${getPostingPlatformLabel(suggestedPlatform)} platform gap`);
    } else {
      uniquePush(boosts, `Aligned to ${getPostingPlatformLabel(suggestedPlatform)} focus`);
    }
  } else if (platformRow?.actualCount && platformRow.actualCount >= 3) {
    scoreDelta -= 1;
    uniquePush(cautions, `${getPostingPlatformLabel(suggestedPlatform)} is already well covered this week`);
  }

  const sourceKey = classifySignalWeeklySource(signal);
  const sourceRow = state?.contentSourceRows.find((row) => row.key === sourceKey);
  if (plan.targetContentSources[sourceKey] >= 2 && (sourceRow?.actualCount ?? 0) === 0) {
    scoreDelta += 1;
    uniquePush(boosts, `Helps rebalance toward ${WEEKLY_PLAN_CONTENT_SOURCE_LABELS[sourceKey].toLowerCase()}`);
  }

  const summary =
    boosts[0] ?? cautions[0] ?? "This item is neutral against the current weekly plan.";

  return {
    scoreDelta,
    boosts: boosts.slice(0, 3),
    cautions: cautions.slice(0, 2),
    summary,
  };
}

export function buildWeeklyPlanInsights(
  plans: WeeklyPlan[],
  strategy: CampaignStrategy,
  signals: SignalRecord[],
  postingEntries: PostingLogEntry[],
  strategicOutcomes: Array<{ signalId: string; postingLogId: string; strategicValue: "high" | "medium" | "low" | "unclear"; leadsOrSignups?: number | null }>,
  now = new Date(),
): WeeklyPlanInsights {
  const currentWeekStart = formatWeekStart(now);
  const currentPlan = plans.find((plan) => plan.weekStartDate === currentWeekStart) ?? null;
  const currentState = currentPlan ? buildWeeklyPlanState(currentPlan, strategy, signals, postingEntries) : null;
  const triggerCounts = new Map<string, number>();

  for (const plan of plans.filter((item) => item.planSource === "auto_draft")) {
    for (const trigger of [...plan.identifiedGaps, ...plan.proposalReasons].slice(0, 5)) {
      triggerCounts.set(trigger, (triggerCounts.get(trigger) ?? 0) + 1);
    }
  }

  const effectivenessRows = plans
    .slice(0, 6)
    .map((plan) => {
      const start = new Date(`${plan.weekStartDate}T00:00:00Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
      const weekPostingEntries = postingEntries.filter((entry) => isDateInWeek(entry.postedAt, start, end));
      const entryIds = new Set(weekPostingEntries.map((entry) => entry.id));
      const weekStrategicOutcomes = strategicOutcomes.filter((outcome) => entryIds.has(outcome.postingLogId));
      const platformCounts = countMap(weekPostingEntries.map((entry) => entry.platform));
      const topPlatform = Array.from(platformCounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;

      return {
        weekLabel: formatWeekLabel(plan.weekStartDate),
        theme: plan.theme,
        highValueCount: weekStrategicOutcomes.filter((outcome) => outcome.strategicValue === "high").length,
        leadTotal: weekStrategicOutcomes.reduce((sum, outcome) => sum + (outcome.leadsOrSignups ?? 0), 0),
        topPlatformLabel: topPlatform ? getPostingPlatformLabel(topPlatform as PostingPlatform) : null,
      };
    })
    .sort((left, right) => right.highValueCount - left.highValueCount || right.leadTotal - left.leadTotal || left.weekLabel.localeCompare(right.weekLabel));

  return {
    currentPlan,
    currentState,
    currentPlanSource: currentPlan?.planSource ?? null,
    autoDraftPlanCount: plans.filter((plan) => plan.planSource === "auto_draft").length,
    acceptedAutoDraftCount: plans.filter((plan) => plan.planSource === "auto_draft" && Boolean(plan.autoDraftAcceptedAt)).length,
    editedAutoDraftCount: plans.filter((plan) => plan.planSource === "auto_draft" && plan.autoDraftAcceptedWithEdits).length,
    commonAdjustmentTriggers: Array.from(triggerCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 4)
      .map(([label]) => label),
    effectivenessRows,
  };
}
