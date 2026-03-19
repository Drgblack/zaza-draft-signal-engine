"use client";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { AudienceSegment, Campaign, ContentPillar } from "@/lib/campaigns";
import { CTA_GOALS, FUNNEL_STAGES, type CtaGoal, type FunnelStage } from "@/types/signal";

export type ContentContextFormValue = {
  campaignId: string;
  pillarId: string;
  audienceSegmentId: string;
  funnelStage: FunnelStage | "";
  ctaGoal: CtaGoal | "";
};

export function ContentContextFields({
  value,
  onChange,
  campaigns,
  pillars,
  audienceSegments,
  helperText,
}: {
  value: ContentContextFormValue;
  onChange: (next: ContentContextFormValue) => void;
  campaigns: Campaign[];
  pillars: ContentPillar[];
  audienceSegments: AudienceSegment[];
  helperText?: string;
}) {
  function updateField<K extends keyof ContentContextFormValue>(key: K, nextValue: ContentContextFormValue[K]) {
    onChange({
      ...value,
      [key]: nextValue,
    });
  }

  return (
    <div className="rounded-2xl bg-white/75 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Strategic context</p>
          <p className="mt-1 text-sm text-slate-600">
            Optional operator override. If left blank, the system will infer bounded defaults where it can.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="content-context-campaign">Campaign</Label>
          <Select id="content-context-campaign" value={value.campaignId} onChange={(event) => updateField("campaignId", event.target.value)}>
            <option value="">No campaign</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="content-context-pillar">Pillar</Label>
          <Select id="content-context-pillar" value={value.pillarId} onChange={(event) => updateField("pillarId", event.target.value)}>
            <option value="">No pillar</option>
            {pillars.map((pillar) => (
              <option key={pillar.id} value={pillar.id}>
                {pillar.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="content-context-audience">Audience</Label>
          <Select id="content-context-audience" value={value.audienceSegmentId} onChange={(event) => updateField("audienceSegmentId", event.target.value)}>
            <option value="">No audience</option>
            {audienceSegments.map((audience) => (
              <option key={audience.id} value={audience.id}>
                {audience.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="content-context-funnel">Funnel stage</Label>
          <Select id="content-context-funnel" value={value.funnelStage} onChange={(event) => updateField("funnelStage", event.target.value as FunnelStage | "")}>
            <option value="">No funnel stage</option>
            {FUNNEL_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="content-context-cta">CTA goal</Label>
          <Select id="content-context-cta" value={value.ctaGoal} onChange={(event) => updateField("ctaGoal", event.target.value as CtaGoal | "")}>
            <option value="">No CTA goal</option>
            {CTA_GOALS.map((goal) => (
              <option key={goal} value={goal}>
                {goal}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {helperText ? <p className="mt-3 text-sm leading-6 text-slate-500">{helperText}</p> : null}
    </div>
  );
}
