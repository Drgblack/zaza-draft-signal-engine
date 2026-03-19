import { NextResponse } from "next/server";

import { appendAuditEventsSafe, type AuditEventInput } from "@/lib/audit";
import { getSignalWithFallback, saveSignalWithFallback } from "@/lib/airtable";
import { getAuditEvents } from "@/lib/audit";
import { getPublishPrepPackageForPlatform, getSelectedCtaText, getSelectedHookText, parsePublishPrepBundle } from "@/lib/publish-prep";
import {
  appendPostingLogEntry,
  buildSignalPostingSummary,
  createPostingLogRequestSchema,
  getPostingLogEntries,
  getPostingPlatformLabel,
  type PostingPlatform,
} from "@/lib/posting-log";
import type { PostingLogResponse } from "@/types/api";
import type { SignalRecord } from "@/types/signal";

function getLatestAppliedPattern(signalId: string, events: Awaited<ReturnType<typeof getAuditEvents>>) {
  const latestEvent = [...events]
    .reverse()
    .find((event) => event.signalId === signalId && event.eventType === "PATTERN_APPLIED");

  return {
    patternId: typeof latestEvent?.metadata?.patternId === "string" ? latestEvent.metadata.patternId : null,
    patternName: typeof latestEvent?.metadata?.patternName === "string" ? latestEvent.metadata.patternName : null,
  };
}

function getSourceDraftStatus(signal: SignalRecord, platform: PostingPlatform) {
  switch (platform) {
    case "x":
      return signal.xReviewStatus;
    case "linkedin":
      return signal.linkedInReviewStatus;
    case "reddit":
    default:
      return signal.redditReviewStatus;
  }
}

function getSignalPlatformValue(postedPlatforms: string[]): string | null {
  if (postedPlatforms.length === 0) {
    return null;
  }

  if (postedPlatforms.length === 1) {
    return postedPlatforms[0];
  }

  return "Multiple";
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = createPostingLogRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<PostingLogResponse>(
      {
        success: false,
        persisted: false,
        entry: null,
        entries: [],
        signal: null,
        message: "Posting log could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid posting log payload.",
      },
      { status: 400 },
    );
  }

  const signalResult = await getSignalWithFallback(id);
  if (!signalResult.signal) {
    return NextResponse.json<PostingLogResponse>(
      {
        success: false,
        persisted: false,
        entry: null,
        entries: [],
        signal: null,
        message: "Posting log could not be saved.",
        error: signalResult.error ?? "Signal not found.",
      },
      { status: signalResult.source === "mock" ? 404 : 502 },
    );
  }

  const signal = signalResult.signal;
  const auditEvents = await getAuditEvents(signal.recordId);
  const latestAppliedPattern = getLatestAppliedPattern(signal.recordId, auditEvents);
  const publishPrepBundle = parsePublishPrepBundle(signal.publishPrepBundleJson);
  const publishPrepPackage = getPublishPrepPackageForPlatform(publishPrepBundle, parsed.data.platform);

  let entry;
  try {
    entry = await appendPostingLogEntry({
      signalId: signal.recordId,
      platform: parsed.data.platform,
      postedAt: parsed.data.postedAt,
      finalPostedText: parsed.data.finalPostedText,
      postUrl: parsed.data.postUrl ?? null,
      note: parsed.data.note ?? null,
      createdBy: parsed.data.createdBy ?? "operator",
      editorialMode: signal.editorialMode,
      patternId: latestAppliedPattern.patternId,
      patternName: latestAppliedPattern.patternName,
      scenarioAngle: signal.scenarioAngle,
      sourceDraftStatus: getSourceDraftStatus(signal, parsed.data.platform),
      publishPrepPackageId: publishPrepPackage?.id ?? null,
      selectedHookText: publishPrepPackage ? getSelectedHookText(publishPrepPackage) : null,
      selectedCtaText: publishPrepPackage ? getSelectedCtaText(publishPrepPackage) : null,
      suggestedPostingTime: publishPrepPackage?.suggestedPostingTime ?? null,
    });
  } catch (error) {
    return NextResponse.json<PostingLogResponse>(
      {
        success: false,
        persisted: false,
        entry: null,
        entries: [],
        signal,
        message: "Posting log could not be saved.",
        error: error instanceof Error ? error.message : "Invalid posting log data.",
      },
      { status: 400 },
    );
  }

  const entries = await getPostingLogEntries(signal.recordId);
  const postingSummary = buildSignalPostingSummary(signal, entries);
  const latestEntry = entries[0] ?? entry;
  const updatedStatus =
    postingSummary.allReadyDraftsPosted && signal.status !== "Posted" ? "Posted" : signal.status;
  const savedSignalResult = await saveSignalWithFallback(signal.recordId, {
    posted: true,
    postedDate: postingSummary.latestPostedAt,
    platformPostedTo: getSignalPlatformValue(postingSummary.postedPlatforms),
    postUrl: latestEntry.postUrl ?? signal.postUrl,
    finalCaptionUsed: latestEntry.finalPostedText,
    status: updatedStatus,
  });
  const nextSignal = savedSignalResult.signal ?? signal;
  const auditInputs: AuditEventInput[] = [
    {
      signalId: signal.recordId,
      eventType: "POST_LOGGED",
      actor: "operator",
      summary: `Logged ${getPostingPlatformLabel(entry.platform)} post.`,
      metadata: {
        platform: entry.platform,
        postedAt: entry.postedAt,
      },
    },
  ];

  if (entry.postUrl) {
    auditInputs.push({
      signalId: signal.recordId,
      eventType: "POST_URL_ADDED",
      actor: "operator",
      summary: `Added ${getPostingPlatformLabel(entry.platform)} post URL.`,
      metadata: {
        platform: entry.platform,
      },
    });
  }

  if (entry.note) {
    auditInputs.push({
      signalId: signal.recordId,
      eventType: "POST_NOTE_ADDED",
      actor: "operator",
      summary: `Added ${getPostingPlatformLabel(entry.platform)} posting note.`,
      metadata: {
        platform: entry.platform,
      },
    });
  }

  if (signal.status !== updatedStatus && updatedStatus === "Posted") {
    auditInputs.push({
      signalId: signal.recordId,
      eventType: "STATUS_CHANGED",
      actor: "operator",
      summary: "Marked signal as Posted after logging all ready platform posts.",
      metadata: {
        previousStatus: signal.status,
        nextStatus: updatedStatus,
      },
    });
  }

  await appendAuditEventsSafe(auditInputs);

  return NextResponse.json<PostingLogResponse>({
    success: true,
    persisted: true,
    entry,
    entries,
    signal: nextSignal,
    message:
      updatedStatus === "Posted"
        ? "Posting log saved and signal marked as posted because all ready drafts are now logged."
        : "Posting log saved to external publishing memory.",
  });
}
