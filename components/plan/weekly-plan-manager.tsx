"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CampaignStrategy } from "@/lib/campaigns";
import { getPostingPlatformLabel, POSTING_PLATFORMS, type PostingPlatform } from "@/lib/posting-memory";
import { EDITORIAL_MODE_DEFINITIONS } from "@/lib/editorial-modes";
import { EDITORIAL_MODES, FUNNEL_STAGES, type EditorialMode, type FunnelStage } from "@/types/signal";
import type { WeeklyPlan, WeeklyPlanTemplate } from "@/lib/weekly-plan";

const PLAN_CONTENT_SOURCES = ["freshSignals", "evergreen", "reusedHighPerformers"] as const;

const PLAN_CONTENT_SOURCE_LABELS: Record<(typeof PLAN_CONTENT_SOURCES)[number], string> = {
  freshSignals: "Fresh signals",
  evergreen: "Evergreen",
  reusedHighPerformers: "Reused high performers",
};

const PLAN_FUNNEL_LABELS: Record<FunnelStage, string> = {
  Awareness: "Awareness",
  Trust: "Trust",
  Consideration: "Consideration / lead intent",
  Conversion: "Conversion",
  Retention: "Retention",
};

const PLAN_PRIORITY_LABELS = {
  0: "Off",
  1: "Light",
  2: "Balanced",
  3: "Priority",
} as const;

const PLAN_PRIORITY_DESCRIPTIONS = {
  0: "Not a focus this week.",
  1: "Useful if it fits naturally.",
  2: "Keep a steady presence.",
  3: "Actively fill this week.",
} as const;

type FeedbackState = {
  tone: "success" | "warning" | "error";
  title: string;
  body: string;
} | null;

type WeeklyPlanManagerProps = {
  initialPlan: WeeklyPlan;
  recentPlans: WeeklyPlan[];
  templates: WeeklyPlanTemplate[];
  strategy: CampaignStrategy;
};

function toneClasses(tone: NonNullable<FeedbackState>["tone"]) {
  switch (tone) {
    case "success":
      return "bg-emerald-50 text-emerald-700";
    case "warning":
      return "bg-amber-50 text-amber-700";
    case "error":
    default:
      return "bg-rose-50 text-rose-700";
  }
}

function createEditablePlan(plan: WeeklyPlan): WeeklyPlan {
  return {
    ...plan,
    goals: [...plan.goals],
    activeCampaignIds: [...plan.activeCampaignIds],
    targetPlatforms: [...plan.targetPlatforms],
    targetFunnelMix: { ...plan.targetFunnelMix },
    targetModeMix: { ...plan.targetModeMix },
    targetContentSources: { ...plan.targetContentSources },
  };
}

function buildPlanFromTemplate(template: WeeklyPlanTemplate, existing: WeeklyPlan, campaignIds: string[]): WeeklyPlan {
  return {
    ...existing,
    theme: template.theme,
    goals: [...template.goals],
    activeCampaignIds: campaignIds,
    targetPlatforms: [...template.targetPlatforms],
    targetFunnelMix: { ...template.targetFunnelMix },
    targetModeMix: { ...template.targetModeMix },
    targetContentSources: { ...template.targetContentSources },
    notes: existing.notes,
  };
}

