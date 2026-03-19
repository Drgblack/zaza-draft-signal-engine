"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AudienceSegment, Campaign, CampaignStrategy, ContentPillar } from "@/lib/campaigns";

function toneClasses(tone: "success" | "warning" | "error") {
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

type FeedbackState = {
  tone: "success" | "warning" | "error";
  title: string;
  body: string;
} | null;

type CampaignStrategyManagerProps = {
  initialStrategy: CampaignStrategy;
};

async function sendStrategyUpdate(body: unknown) {
  const response = await fetch("/api/campaigns", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as {
    success: boolean;
    strategy?: CampaignStrategy | null;
    message?: string;
    error?: string;
  };

  if (!response.ok || !data.success || !data.strategy) {
    throw new Error(data.error ?? "Unable to update campaign strategy.");
  }

  return {
    strategy: data.strategy,
    message: data.message,
  };
}

function CampaignCard({
  campaign,
  onSave,
}: {
  campaign: Campaign;
  onSave: (id: string, updates: Partial<Pick<Campaign, "name" | "description" | "status" | "goal" | "startDate" | "endDate">>) => Promise<void>;
}) {
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description);
  const [status, setStatus] = useState<Campaign["status"]>(campaign.status);
  const [goal, setGoal] = useState(campaign.goal ?? "");
  const [startDate, setStartDate] = useState(campaign.startDate ?? "");
  const [endDate, setEndDate] = useState(campaign.endDate ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(campaign.id, {
        name,
        description,
        status,
        goal,
        startDate,
        endDate,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white/80 p-4">
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor={`campaign-name-${campaign.id}`}>Name</Label>
          <Input id={`campaign-name-${campaign.id}`} value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`campaign-description-${campaign.id}`}>Description</Label>
          <Textarea
            id={`campaign-description-${campaign.id}`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="min-h-24"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`campaign-status-${campaign.id}`}>Status</Label>
            <Select id={`campaign-status-${campaign.id}`} value={status} onChange={(event) => setStatus(event.target.value as Campaign["status"])}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`campaign-goal-${campaign.id}`}>Goal</Label>
            <Input id={`campaign-goal-${campaign.id}`} value={goal} onChange={(event) => setGoal(event.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`campaign-start-${campaign.id}`}>Start Date</Label>
            <Input id={`campaign-start-${campaign.id}`} value={startDate} onChange={(event) => setStartDate(event.target.value)} placeholder="YYYY-MM-DD" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`campaign-end-${campaign.id}`}>End Date</Label>
            <Input id={`campaign-end-${campaign.id}`} value={endDate} onChange={(event) => setEndDate(event.target.value)} placeholder="YYYY-MM-DD" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save campaign"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SimpleEntityCard<T extends { id: string; name: string; description: string }>({
  entity,
  label,
  saveLabel,
  onSave,
}: {
  entity: T;
  label: string;
  saveLabel: string;
  onSave: (id: string, updates: Partial<Pick<T, "name" | "description">>) => Promise<void>;
}) {
  const [name, setName] = useState(entity.name);
  const [description, setDescription] = useState(entity.description);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(entity.id, { name, description });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white/80 p-4">
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor={`${label}-name-${entity.id}`}>Name</Label>
          <Input id={`${label}-name-${entity.id}`} value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${label}-description-${entity.id}`}>Description</Label>
          <Textarea
            id={`${label}-description-${entity.id}`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="min-h-24"
          />
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CampaignStrategyManager({ initialStrategy }: CampaignStrategyManagerProps) {
  const [strategy, setStrategy] = useState(initialStrategy);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [creatingPillar, setCreatingPillar] = useState(false);
  const [creatingAudience, setCreatingAudience] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    description: "",
    status: "active" as Campaign["status"],
    goal: "",
    startDate: "",
    endDate: "",
  });
  const [newPillar, setNewPillar] = useState({
    name: "",
    description: "",
  });
  const [newAudience, setNewAudience] = useState({
    name: "",
    description: "",
  });

  async function handleCreateCampaign() {
    setCreatingCampaign(true);
    setFeedback(null);
    try {
      const data = await sendStrategyUpdate({
        kind: "campaign",
        action: "create",
        data: newCampaign,
      });
      setStrategy(data.strategy);
      setNewCampaign({
        name: "",
        description: "",
        status: "active",
        goal: "",
        startDate: "",
        endDate: "",
      });
      setFeedback({
        tone: "success",
        title: "Campaign created",
        body: data.message ?? "Campaign strategy updated.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Unable to create campaign",
        body: error instanceof Error ? error.message : "Campaign could not be created.",
      });
    } finally {
      setCreatingCampaign(false);
    }
  }

  async function handleSaveCampaign(id: string, updates: Partial<Pick<Campaign, "name" | "description" | "status" | "goal" | "startDate" | "endDate">>) {
    setFeedback(null);
    const data = await sendStrategyUpdate({
      kind: "campaign",
      action: "update",
      data: {
        id,
        ...updates,
      },
    });
    setStrategy(data.strategy);
    setFeedback({
      tone: "success",
      title: "Campaign updated",
      body: data.message ?? "Campaign strategy updated.",
    });
  }

  async function handleCreatePillar() {
    setCreatingPillar(true);
    setFeedback(null);
    try {
      const data = await sendStrategyUpdate({
        kind: "pillar",
        action: "create",
        data: newPillar,
      });
      setStrategy(data.strategy);
      setNewPillar({ name: "", description: "" });
      setFeedback({
        tone: "success",
        title: "Pillar created",
        body: data.message ?? "Pillar saved.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Unable to create pillar",
        body: error instanceof Error ? error.message : "Pillar could not be created.",
      });
    } finally {
      setCreatingPillar(false);
    }
  }

  async function handleSavePillar(id: string, updates: Partial<Pick<ContentPillar, "name" | "description">>) {
    setFeedback(null);
    const data = await sendStrategyUpdate({
      kind: "pillar",
      action: "update",
      data: {
        id,
        ...updates,
      },
    });
    setStrategy(data.strategy);
    setFeedback({
      tone: "success",
      title: "Pillar updated",
      body: data.message ?? "Pillar updated.",
    });
  }

  async function handleCreateAudience() {
    setCreatingAudience(true);
    setFeedback(null);
    try {
      const data = await sendStrategyUpdate({
        kind: "audience",
        action: "create",
        data: newAudience,
      });
      setStrategy(data.strategy);
      setNewAudience({ name: "", description: "" });
      setFeedback({
        tone: "success",
        title: "Audience created",
        body: data.message ?? "Audience segment saved.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Unable to create audience",
        body: error instanceof Error ? error.message : "Audience segment could not be created.",
      });
    } finally {
      setCreatingAudience(false);
    }
  }

  async function handleSaveAudience(id: string, updates: Partial<Pick<AudienceSegment, "name" | "description">>) {
    setFeedback(null);
    const data = await sendStrategyUpdate({
      kind: "audience",
      action: "update",
      data: {
        id,
        ...updates,
      },
    });
    setStrategy(data.strategy);
    setFeedback({
      tone: "success",
      title: "Audience updated",
      body: data.message ?? "Audience segment updated.",
    });
  }

  const activeCampaigns = strategy.campaigns.filter((campaign) => campaign.status === "active");
  const inactiveCampaigns = strategy.campaigns.filter((campaign) => campaign.status === "inactive");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create New Campaign</CardTitle>
          <CardDescription>Campaigns stay lightweight: a name, purpose, status, and optional timing.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="new-campaign-name">Name</Label>
              <Input id="new-campaign-name" value={newCampaign.name} onChange={(event) => setNewCampaign((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-campaign-status">Status</Label>
              <Select id="new-campaign-status" value={newCampaign.status} onChange={(event) => setNewCampaign((current) => ({ ...current, status: event.target.value as Campaign["status"] }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-campaign-description">Description</Label>
            <Textarea id="new-campaign-description" value={newCampaign.description} onChange={(event) => setNewCampaign((current) => ({ ...current, description: event.target.value }))} className="min-h-24" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="new-campaign-goal">Goal</Label>
              <Input id="new-campaign-goal" value={newCampaign.goal} onChange={(event) => setNewCampaign((current) => ({ ...current, goal: event.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-campaign-start">Start Date</Label>
              <Input id="new-campaign-start" value={newCampaign.startDate} onChange={(event) => setNewCampaign((current) => ({ ...current, startDate: event.target.value }))} placeholder="YYYY-MM-DD" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-campaign-end">End Date</Label>
              <Input id="new-campaign-end" value={newCampaign.endDate} onChange={(event) => setNewCampaign((current) => ({ ...current, endDate: event.target.value }))} placeholder="YYYY-MM-DD" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={handleCreateCampaign} disabled={creatingCampaign}>
              {creatingCampaign ? "Creating..." : "Create campaign"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Active Campaigns</CardTitle>
            <CardDescription>These should influence ranking and default context most strongly.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeCampaigns.length === 0 ? (
              <div className="rounded-2xl bg-white/80 px-4 py-5 text-sm text-slate-500">No active campaigns yet.</div>
            ) : (
              activeCampaigns.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} onSave={handleSaveCampaign} />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inactive Campaigns</CardTitle>
            <CardDescription>Retain these for reference without letting them steer current ranking.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {inactiveCampaigns.length === 0 ? (
              <div className="rounded-2xl bg-white/80 px-4 py-5 text-sm text-slate-500">No inactive campaigns saved.</div>
            ) : (
              inactiveCampaigns.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} onSave={handleSaveCampaign} />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Content Pillars</CardTitle>
            <CardDescription>Broad strategic themes used for balancing and default assignment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-slate-50/90 p-4">
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="new-pillar-name">New pillar name</Label>
                  <Input id="new-pillar-name" value={newPillar.name} onChange={(event) => setNewPillar((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new-pillar-description">Description</Label>
                  <Textarea id="new-pillar-description" value={newPillar.description} onChange={(event) => setNewPillar((current) => ({ ...current, description: event.target.value }))} className="min-h-24" />
                </div>
                <div className="flex justify-end">
                  <Button type="button" variant="secondary" onClick={handleCreatePillar} disabled={creatingPillar}>
                    {creatingPillar ? "Creating..." : "Create pillar"}
                  </Button>
                </div>
              </div>
            </div>
            {strategy.pillars.map((pillar) => (
              <SimpleEntityCard key={pillar.id} entity={pillar} label="pillar" saveLabel="Save pillar" onSave={handleSavePillar} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audience Segments</CardTitle>
            <CardDescription>Simple audience buckets used for context and light balancing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl bg-slate-50/90 p-4">
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="new-audience-name">New audience name</Label>
                  <Input id="new-audience-name" value={newAudience.name} onChange={(event) => setNewAudience((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new-audience-description">Description</Label>
                  <Textarea id="new-audience-description" value={newAudience.description} onChange={(event) => setNewAudience((current) => ({ ...current, description: event.target.value }))} className="min-h-24" />
                </div>
                <div className="flex justify-end">
                  <Button type="button" variant="secondary" onClick={handleCreateAudience} disabled={creatingAudience}>
                    {creatingAudience ? "Creating..." : "Create audience"}
                  </Button>
                </div>
              </div>
            </div>
            {strategy.audienceSegments.map((audience) => (
              <SimpleEntityCard key={audience.id} entity={audience} label="audience" saveLabel="Save audience" onSave={handleSaveAudience} />
            ))}
          </CardContent>
        </Card>
      </div>

      {feedback ? (
        <div className={`rounded-2xl px-4 py-3 text-sm ${toneClasses(feedback.tone)}`}>
          <p className="font-medium">{feedback.title}</p>
          <p className="mt-1">{feedback.body}</p>
        </div>
      ) : null}
    </div>
  );
}
