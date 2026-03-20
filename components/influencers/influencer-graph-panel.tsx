"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getInteractionTypeLabel,
  getRelationshipStageLabel,
  INFLUENCER_INTERACTION_TYPES,
  INFLUENCER_PLATFORMS,
  type InfluencerInteractionType,
} from "@/lib/influencer-graph-definitions";
import type { InfluencerGraphRow, InfluencerGraphSummary } from "@/lib/influencer-graph";
import type { InfluencerGraphActionResponse } from "@/types/api";

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function InfluencerGraphPanel({
  rows,
  summary,
}: {
  rows: InfluencerGraphRow[];
  summary: InfluencerGraphSummary;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<(typeof INFLUENCER_PLATFORMS)[number]>("linkedin");
  const [handle, setHandle] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeInfluencerId, setActiveInfluencerId] = useState<string | null>(null);
  const [interactionTypeByInfluencerId, setInteractionTypeByInfluencerId] = useState<Record<string, InfluencerInteractionType>>(
    Object.fromEntries(rows.map((row) => [row.influencer.influencerId, "message_sent"])),
  );
  const [messageByInfluencerId, setMessageByInfluencerId] = useState<Record<string, string>>({});
  const [contextByInfluencerId, setContextByInfluencerId] = useState<Record<string, string>>({});
  const followUpRows = useMemo(() => rows.filter((row) => row.followUpNeeded || row.newReplyPending), [rows]);

  async function runAction(body: object) {
    const response = await fetch("/api/influencers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as InfluencerGraphActionResponse | null;

    if (!response.ok || !data?.success) {
      throw new Error(data?.error ?? "Unable to update relationship memory.");
    }

    setFeedback(data.message);
    router.refresh();
  }

  async function addInfluencer() {
    if (!name.trim()) {
      setFeedback("Influencer name is required.");
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      await runAction({
        action: "add_influencer",
        name,
        platform,
        handle: handle || null,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        notes: notes || null,
      });
      setName("");
      setHandle("");
      setTags("");
      setNotes("");
      setPlatform("linkedin");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to add influencer.");
    } finally {
      setIsSaving(false);
    }
  }

  async function recordInteraction(influencerId: string) {
    setActiveInfluencerId(influencerId);
    setFeedback(null);

    try {
      await runAction({
        action: "record_interaction",
        influencerId,
        interactionType: interactionTypeByInfluencerId[influencerId] ?? "message_sent",
        message: messageByInfluencerId[influencerId] || null,
        context: contextByInfluencerId[influencerId] || null,
      });
      setMessageByInfluencerId((current) => ({ ...current, [influencerId]: "" }));
      setContextByInfluencerId((current) => ({ ...current, [influencerId]: "" }));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to record interaction.");
    } finally {
      setActiveInfluencerId(null);
    }
  }

  return (
    <div className="space-y-6">
      {feedback ? (
        <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">{feedback}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Influencers</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.influencerCount}</p>
          <p className="mt-1 text-sm text-slate-600">Saved relationship-memory records.</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Follow up needed</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.followUpNeededCount}</p>
          <p className="mt-1 text-sm text-slate-600">Contacted or replied relationships with no recent follow-up.</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Replies pending</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.newRepliesPendingCount}</p>
          <p className="mt-1 text-sm text-slate-600">New replies that have not yet been answered in memory.</p>
        </div>
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Relationship opportunities</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{summary.relationshipOpportunityCount}</p>
          <p className="mt-1 text-sm text-slate-600">Saved contacts still sitting in the new stage.</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="font-medium text-slate-950">Add influencer</p>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="influencer-name">Name</Label>
              <Input id="influencer-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="influencer-platform">Platform</Label>
              <Select id="influencer-platform" value={platform} onChange={(event) => setPlatform(event.target.value as (typeof INFLUENCER_PLATFORMS)[number])}>
                {INFLUENCER_PLATFORMS.map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="influencer-handle">Handle</Label>
              <Input id="influencer-handle" value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="@handle" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="influencer-tags">Tags</Label>
              <Input id="influencer-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="teacher, creator, coach" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="influencer-notes">Notes</Label>
              <Textarea id="influencer-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Why this relationship matters." />
            </div>
            <Button onClick={addInfluencer} disabled={isSaving}>
              {isSaving ? "Saving..." : "Add influencer"}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-slate-950">Follow-up awareness</p>
            <Link href="/digest" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
              Open digest
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {followUpRows.length === 0 ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
                No follow-up pressure is building in relationship memory right now.
              </div>
            ) : (
              followUpRows.map((row) => (
                <div key={`follow-up:${row.influencer.influencerId}`} className="rounded-2xl bg-slate-50/80 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {row.newReplyPending ? (
                      <Badge className="bg-rose-50 text-rose-700 ring-rose-200">Reply pending</Badge>
                    ) : null}
                    {row.followUpNeeded ? (
                      <Badge className="bg-amber-50 text-amber-700 ring-amber-200">Follow up needed</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 font-medium text-slate-950">{row.influencer.name}</p>
                  <p className="mt-2 text-sm text-slate-600">
                    {row.latestInteraction?.context ?? row.influencer.notes ?? "No saved context."}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.influencer.influencerId} className="rounded-2xl bg-white/80 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{titleCase(row.influencer.platform)}</Badge>
                  <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                    {getRelationshipStageLabel(row.influencer.relationshipStage)}
                  </Badge>
                  {row.influencer.handle ? (
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{row.influencer.handle}</Badge>
                  ) : null}
                  {row.followUpNeeded ? (
                    <Badge className="bg-amber-50 text-amber-700 ring-amber-200">Follow up needed</Badge>
                  ) : null}
                  {row.newReplyPending ? (
                    <Badge className="bg-rose-50 text-rose-700 ring-rose-200">Reply pending</Badge>
                  ) : null}
                </div>
                <p className="mt-3 font-medium text-slate-950">{row.influencer.name}</p>
                <p className="mt-2 text-sm text-slate-600">{row.influencer.notes ?? "No notes saved yet."}</p>
                {row.influencer.tags.length > 0 ? (
                  <p className="mt-2 text-xs text-slate-500">{row.influencer.tags.join(" · ")}</p>
                ) : null}
              </div>
              <div className="text-sm text-slate-500">
                {row.influencer.lastInteraction
                  ? `Last interaction ${new Date(row.influencer.lastInteraction).toLocaleString()}`
                  : "No interaction recorded yet."}
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Recent interactions</p>
                <div className="mt-3 space-y-3">
                  {row.interactions.length === 0 ? (
                    <p className="text-sm text-slate-600">No interactions recorded yet.</p>
                  ) : (
                    row.interactions.slice(0, 4).map((interaction) => (
                      <div key={interaction.interactionId} className="rounded-2xl bg-white px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                            {getInteractionTypeLabel(interaction.interactionType)}
                          </Badge>
                          <span className="text-xs text-slate-500">
                            {new Date(interaction.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {interaction.message ? (
                          <p className="mt-2 text-sm text-slate-700">{interaction.message}</p>
                        ) : null}
                        {interaction.context ? (
                          <p className="mt-2 text-xs text-slate-500">{interaction.context}</p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Record interaction</p>
                <div className="mt-3 space-y-3">
                  <div className="grid gap-2">
                    <Label htmlFor={`${row.influencer.influencerId}-interaction-type`}>Interaction type</Label>
                    <Select
                      id={`${row.influencer.influencerId}-interaction-type`}
                      value={interactionTypeByInfluencerId[row.influencer.influencerId] ?? "message_sent"}
                      onChange={(event) =>
                        setInteractionTypeByInfluencerId((current) => ({
                          ...current,
                          [row.influencer.influencerId]: event.target.value as InfluencerInteractionType,
                        }))
                      }
                    >
                      {INFLUENCER_INTERACTION_TYPES.map((value) => (
                        <option key={value} value={value}>
                          {getInteractionTypeLabel(value)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${row.influencer.influencerId}-message`}>Message or reply</Label>
                    <Textarea
                      id={`${row.influencer.influencerId}-message`}
                      value={messageByInfluencerId[row.influencer.influencerId] ?? ""}
                      onChange={(event) =>
                        setMessageByInfluencerId((current) => ({
                          ...current,
                          [row.influencer.influencerId]: event.target.value,
                        }))
                      }
                      placeholder="Optional interaction text"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${row.influencer.influencerId}-context`}>Context</Label>
                    <Textarea
                      id={`${row.influencer.influencerId}-context`}
                      value={contextByInfluencerId[row.influencer.influencerId] ?? ""}
                      onChange={(event) =>
                        setContextByInfluencerId((current) => ({
                          ...current,
                          [row.influencer.influencerId]: event.target.value,
                        }))
                      }
                      placeholder="Why this interaction matters"
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={activeInfluencerId === row.influencer.influencerId}
                    onClick={() => recordInteraction(row.influencer.influencerId)}
                  >
                    {activeInfluencerId === row.influencer.influencerId ? "Saving..." : "Record interaction"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