export function WeeklyPlanManager({
  initialPlan,
  recentPlans,
  templates,
  strategy,
}: WeeklyPlanManagerProps) {
  const [plan, setPlan] = useState<WeeklyPlan>(() => createEditablePlan(initialPlan));
  const [saving, setSaving] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<WeeklyPlanTemplate["id"]>(templates[0]?.id ?? "balanced_mix");
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const activeCampaigns = strategy.campaigns.filter((campaign) => campaign.status === "active");
  const campaignIdsForTemplate =
    activeCampaigns.slice(0, 3).map((campaign) => campaign.id).length > 0
      ? activeCampaigns.slice(0, 3).map((campaign) => campaign.id)
      : plan.activeCampaignIds;

  function updateField<K extends keyof WeeklyPlan>(key: K, value: WeeklyPlan[K]) {
    setPlan((current) => ({ ...current, [key]: value }));
  }

  function toggleCampaign(campaignId: string) {
    setPlan((current) => ({
      ...current,
      activeCampaignIds: current.activeCampaignIds.includes(campaignId)
        ? current.activeCampaignIds.filter((id) => id !== campaignId)
        : [...current.activeCampaignIds, campaignId],
    }));
  }

  function togglePlatform(platform: PostingPlatform) {
    setPlan((current) => ({
      ...current,
      targetPlatforms: current.targetPlatforms.includes(platform)
        ? current.targetPlatforms.filter((item) => item !== platform)
        : [...current.targetPlatforms, platform],
    }));
  }

  function updateFunnel(stage: FunnelStage, value: string) {
    setPlan((current) => ({
      ...current,
      targetFunnelMix: {
        ...current.targetFunnelMix,
        [stage]: Number(value) as 0 | 1 | 2 | 3,
      },
    }));
  }

  function updateMode(mode: EditorialMode, value: string) {
    setPlan((current) => ({
      ...current,
      targetModeMix: {
        ...current.targetModeMix,
        [mode]: Number(value) as 0 | 1 | 2 | 3,
      },
    }));
  }

  function updateSource(sourceKey: (typeof PLAN_CONTENT_SOURCES)[number], value: string) {
    setPlan((current) => ({
      ...current,
      targetContentSources: {
        ...current.targetContentSources,
        [sourceKey]: Number(value) as 0 | 1 | 2 | 3,
      },
    }));
  }

  function applyTemplate() {
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) {
      return;
    }

    setPlan((current) => buildPlanFromTemplate(template, current, campaignIdsForTemplate));
    setFeedback({
      tone: "success",
      title: "Template applied",
      body: `${template.label} prefilled the current weekly plan. Save to make it active.`,
    });
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/weekly-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          weekStartDate: plan.weekStartDate,
          theme: plan.theme,
          goals: plan.goals,
          activeCampaignIds: plan.activeCampaignIds,
          targetPlatforms: plan.targetPlatforms,
          targetFunnelMix: plan.targetFunnelMix,
          targetModeMix: plan.targetModeMix,
          targetContentSources: plan.targetContentSources,
          notes: plan.notes,
        }),
      });
      const data = (await response.json()) as {
        success: boolean;
        plan?: WeeklyPlan | null;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.success || !data.plan) {
        throw new Error(data.error ?? "Unable to save weekly plan.");
      }

      setPlan(createEditablePlan(data.plan));
      setFeedback({
        tone: "success",
        title: "Weekly plan saved",
        body: data.message ?? "The current week is now updated.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Unable to save weekly plan",
        body: error instanceof Error ? error.message : "The weekly plan could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Current Week</CardTitle>
          <CardDescription>
            Lightweight weekly intent for queue balance and review guidance. This nudges ranking, but does not block the pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="grid gap-2">
              <Label htmlFor="week-start-date">Week start date</Label>
              <Input id="week-start-date" value={plan.weekStartDate} onChange={(event) => updateField("weekStartDate", event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="plan-theme">Theme</Label>
              <Input id="plan-theme" value={plan.theme ?? ""} onChange={(event) => updateField("theme", event.target.value || null)} placeholder="Optional weekly theme" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div className="grid gap-2">
              <Label htmlFor="weekly-template">Plan template</Label>
              <Select id="weekly-template" value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value as WeeklyPlanTemplate["id"])}>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </Select>
              <p className="text-sm text-slate-500">
                {templates.find((template) => template.id === selectedTemplateId)?.description ?? "Pick a starting point."}
              </p>
            </div>
            <div className="flex items-end">
              <Button type="button" variant="secondary" onClick={applyTemplate}>
                Apply template
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="plan-goals">Goals</Label>
            <Textarea
              id="plan-goals"
              value={plan.goals.join("\n")}
              onChange={(event) =>
                updateField(
                  "goals",
                  event.target.value
                    .split("\n")
                    .map((goal) => goal.trim())
                    .filter(Boolean)
                    .slice(0, 8),
                )
              }
              className="min-h-[120px]"
              placeholder="One goal per line"
            />
          </div>

          <div className="grid gap-2">
            <Label>Active campaigns this week</Label>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {activeCampaigns.length === 0 ? (
                <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-500">No active campaigns available yet.</div>
              ) : (
                activeCampaigns.map((campaign) => (
                  <label key={campaign.id} className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-700">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={plan.activeCampaignIds.includes(campaign.id)}
                        onChange={() => toggleCampaign(campaign.id)}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-medium text-slate-950">{campaign.name}</p>
                        <p className="mt-1 text-slate-500">{campaign.goal ?? campaign.description}</p>
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Target platforms</Label>
            <div className="grid gap-3 md:grid-cols-3">
              {POSTING_PLATFORMS.map((platform) => (
                <label key={platform} className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-700">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={plan.targetPlatforms.includes(platform)} onChange={() => togglePlatform(platform)} />
                    <div>
                      <p className="font-medium text-slate-950">{getPostingPlatformLabel(platform)}</p>
                      <p className="text-slate-500">Keep this platform visible in the weekly mix.</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Funnel Emphasis</CardTitle>
            <CardDescription>Soft priorities only. Higher emphasis gives the queue a small nudge when gaps exist.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {FUNNEL_STAGES.map((stage) => (
              <div key={stage} className="grid gap-2 md:grid-cols-[1fr_220px] md:items-center">
                <div>
                  <p className="font-medium text-slate-950">{PLAN_FUNNEL_LABELS[stage]}</p>
                  <p className="text-sm text-slate-500">{PLAN_PRIORITY_DESCRIPTIONS[plan.targetFunnelMix[stage]]}</p>
                </div>
                <Select value={String(plan.targetFunnelMix[stage])} onChange={(event) => updateFunnel(stage, event.target.value)}>
                  {Object.entries(PLAN_PRIORITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Content Source Mix</CardTitle>
            <CardDescription>Helps avoid leaning too hard on only fresh signals or only evergreen material.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {PLAN_CONTENT_SOURCES.map((sourceKey) => (
              <div key={sourceKey} className="grid gap-2 md:grid-cols-[1fr_220px] md:items-center">
                <div>
                  <p className="font-medium text-slate-950">{PLAN_CONTENT_SOURCE_LABELS[sourceKey]}</p>
                  <p className="text-sm text-slate-500">{PLAN_PRIORITY_DESCRIPTIONS[plan.targetContentSources[sourceKey]]}</p>
                </div>
                <Select value={String(plan.targetContentSources[sourceKey])} onChange={(event) => updateSource(sourceKey, event.target.value)}>
                  {Object.entries(PLAN_PRIORITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Editorial Mode Balance</CardTitle>
          <CardDescription>Use this to avoid over-relying on one tone or execution style.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {EDITORIAL_MODES.map((mode) => (
            <div key={mode} className="grid gap-2 rounded-2xl bg-white/80 px-4 py-4 md:grid-cols-[1fr_180px] md:items-center">
              <div>
                <p className="font-medium text-slate-950">{EDITORIAL_MODE_DEFINITIONS[mode].label}</p>
                <p className="text-sm text-slate-500">{PLAN_PRIORITY_DESCRIPTIONS[plan.targetModeMix[mode]]}</p>
              </div>
              <Select value={String(plan.targetModeMix[mode])} onChange={(event) => updateMode(mode, event.target.value)}>
                {Object.entries(PLAN_PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>Short operator guidance for the week. Keep this lightweight.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={plan.notes ?? ""}
            onChange={(event) => updateField("notes", event.target.value || null)}
            className="min-h-[120px]"
            placeholder="Anything special to keep in mind this week?"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save weekly plan"}
            </Button>
            <p className="text-sm text-slate-500">This plan nudges ranking and review context. It does not block strong candidates.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Weeks</CardTitle>
          <CardDescription>Simple history for quick comparison and reuse.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentPlans.map((item) => (
            <div key={item.id} className="rounded-2xl bg-white/80 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium text-slate-950">{item.weekStartDate}</p>
                <p className="text-sm text-slate-500">{item.theme ?? "No theme"}</p>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Goals: {item.goals.length > 0 ? item.goals.join(" · ") : "No goals saved."}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {feedback ? (
        <div className={`rounded-2xl px-4 py-3 text-sm ${toneClasses(feedback.tone)}`}>
          <p className="font-medium">{feedback.title}</p>
          <p className="mt-1">{feedback.body}</p>
        </div>
      ) : null}
    </div>
  );
}
