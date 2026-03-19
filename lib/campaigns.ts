import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { PostingLogEntry } from "@/lib/posting-memory";
import { CTA_GOALS, FUNNEL_STAGES, type CtaGoal, type FunnelStage, type SignalRecord } from "@/types/signal";

export const CAMPAIGN_STATUSES = ["active", "inactive"] as const;

export const CAMPAIGN_STATUS_LABELS: Record<(typeof CAMPAIGN_STATUSES)[number], string> = {
  active: "Active",
  inactive: "Inactive",
};

export const FUNNEL_STAGE_DESCRIPTIONS: Record<FunnelStage, string> = {
  Awareness: "Introduce the issue or language gap clearly.",
  Trust: "Show judgement, empathy, and practical usefulness.",
  Consideration: "Connect the situation to a clearer structured approach.",
  Conversion: "Move toward trying the product or taking a concrete next step.",
  Retention: "Support existing users and reinforce repeat value.",
};

export const CTA_GOAL_DESCRIPTIONS: Record<CtaGoal, string> = {
  Awareness: "Raise awareness around a teacher problem or framing.",
  "Visit site": "Encourage a visit to the site or product page.",
  "Sign up": "Encourage sign-up intent.",
  "Try product": "Push toward trying the product directly.",
  "Share / engage": "Encourage discussion, sharing, or saving.",
};

const campaignSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  status: z.enum(CAMPAIGN_STATUSES),
  goal: z.string().trim().nullable(),
  startDate: z.string().trim().nullable(),
  endDate: z.string().trim().nullable(),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

const contentPillarSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

const audienceSegmentSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

const campaignStoreSchema = z.object({
  campaigns: z.array(campaignSchema),
  pillars: z.array(contentPillarSchema),
  audienceSegments: z.array(audienceSegmentSchema),
  updatedAt: z.string().trim().min(1),
});

const contentContextInputSchema = z.object({
  campaignId: z.string().trim().nullable().optional(),
  pillarId: z.string().trim().nullable().optional(),
  audienceSegmentId: z.string().trim().nullable().optional(),
  funnelStage: z.enum(FUNNEL_STAGES).nullable().optional(),
  ctaGoal: z.enum(CTA_GOALS).nullable().optional(),
});

export type Campaign = z.infer<typeof campaignSchema>;
export type ContentPillar = z.infer<typeof contentPillarSchema>;
export type AudienceSegment = z.infer<typeof audienceSegmentSchema>;
export type CampaignStrategy = z.infer<typeof campaignStoreSchema>;
export type ContentContextInput = z.infer<typeof contentContextInputSchema>;

export interface ResolvedContentContext {
  campaignId: string | null;
  campaignName: string | null;
  pillarId: string | null;
  pillarName: string | null;
  audienceSegmentId: string | null;
  audienceSegmentName: string | null;
  funnelStage: FunnelStage | null;
  ctaGoal: CtaGoal | null;
}

export interface ContentContextAssignment {
  context: Required<ContentContextInput>;
  summary: string;
  reasons: string[];
  autoAssignedKeys: Array<keyof ContentContextInput>;
}

export interface CampaignCadenceSummary {
  activeCampaignCount: number;
  recentWindowDays: number;
  recentSignalsCount: number;
  byCampaign: Array<{ id: string; name: string; count: number; recentCount: number; status: Campaign["status"] }>;
  byPillar: Array<{ id: string; name: string; count: number; recentCount: number }>;
  byAudience: Array<{ id: string; name: string; count: number; recentCount: number }>;
  byFunnelStage: Array<{ stage: FunnelStage; count: number; recentCount: number }>;
  underrepresentedPillars: string[];
  underrepresentedFunnels: FunnelStage[];
  activeCampaignNames: string[];
}

export interface CampaignDistributionInsights {
  byCampaign: Array<{ label: string; count: number }>;
  byPillar: Array<{ label: string; count: number }>;
  byFunnelStage: Array<{ label: string; count: number }>;
  missingFunnels: FunnelStage[];
  underrepresentedPillars: string[];
}

