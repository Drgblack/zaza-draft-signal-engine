import { NextResponse } from "next/server";

import { getSignalWithFallback, listSignalsWithFallback } from "@/lib/signal-repository";
import { buildAudienceMemoryState, getAudienceMemorySegment } from "@/lib/audience-memory";
import { appendAuditEventsSafe } from "@/lib/audit";
import { syncAttributionMemory } from "@/lib/attribution";
import { getCampaignStrategy } from "@/lib/campaigns";
import { buildInfluencerOutreachContext } from "@/lib/influencer-graph";
import { listPostingLogEntries } from "@/lib/posting-log";
import { generateOutreachMessage } from "@/lib/outreach";
import { buildRevenueSignalsFromInputs } from "@/lib/revenue-signals";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import {
  buildZazaConnectSignalHints,
  listImportedZazaConnectContexts,
} from "@/lib/zaza-connect-bridge";
import { outreachRequestSchema, type OutreachResponse } from "@/types/api";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = outreachRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        signal: null,
        result: null,
        message: "Outreach message could not be generated.",
        error: parsed.error.issues[0]?.message ?? "Invalid outreach request.",
      } satisfies OutreachResponse,
      { status: 400 },
    );
  }

  const signalResult = await getSignalWithFallback(parsed.data.signalId);
  if (!signalResult.signal) {
    return NextResponse.json(
      {
        success: false,
        signal: null,
        result: null,
        message: "Outreach message could not be generated.",
        error: signalResult.error ?? "Signal not found.",
      } satisfies OutreachResponse,
      { status: 404 },
    );
  }

  const [influencerContext, importedContexts, strategy, allSignalsResult, postingEntries, strategicOutcomes] = await Promise.all([
    parsed.data.influencerId
      ? buildInfluencerOutreachContext(parsed.data.influencerId)
      : Promise.resolve(null),
    listImportedZazaConnectContexts(),
    getCampaignStrategy(),
    listSignalsWithFallback({ limit: 1000 }),
    listPostingLogEntries(),
    listStrategicOutcomes(),
  ]);
  const attributionRecords = await syncAttributionMemory({
    signals: allSignalsResult.signals,
    postingEntries,
    strategicOutcomes,
  });
  const revenueSignals = buildRevenueSignalsFromInputs({
    signals: allSignalsResult.signals,
    postingEntries,
    strategicOutcomes,
  });
  const audienceMemory = buildAudienceMemoryState({
    strategy,
    signals: allSignalsResult.signals,
    postingEntries,
    strategicOutcomes,
    attributionRecords,
    revenueSignals,
  });
  const audienceMemoryHint = getAudienceMemorySegment(audienceMemory, signalResult.signal.audienceSegmentId);
  const zazaConnectHints = buildZazaConnectSignalHints({
    signal: signalResult.signal,
    importedContexts,
    influencerName: influencerContext?.influencer.name ?? parsed.data.recipientName ?? null,
    influencerTags: influencerContext?.influencer.tags ?? [],
    relationshipStage: influencerContext?.influencer.relationshipStage ?? null,
  });

  const result = await generateOutreachMessage({
    signal: signalResult.signal,
    outreachType: parsed.data.outreachType,
    platform: parsed.data.platform,
    tone: parsed.data.tone,
    influencer: influencerContext?.influencer ?? null,
    recentInteractions: influencerContext?.interactions ?? [],
    recipientName: parsed.data.recipientName,
    creatorFocus: parsed.data.creatorFocus,
    relationshipContext: parsed.data.relationshipContext,
    collaborationGoal: parsed.data.collaborationGoal,
    inboundMessage: parsed.data.inboundMessage,
    founderVoiceMode: parsed.data.founderVoiceMode ?? signalResult.signal.founderVoiceMode ?? "founder_voice_on",
    zazaConnectHints,
    audienceMemoryHint,
  });

  await appendAuditEventsSafe([
    {
      signalId: signalResult.signal.recordId,
      eventType: "OUTREACH_MESSAGE_GENERATED",
      actor: "operator",
      summary: `Generated ${parsed.data.outreachType.replaceAll("_", " ")} outreach copy for ${parsed.data.platform}.`,
      metadata: {
        outreachType: parsed.data.outreachType,
        platform: parsed.data.platform,
        tone: parsed.data.tone,
        founderVoiceMode: result.founderVoiceMode,
        influencerId: influencerContext?.influencer.influencerId ?? null,
        relationshipStage: influencerContext?.influencer.relationshipStage ?? null,
        bridgeThemes: zazaConnectHints.matchedThemes.length,
        bridgeCollabHints: zazaConnectHints.collaborationNotes.length,
        audienceSegment: audienceMemoryHint?.segmentName ?? null,
      },
    },
  ]);

  if (zazaConnectHints.summary.length > 0) {
    await appendAuditEventsSafe([
      {
        signalId: signalResult.signal.recordId,
        eventType: "ZAZA_CONNECT_BRIDGE_REFERENCED",
        actor: "system",
        summary: "Referenced imported Zaza Connect context while generating outreach.",
        metadata: {
          matchedThemes: zazaConnectHints.matchedThemes.length,
          collaborationNotes: zazaConnectHints.collaborationNotes.length,
          relationshipHints: zazaConnectHints.relationshipHints.length,
        },
      },
    ]);
  }

  return NextResponse.json<OutreachResponse>({
    success: true,
    signal: signalResult.signal,
    result,
    influencer: influencerContext?.influencer ?? null,
    message:
      result.generationSource === "mock"
        ? "Mock outreach message generated for manual use."
        : "Outreach message generated for manual use.",
  });
}

