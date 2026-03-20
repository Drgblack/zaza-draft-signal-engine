"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { FOUNDER_VOICE_MODES, type FounderVoiceMode, type SignalRecord } from "@/types/signal";
import type { InfluencerGraphActionResponse, OutreachResponse } from "@/types/api";
import { OUTREACH_PLATFORMS, OUTREACH_TONES, OUTREACH_TYPES, type OutreachResult } from "@/lib/outreach";
import { FOUNDER_VOICE_LABEL, getFounderVoiceModeLabel, isFounderVoiceOn } from "@/lib/founder-voice";
import { getRelationshipStageLabel } from "@/lib/influencer-graph-definitions";
import type { InfluencerRecord } from "@/lib/influencer-graph";
import type { ZazaConnectSignalHints } from "@/lib/zaza-connect-bridge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function OutreachPanel({
  signal,
  influencers,
  bridgeHints,
}: {
  signal: SignalRecord;
  influencers: InfluencerRecord[];
  bridgeHints?: ZazaConnectSignalHints | null;
}) {
  const [selectedInfluencerId, setSelectedInfluencerId] = useState("");
  const [outreachType, setOutreachType] = useState<(typeof OUTREACH_TYPES)[number]>("initial_contact");
  const [platform, setPlatform] = useState<(typeof OUTREACH_PLATFORMS)[number]>("linkedin");
  const [tone, setTone] = useState<(typeof OUTREACH_TONES)[number]>("friendly");
  const [recipientName, setRecipientName] = useState("");
  const [creatorFocus, setCreatorFocus] = useState("");
  const [relationshipContext, setRelationshipContext] = useState("");
  const [collaborationGoal, setCollaborationGoal] = useState("");
  const [inboundMessage, setInboundMessage] = useState("");
  const [founderVoiceMode, setFounderVoiceMode] = useState<FounderVoiceMode>(signal.founderVoiceMode ?? "founder_voice_on");
  const [result, setResult] = useState<OutreachResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const founderVoiceEnabled = isFounderVoiceOn(founderVoiceMode);
  const selectedInfluencer = useMemo(
    () => influencers.find((influencer) => influencer.influencerId === selectedInfluencerId) ?? null,
    [influencers, selectedInfluencerId],
  );
  const focusSummary = useMemo(
    () => signal.scenarioAngle ?? signal.contentAngle ?? signal.manualSummary ?? signal.sourceTitle,
    [signal.contentAngle, signal.manualSummary, signal.scenarioAngle, signal.sourceTitle],
  );

  async function handleGenerate() {
    setIsGenerating(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/outreach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signalId: signal.recordId,
          outreachType,
          platform,
          tone,
          influencerId: selectedInfluencerId || null,
          recipientName: recipientName || null,
          creatorFocus: creatorFocus || null,
          relationshipContext: relationshipContext || null,
          collaborationGoal: collaborationGoal || null,
          inboundMessage: inboundMessage || null,
          founderVoiceMode,
        }),
      });
      const data = (await response.json().catch(() => null)) as OutreachResponse | null;

      if (!response.ok || !data?.success || !data.result) {
        throw new Error(data?.error ?? "Unable to generate outreach message.");
      }

      setResult(data.result);
      setFeedback(data.message);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to generate outreach message.");
    } finally {
      setIsGenerating(false);
    }
  }

  function copyMessage() {
    if (!result?.message?.trim()) {
      setFeedback("No outreach message is available to copy.");
      return;
    }

    void navigator.clipboard.writeText(result.message).then(
      () => setFeedback("Outreach message copied."),
      () => setFeedback("Unable to copy outreach message."),
    );
  }

  async function recordSentInteraction() {
    if (!selectedInfluencer || !result?.message?.trim()) {
      setFeedback("Select an influencer and generate a message before recording outreach.");
      return;
    }

    setIsRecording(true);
    setFeedback(null);

    const interactionType =
      outreachType === "follow_up" || outreachType === "reply" ? "follow_up_sent" : "message_sent";

    try {
      const response = await fetch("/api/influencers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "record_interaction",
          influencerId: selectedInfluencer.influencerId,
          interactionType,
          message: result.message,
          context: `${titleCase(outreachType)} on ${titleCase(platform)} for ${signal.sourceTitle}`,
          signalId: signal.recordId,
        }),
      });
      const data = (await response.json().catch(() => null)) as InfluencerGraphActionResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error ?? "Unable to record influencer interaction.");
      }

      setFeedback(data.message);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to record influencer interaction.");
    } finally {
      setIsRecording(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Outreach Context</CardTitle>
          <CardDescription>
            Generate short manual outreach and reply copy tied to this signal, not a CRM sequence.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{titleCase(outreachType)}</Badge>
              <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{titleCase(platform)}</Badge>
              <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{titleCase(tone)}</Badge>
              <Badge className={founderVoiceEnabled ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-slate-100 text-slate-700 ring-slate-200"}>
                {founderVoiceEnabled ? FOUNDER_VOICE_LABEL : "Founder voice off"}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{focusSummary}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="outreach-influencer">Known relationship</Label>
              <Select id="outreach-influencer" value={selectedInfluencerId} onChange={(event) => setSelectedInfluencerId(event.target.value)}>
                <option value="">No saved influencer selected</option>
                {influencers.map((influencer) => (
                  <option key={influencer.influencerId} value={influencer.influencerId}>
                    {influencer.name} · {titleCase(influencer.platform)} · {getRelationshipStageLabel(influencer.relationshipStage)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="outreach-type">Outreach type</Label>
              <Select id="outreach-type" value={outreachType} onChange={(event) => setOutreachType(event.target.value as (typeof OUTREACH_TYPES)[number])}>
                {OUTREACH_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="outreach-platform">Platform</Label>
              <Select id="outreach-platform" value={platform} onChange={(event) => setPlatform(event.target.value as (typeof OUTREACH_PLATFORMS)[number])}>
                {OUTREACH_PLATFORMS.map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="outreach-tone">Tone</Label>
              <Select id="outreach-tone" value={tone} onChange={(event) => setTone(event.target.value as (typeof OUTREACH_TONES)[number])}>
                {OUTREACH_TONES.map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="outreach-founder-voice">Founder voice mode</Label>
              <Select id="outreach-founder-voice" value={founderVoiceMode} onChange={(event) => setFounderVoiceMode(event.target.value as FounderVoiceMode)}>
                {FOUNDER_VOICE_MODES.map((value) => (
                  <option key={value} value={value}>
                    {getFounderVoiceModeLabel(value)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {selectedInfluencer ? (
            <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                    {getRelationshipStageLabel(selectedInfluencer.relationshipStage)}
                  </Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{titleCase(selectedInfluencer.platform)}</Badge>
                  {selectedInfluencer.handle ? (
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{selectedInfluencer.handle}</Badge>
                  ) : null}
                </div>
                <Link href="/influencers" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                  Open relationship memory
                </Link>
              </div>
              <p className="mt-3 text-sm text-slate-700">
                {selectedInfluencer.notes ?? "No saved notes yet."}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {selectedInfluencer.lastInteraction
                  ? `Last interaction ${new Date(selectedInfluencer.lastInteraction).toLocaleString()}`
                  : "No interaction recorded yet."}
              </p>
            </div>
          ) : null}

          {bridgeHints && bridgeHints.summary.length > 0 ? (
            <div className="rounded-2xl bg-sky-50/80 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-sky-100 text-sky-700 ring-sky-200">Zaza Connect context</Badge>
                  {bridgeHints.matchedThemes.slice(0, 2).map((theme) => (
                    <Badge key={theme} className="bg-white text-slate-700 ring-slate-200">
                      {theme}
                    </Badge>
                  ))}
                </div>
                <Link href="/connect-bridge" className="text-sm text-[color:var(--accent)] underline underline-offset-4">
                  Open bridge
                </Link>
              </div>
              <p className="mt-3 text-sm text-slate-700">{bridgeHints.summary[0]}</p>
              {(bridgeHints.collaborationNotes[0] || bridgeHints.replySignals[0]) ? (
                <p className="mt-2 text-xs text-slate-500">
                  {[bridgeHints.collaborationNotes[0], bridgeHints.replySignals[0]].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="recipient-name">Recipient name</Label>
              <Input id="recipient-name" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Optional" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="creator-focus">Influencer / creator focus</Label>
              <Input id="creator-focus" value={creatorFocus} onChange={(event) => setCreatorFocus(event.target.value)} placeholder="Teacher creator, founder, podcast host..." />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="relationship-context">Relationship context</Label>
            <Textarea id="relationship-context" value={relationshipContext} onChange={(event) => setRelationshipContext(event.target.value)} placeholder="Why this person, and why now?" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="collaboration-goal">Collaboration goal</Label>
            <Textarea id="collaboration-goal" value={collaborationGoal} onChange={(event) => setCollaborationGoal(event.target.value)} placeholder="Optional practical collaboration angle." />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="inbound-message">Inbound message</Label>
            <Textarea
              id="inbound-message"
              value={inboundMessage}
              onChange={(event) => setInboundMessage(event.target.value)}
              placeholder="Optional. Fill this when you want a reply suggestion."
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? "Generating..." : "Generate outreach message"}
            </Button>
            <p className="text-sm text-slate-500">
              Short, relationship-first copy only. No sending. No CRM. No automation chain.
            </p>
          </div>

          {feedback ? (
            <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">{feedback}</div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outreach Output</CardTitle>
          <CardDescription>
            Copy-ready text for manual outreach, collaboration messages, or reply support.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!result ? (
            <div className="rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-600">
              No outreach message generated yet. Use the form to create a short manual-ready message.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{titleCase(result.outreachType)}</Badge>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{titleCase(result.platform)}</Badge>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{titleCase(result.tone)}</Badge>
                {selectedInfluencer ? (
                  <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                    {getRelationshipStageLabel(selectedInfluencer.relationshipStage)}
                  </Badge>
                ) : null}
                {result.founderVoiceMode === "founder_voice_on" ? (
                  <Badge className="bg-violet-50 text-violet-700 ring-violet-200">{FOUNDER_VOICE_LABEL}</Badge>
                ) : null}
              </div>

              <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Purpose</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{result.purpose}</p>
              </div>

              {result.contextSummary ? (
                <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Context</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{result.contextSummary}</p>
                </div>
              ) : null}

              <div className="rounded-2xl bg-white/80 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Message</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={copyMessage}>
                      Copy message
                    </Button>
                    {selectedInfluencer ? (
                      <Button size="sm" variant="ghost" disabled={isRecording} onClick={recordSentInteraction}>
                        {isRecording ? "Recording..." : "Record interaction"}
                      </Button>
                    ) : null}
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-800">{result.message}</p>
              </div>

              {selectedInfluencer ? (
                <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-xs text-slate-500">
                  Relationship context: {selectedInfluencer.name} is currently marked as{" "}
                  {getRelationshipStageLabel(selectedInfluencer.relationshipStage).toLowerCase()}.
                  Reply and follow-up suggestions stay aware of that stage.
                </div>
              ) : null}

              <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-xs text-slate-500">
                Source: {result.generationSource} · Model: {result.generationModelVersion} · Generated{" "}
                {new Date(result.generatedAt).toLocaleString()}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