const CAMPAIGN_STORE_PATH = path.join(process.cwd(), "data", "campaign-strategy.json");

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function buildKeywordSet(...values: Array<string | null | undefined>): string[] {
  const tokens = values
    .flatMap((value) => normalizeText(value).split(/[^a-z0-9]+/))
    .filter((token) => token.length >= 4 && !["with", "from", "that", "this", "your", "their", "about"].includes(token));

  return Array.from(new Set(tokens));
}

function keywordMatchCount(haystack: string, keywords: string[]): number {
  return keywords.reduce((count, keyword) => (haystack.includes(keyword) ? count + 1 : count), 0);
}

function scoreNamedOption(
  haystack: string,
  option: {
    name: string;
    description?: string | null;
    goal?: string | null;
  },
): number {
  return keywordMatchCount(haystack, buildKeywordSet(option.name, option.description, option.goal));
}

function withTimestamps<T extends Record<string, unknown>>(item: T): T & {
  createdAt: string;
  updatedAt: string;
} {
  const timestamp = new Date().toISOString();
  return {
    ...item,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function sanitizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildDefaultCampaignStrategy(): CampaignStrategy {
  const now = new Date().toISOString();

  return campaignStoreSchema.parse({
    campaigns: [
      withTimestamps({
        id: "campaign_teacher-protection",
        name: "Teacher Protection Push",
        description: "Content that frames documentation, parent communication, and professional risk as situations teachers need safer wording for.",
        status: "active",
        goal: "Build trust around Zaza as practical protection for high-stakes communication.",
        startDate: "2026-03-01",
        endDate: null,
      }),
      withTimestamps({
        id: "campaign_first-week-confidence",
        name: "First Week Confidence",
        description: "Support new or overloaded teachers with calmer practical structure and lower-friction starting points.",
        status: "active",
        goal: "Strengthen awareness and consideration for teachers who feel behind.",
        startDate: "2026-03-10",
        endDate: null,
      }),
      withTimestamps({
        id: "campaign_product-pathways",
        name: "Product Pathways",
        description: "Connect product-led moments to usable teacher outcomes without sounding sales-first.",
        status: "inactive",
        goal: "Support product education and conversion moments when fit is clear.",
        startDate: "2026-02-01",
        endDate: "2026-02-28",
      }),
    ],
    pillars: [
      withTimestamps({
        id: "pillar_teacher-protection",
        name: "Teacher Protection",
        description: "Professional wording, documentation safety, parent communication, and risk-sensitive moments.",
      }),
      withTimestamps({
        id: "pillar_practical-tips",
        name: "Practical Tips",
        description: "Small usable teacher actions, scripts, and framing moves that reduce friction fast.",
      }),
      withTimestamps({
        id: "pillar_emotional-support",
        name: "Emotional Support",
        description: "Calmer emotional framing, reassurance, and language that reduces pressure or shame.",
      }),
      withTimestamps({
        id: "pillar_product-education",
        name: "Product Education",
        description: "Explain where the product helps and what kind of communication work it supports.",
      }),
    ],
    audienceSegments: [
      withTimestamps({
        id: "audience_primary-teachers",
        name: "Primary teachers",
        description: "Teachers handling parent communication and classroom pressure in primary settings.",
      }),
      withTimestamps({
        id: "audience_secondary-teachers",
        name: "Secondary teachers",
        description: "Teachers balancing subject teaching with escalating communication complexity.",
      }),
      withTimestamps({
        id: "audience_new-teachers",
        name: "New teachers",
        description: "Earlier-career teachers who need clearer wording and structure quickly.",
      }),
      withTimestamps({
        id: "audience_school-leaders",
        name: "School leaders",
        description: "Leaders who influence communication norms and professional documentation quality.",
      }),
    ],
    updatedAt: now,
  });
}

async function readPersistedCampaignStrategy(): Promise<CampaignStrategy | null> {
  try {
    const raw = await readFile(CAMPAIGN_STORE_PATH, "utf8");
    return campaignStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function writeCampaignStrategy(strategy: CampaignStrategy): Promise<void> {
  await mkdir(path.dirname(CAMPAIGN_STORE_PATH), { recursive: true });
  await writeFile(CAMPAIGN_STORE_PATH, `${JSON.stringify(strategy, null, 2)}\n`, "utf8");
}

export async function getCampaignStrategy(): Promise<CampaignStrategy> {
  return (await readPersistedCampaignStrategy()) ?? buildDefaultCampaignStrategy();
}

export function getActiveCampaigns(strategy: CampaignStrategy): Campaign[] {
  return strategy.campaigns.filter((campaign) => campaign.status === "active");
}

export async function createCampaign(input: {
  name: string;
  description: string;
  status: Campaign["status"];
  goal?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<{ strategy: CampaignStrategy; campaign: Campaign }> {
  const strategy = await getCampaignStrategy();
  const timestamp = new Date().toISOString();
  const campaign = campaignSchema.parse({
    id: `campaign_${slugify(input.name)}_${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    description: input.description.trim(),
    status: input.status,
    goal: sanitizeOptionalText(input.goal),
    startDate: sanitizeOptionalText(input.startDate),
    endDate: sanitizeOptionalText(input.endDate),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const nextStrategy = campaignStoreSchema.parse({
    ...strategy,
    campaigns: [campaign, ...strategy.campaigns],
    updatedAt: timestamp,
  });

  await writeCampaignStrategy(nextStrategy);
  return { strategy: nextStrategy, campaign };
}

export async function updateCampaign(
  id: string,
  updates: Partial<Pick<Campaign, "name" | "description" | "status" | "goal" | "startDate" | "endDate">>,
): Promise<{ strategy: CampaignStrategy; campaign: Campaign | null }> {
  const strategy = await getCampaignStrategy();
  const existing = strategy.campaigns.find((campaign) => campaign.id === id) ?? null;

  if (!existing) {
    return { strategy, campaign: null };
  }

  const timestamp = new Date().toISOString();
  const campaign = campaignSchema.parse({
    ...existing,
    ...updates,
    name: updates.name?.trim() ?? existing.name,
    description: updates.description?.trim() ?? existing.description,
    goal: updates.goal === undefined ? existing.goal : sanitizeOptionalText(updates.goal),
    startDate: updates.startDate === undefined ? existing.startDate : sanitizeOptionalText(updates.startDate),
    endDate: updates.endDate === undefined ? existing.endDate : sanitizeOptionalText(updates.endDate),
    updatedAt: timestamp,
  });
  const nextStrategy = campaignStoreSchema.parse({
    ...strategy,
    campaigns: strategy.campaigns.map((item) => (item.id === id ? campaign : item)),
    updatedAt: timestamp,
  });

  await writeCampaignStrategy(nextStrategy);
  return { strategy: nextStrategy, campaign };
}

export async function createContentPillar(input: {
  name: string;
  description: string;
}): Promise<{ strategy: CampaignStrategy; pillar: ContentPillar }> {
  const strategy = await getCampaignStrategy();
  const timestamp = new Date().toISOString();
  const pillar = contentPillarSchema.parse({
    id: `pillar_${slugify(input.name)}_${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    description: input.description.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const nextStrategy = campaignStoreSchema.parse({
    ...strategy,
    pillars: [pillar, ...strategy.pillars],
    updatedAt: timestamp,
  });

  await writeCampaignStrategy(nextStrategy);
  return { strategy: nextStrategy, pillar };
}

export async function updateContentPillar(
  id: string,
  updates: Partial<Pick<ContentPillar, "name" | "description">>,
): Promise<{ strategy: CampaignStrategy; pillar: ContentPillar | null }> {
  const strategy = await getCampaignStrategy();
  const existing = strategy.pillars.find((pillar) => pillar.id === id) ?? null;

  if (!existing) {
    return { strategy, pillar: null };
  }

  const timestamp = new Date().toISOString();
  const pillar = contentPillarSchema.parse({
    ...existing,
    ...updates,
    name: updates.name?.trim() ?? existing.name,
    description: updates.description?.trim() ?? existing.description,
    updatedAt: timestamp,
  });
  const nextStrategy = campaignStoreSchema.parse({
    ...strategy,
    pillars: strategy.pillars.map((item) => (item.id === id ? pillar : item)),
    updatedAt: timestamp,
  });

  await writeCampaignStrategy(nextStrategy);
  return { strategy: nextStrategy, pillar };
}

export async function createAudienceSegment(input: {
  name: string;
  description: string;
}): Promise<{ strategy: CampaignStrategy; audienceSegment: AudienceSegment }> {
  const strategy = await getCampaignStrategy();
  const timestamp = new Date().toISOString();
  const audienceSegment = audienceSegmentSchema.parse({
    id: `audience_${slugify(input.name)}_${crypto.randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    description: input.description.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const nextStrategy = campaignStoreSchema.parse({
    ...strategy,
    audienceSegments: [audienceSegment, ...strategy.audienceSegments],
    updatedAt: timestamp,
  });

  await writeCampaignStrategy(nextStrategy);
  return { strategy: nextStrategy, audienceSegment };
}

export async function updateAudienceSegment(
  id: string,
  updates: Partial<Pick<AudienceSegment, "name" | "description">>,
): Promise<{ strategy: CampaignStrategy; audienceSegment: AudienceSegment | null }> {
  const strategy = await getCampaignStrategy();
  const existing = strategy.audienceSegments.find((audience) => audience.id === id) ?? null;

  if (!existing) {
    return { strategy, audienceSegment: null };
  }

  const timestamp = new Date().toISOString();
  const audienceSegment = audienceSegmentSchema.parse({
    ...existing,
    ...updates,
    name: updates.name?.trim() ?? existing.name,
    description: updates.description?.trim() ?? existing.description,
    updatedAt: timestamp,
  });
  const nextStrategy = campaignStoreSchema.parse({
    ...strategy,
    audienceSegments: strategy.audienceSegments.map((item) => (item.id === id ? audienceSegment : item)),
    updatedAt: timestamp,
  });

  await writeCampaignStrategy(nextStrategy);
  return { strategy: nextStrategy, audienceSegment };
}

export function getSignalContentContextSummary(
  signal: Pick<SignalRecord, "campaignId" | "pillarId" | "audienceSegmentId" | "funnelStage" | "ctaGoal">,
  strategy: CampaignStrategy,
): ResolvedContentContext {
  const campaign = strategy.campaigns.find((item) => item.id === signal.campaignId) ?? null;
  const pillar = strategy.pillars.find((item) => item.id === signal.pillarId) ?? null;
  const audienceSegment = strategy.audienceSegments.find((item) => item.id === signal.audienceSegmentId) ?? null;

  return {
    campaignId: campaign?.id ?? signal.campaignId ?? null,
    campaignName: campaign?.name ?? null,
    pillarId: pillar?.id ?? signal.pillarId ?? null,
    pillarName: pillar?.name ?? null,
    audienceSegmentId: audienceSegment?.id ?? signal.audienceSegmentId ?? null,
    audienceSegmentName: audienceSegment?.name ?? null,
    funnelStage: signal.funnelStage ?? null,
    ctaGoal: signal.ctaGoal ?? null,
  };
}

function inferPillarId(signal: SignalRecord, strategy: CampaignStrategy): string | null {
  const haystack = normalizeText(
    [
      signal.signalCategory,
      signal.signalSubtype,
      signal.teacherPainPoint,
      signal.riskToTeacher,
      signal.contentAngle,
      signal.interpretationNotes,
      signal.sourceTitle,
      signal.manualSummary,
      signal.rawExcerpt,
      signal.editorialMode,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (/product|signup|trial|feature|onboarding|workflow|tool/i.test(haystack)) {
    return strategy.pillars.find((pillar) => pillar.name === "Product Education")?.id ?? null;
  }

  if (/conflict|risk|document|documentation|parent|policy|behaviour|behavior|safeguard|complaint|boundary/i.test(haystack)) {
    return strategy.pillars.find((pillar) => pillar.name === "Teacher Protection")?.id ?? null;
  }

  if (/stress|calm|reassur|overload|behind|burnout|support|emotion/i.test(haystack)) {
    return strategy.pillars.find((pillar) => pillar.name === "Emotional Support")?.id ?? null;
  }

  if (/tip|practical|how to|script|structure|rewrite|weekly|planning|example/i.test(haystack)) {
    return strategy.pillars.find((pillar) => pillar.name === "Practical Tips")?.id ?? null;
  }

  return (
    [...strategy.pillars]
      .map((pillar) => ({ pillar, score: scoreNamedOption(haystack, pillar) }))
      .sort((left, right) => right.score - left.score || left.pillar.name.localeCompare(right.pillar.name))[0]
      ?.pillar.id ?? null
  );
}

function inferAudienceSegmentId(signal: SignalRecord, strategy: CampaignStrategy): string | null {
  const haystack = normalizeText(
    [
      signal.sourceTitle,
      signal.manualSummary,
      signal.rawExcerpt,
      signal.teacherPainPoint,
      signal.contentAngle,
      signal.sourcePublisher,
      signal.teacherVoiceSource,
      signal.sourceType,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (/new teacher|newly qualified|early career|first week|first-year|behind and overloaded|onboarding/i.test(haystack)) {
    return strategy.audienceSegments.find((segment) => segment.name === "New teachers")?.id ?? null;
  }

  if (/leader|leadership|school leader|headteacher|principal|admin/i.test(haystack)) {
    return strategy.audienceSegments.find((segment) => segment.name === "School leaders")?.id ?? null;
  }

  if (/secondary|subject teacher|department/i.test(haystack)) {
    return strategy.audienceSegments.find((segment) => segment.name === "Secondary teachers")?.id ?? null;
  }

  if (/primary|class teacher|ks1|ks2|elementary/i.test(haystack)) {
    return strategy.audienceSegments.find((segment) => segment.name === "Primary teachers")?.id ?? null;
  }

  if (signal.sourceType === "Support Ticket") {
    return strategy.audienceSegments.find((segment) => segment.name === "New teachers")?.id ?? null;
  }

  return null;
}

function inferFunnelStage(signal: SignalRecord, strategy: CampaignStrategy, pillarId: string | null): FunnelStage | null {
  const pillar = strategy.pillars.find((item) => item.id === pillarId) ?? null;
  const haystack = normalizeText(
    [
      signal.editorialMode,
      signal.contentAngle,
      signal.sourceTitle,
      signal.manualSummary,
      pillar?.name,
    ]
      .filter(Boolean)
      .join(" "),
  );

  if (/product|signup|trial|demo|try/i.test(haystack)) {
    return "Conversion";
  }

  if (pillar?.name === "Product Education") {
    return "Consideration";
  }

  if (signal.editorialMode === "professional_guidance" || signal.editorialMode === "reassurance_deescalation") {
    return "Trust";
  }

  if (signal.editorialMode === "helpful_tip" || signal.editorialMode === "calm_insight") {
    return "Trust";
  }

  if (signal.editorialMode === "awareness" || signal.editorialMode === "risk_warning" || signal.editorialMode === "this_could_happen_to_you") {
    return "Awareness";
  }

  return signal.status === "Posted" ? "Retention" : "Awareness";
}

function inferCtaGoal(signal: SignalRecord, funnelStage: FunnelStage | null, pillarId: string | null, strategy: CampaignStrategy): CtaGoal | null {
  const pillar = strategy.pillars.find((item) => item.id === pillarId) ?? null;
  const haystack = normalizeText(
    [signal.ctaOrClosingLine, signal.contentAngle, signal.sourceTitle, pillar?.name]
      .filter(Boolean)
      .join(" "),
  );

  if (/sign up|signup/i.test(haystack)) {
    return "Sign up";
  }

  if (/try|trial|product/i.test(haystack)) {
    return "Try product";
  }

  if (/visit|site|learn more|read more/i.test(haystack)) {
    return "Visit site";
  }

  if (funnelStage === "Conversion" || funnelStage === "Consideration") {
    return pillar?.name === "Product Education" ? "Try product" : "Visit site";
  }

  if (funnelStage === "Trust" || funnelStage === "Retention") {
    return "Share / engage";
  }

  return "Awareness";
}

function inferCampaignId(
  signal: SignalRecord,
  strategy: CampaignStrategy,
  pillarId: string | null,
  funnelStage: FunnelStage | null,
): string | null {
  const activeCampaigns = getActiveCampaigns(strategy);
  if (activeCampaigns.length === 0) {
    return null;
  }

  const haystack = normalizeText(
    [
      signal.sourceTitle,
      signal.manualSummary,
      signal.rawExcerpt,
      signal.contentAngle,
      signal.teacherPainPoint,
      signal.ctaOrClosingLine,
      strategy.pillars.find((pillar) => pillar.id === pillarId)?.name,
    ]
      .filter(Boolean)
      .join(" "),
  );

  const scored = activeCampaigns
    .map((campaign) => ({
      campaign,
      score: scoreNamedOption(haystack, campaign),
    }))
    .sort((left, right) => right.score - left.score || left.campaign.name.localeCompare(right.campaign.name));

  if ((scored[0]?.score ?? 0) > 0) {
    return scored[0].campaign.id;
  }

  if (funnelStage === "Conversion" || funnelStage === "Consideration") {
    return (
      activeCampaigns.find((campaign) => /product/i.test(`${campaign.name} ${campaign.description} ${campaign.goal ?? ""}`))
        ?.id ?? activeCampaigns[0].id
    );
  }

  if (/protect|documentation|boundary|parent|risk/i.test(haystack)) {
    return (
      activeCampaigns.find((campaign) => /protect|parent|risk/i.test(`${campaign.name} ${campaign.description} ${campaign.goal ?? ""}`))
        ?.id ?? activeCampaigns[0].id
    );
  }

  return activeCampaigns[0].id;
}

export function assignSignalContentContext(
  signal: SignalRecord,
  strategy: CampaignStrategy,
  existing?: Partial<ContentContextInput>,
): ContentContextAssignment {
  const current = contentContextInputSchema.parse({
    campaignId: existing?.campaignId ?? signal.campaignId ?? null,
    pillarId: existing?.pillarId ?? signal.pillarId ?? null,
    audienceSegmentId: existing?.audienceSegmentId ?? signal.audienceSegmentId ?? null,
    funnelStage: existing?.funnelStage ?? signal.funnelStage ?? null,
    ctaGoal: existing?.ctaGoal ?? signal.ctaGoal ?? null,
  });
  const next = { ...current };
  const reasons: string[] = [];
  const autoAssignedKeys: Array<keyof ContentContextInput> = [];

  if (!next.pillarId) {
    next.pillarId = inferPillarId(signal, strategy);
    if (next.pillarId) {
      autoAssignedKeys.push("pillarId");
      reasons.push("Pillar inferred from the signal family and wording.");
    }
  }

  if (!next.audienceSegmentId) {
    next.audienceSegmentId = inferAudienceSegmentId(signal, strategy);
    if (next.audienceSegmentId) {
      autoAssignedKeys.push("audienceSegmentId");
      reasons.push("Audience inferred from the source context and teacher situation.");
    }
  }

  if (!next.funnelStage) {
    next.funnelStage = inferFunnelStage(signal, strategy, next.pillarId);
    if (next.funnelStage) {
      autoAssignedKeys.push("funnelStage");
      reasons.push("Funnel stage inferred from editorial mode and pillar fit.");
    }
  }

  if (!next.ctaGoal) {
    next.ctaGoal = inferCtaGoal(signal, next.funnelStage, next.pillarId, strategy);
    if (next.ctaGoal) {
      autoAssignedKeys.push("ctaGoal");
      reasons.push("CTA goal inferred from funnel stage and product intent.");
    }
  }

  if (!next.campaignId) {
    next.campaignId = inferCampaignId(signal, strategy, next.pillarId, next.funnelStage);
    if (next.campaignId) {
      autoAssignedKeys.push("campaignId");
      reasons.push("Campaign aligned to the strongest active strategic fit.");
    }
  }

  const resolved = getSignalContentContextSummary(
    {
      campaignId: next.campaignId ?? null,
      pillarId: next.pillarId ?? null,
      audienceSegmentId: next.audienceSegmentId ?? null,
      funnelStage: next.funnelStage ?? null,
      ctaGoal: next.ctaGoal ?? null,
    } as Pick<SignalRecord, "campaignId" | "pillarId" | "audienceSegmentId" | "funnelStage" | "ctaGoal">,
    strategy,
  );

  const summaryParts = [
    resolved.campaignName,
    resolved.pillarName,
    resolved.audienceSegmentName,
    resolved.funnelStage,
    resolved.ctaGoal,
  ].filter((part): part is string => Boolean(part));

  return {
    context: {
      campaignId: next.campaignId ?? null,
      pillarId: next.pillarId ?? null,
      audienceSegmentId: next.audienceSegmentId ?? null,
      funnelStage: next.funnelStage ?? null,
      ctaGoal: next.ctaGoal ?? null,
    },
    summary:
      summaryParts.length > 0
        ? `Context aligned to ${summaryParts.join(" · ")}.`
        : "No strategic context could be inferred yet.",
    reasons: reasons.slice(0, 3),
    autoAssignedKeys,
  };
}

function isRecentDate(value: string | null | undefined, threshold: number): boolean {
  if (!value) {
    return false;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && parsed >= threshold;
}

export function buildCampaignCadenceSummary(
  signals: SignalRecord[],
  strategy: CampaignStrategy,
  postingEntries: PostingLogEntry[] = [],
  recentWindowDays = 14,
  now = new Date(),
): CampaignCadenceSummary {
  const threshold = now.getTime() - recentWindowDays * 24 * 60 * 60 * 1000;
  const relevantSignals = signals.filter(
    (signal) =>
      signal.status === "Draft Generated" ||
      signal.status === "Reviewed" ||
      signal.status === "Approved" ||
      signal.status === "Scheduled" ||
      signal.status === "Posted",
  );
  const recentSignalIds = new Set(
    relevantSignals
      .filter((signal) => isRecentDate(signal.createdDate, threshold) || isRecentDate(signal.postedDate, threshold))
      .map((signal) => signal.recordId),
  );

  for (const entry of postingEntries) {
    if (isRecentDate(entry.postedAt, threshold)) {
      recentSignalIds.add(entry.signalId);
    }
  }

  const countBy = <T extends string | FunnelStage>(items: T[]): Map<T, number> => {
    const counts = new Map<T, number>();
    for (const item of items) {
      counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    return counts;
  };

  const campaignCounts = countBy(relevantSignals.map((signal) => signal.campaignId).filter((value): value is string => Boolean(value)));
  const pillarCounts = countBy(relevantSignals.map((signal) => signal.pillarId).filter((value): value is string => Boolean(value)));
  const audienceCounts = countBy(relevantSignals.map((signal) => signal.audienceSegmentId).filter((value): value is string => Boolean(value)));
  const funnelCounts = countBy(relevantSignals.map((signal) => signal.funnelStage).filter((value): value is FunnelStage => Boolean(value)));

  const recentCampaignCounts = countBy(
    relevantSignals
      .filter((signal) => recentSignalIds.has(signal.recordId))
      .map((signal) => signal.campaignId)
      .filter((value): value is string => Boolean(value)),
  );
  const recentPillarCounts = countBy(
    relevantSignals
      .filter((signal) => recentSignalIds.has(signal.recordId))
      .map((signal) => signal.pillarId)
      .filter((value): value is string => Boolean(value)),
  );
  const recentAudienceCounts = countBy(
    relevantSignals
      .filter((signal) => recentSignalIds.has(signal.recordId))
      .map((signal) => signal.audienceSegmentId)
      .filter((value): value is string => Boolean(value)),
  );
  const recentFunnelCounts = countBy(
    relevantSignals
      .filter((signal) => recentSignalIds.has(signal.recordId))
      .map((signal) => signal.funnelStage)
      .filter((value): value is FunnelStage => Boolean(value)),
  );

  return {
    activeCampaignCount: strategy.campaigns.filter((campaign) => campaign.status === "active").length,
    recentWindowDays,
    recentSignalsCount: recentSignalIds.size,
    byCampaign: strategy.campaigns
      .map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        count: campaignCounts.get(campaign.id) ?? 0,
        recentCount: recentCampaignCounts.get(campaign.id) ?? 0,
        status: campaign.status,
      }))
      .sort((left, right) => right.recentCount - left.recentCount || right.count - left.count || left.name.localeCompare(right.name)),
    byPillar: strategy.pillars
      .map((pillar) => ({
        id: pillar.id,
        name: pillar.name,
        count: pillarCounts.get(pillar.id) ?? 0,
        recentCount: recentPillarCounts.get(pillar.id) ?? 0,
      }))
      .sort((left, right) => right.recentCount - left.recentCount || right.count - left.count || left.name.localeCompare(right.name)),
    byAudience: strategy.audienceSegments
      .map((audience) => ({
        id: audience.id,
        name: audience.name,
        count: audienceCounts.get(audience.id) ?? 0,
        recentCount: recentAudienceCounts.get(audience.id) ?? 0,
      }))
      .sort((left, right) => right.recentCount - left.recentCount || right.count - left.count || left.name.localeCompare(right.name)),
    byFunnelStage: FUNNEL_STAGES.map((stage) => ({
      stage,
      count: funnelCounts.get(stage) ?? 0,
      recentCount: recentFunnelCounts.get(stage) ?? 0,
    })),
    underrepresentedPillars: strategy.pillars
      .filter((pillar) => (recentPillarCounts.get(pillar.id) ?? 0) === 0)
      .map((pillar) => pillar.name),
    underrepresentedFunnels: FUNNEL_STAGES.filter((stage) => (recentFunnelCounts.get(stage) ?? 0) === 0),
    activeCampaignNames: strategy.campaigns.filter((campaign) => campaign.status === "active").map((campaign) => campaign.name),
  };
}

export function buildCampaignDistributionInsights(
  signals: SignalRecord[],
  strategy: CampaignStrategy,
  postingEntries: PostingLogEntry[] = [],
  recentWindowDays = 14,
  now = new Date(),
): CampaignDistributionInsights {
  const cadence = buildCampaignCadenceSummary(signals, strategy, postingEntries, recentWindowDays, now);

  return {
    byCampaign: cadence.byCampaign
      .filter((row) => row.count > 0 || row.status === "active")
      .map((row) => ({ label: row.name, count: row.count })),
    byPillar: cadence.byPillar.map((row) => ({ label: row.name, count: row.count })),
    byFunnelStage: cadence.byFunnelStage.map((row) => ({ label: row.stage, count: row.count })),
    missingFunnels: cadence.byFunnelStage.filter((row) => row.count === 0).map((row) => row.stage),
    underrepresentedPillars: cadence.underrepresentedPillars,
  };
}
