"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getEditorialModeDefinition } from "@/lib/editorial-modes";
import { buildFinalReviewSummary } from "@/lib/final-review";
import {
  buildSignalPostingSummary,
  getPostingPlatformLabel,
  type PostingLogEntry,
  type PostingPlatform,
} from "@/lib/posting-memory";
import { getPlatformIntentProfile } from "@/lib/platform-profiles";
import { formatDateTime } from "@/lib/utils";
import type { SignalDataSource, SignalRecord } from "@/types/signal";

type ReviewFormState = {
  finalXDraft: string;
  finalLinkedInDraft: string;
  finalRedditDraft: string;
  xReviewStatus: "" | "ready" | "needs_edit" | "skip";
  linkedInReviewStatus: "" | "ready" | "needs_edit" | "skip";
  redditReviewStatus: "" | "ready" | "needs_edit" | "skip";
  finalReviewNotes: string;
};

type PostingFormState = {
  postedAt: string;
  finalPostedText: string;
  postUrl: string;
  note: string;
};

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

function createFormState(signal: SignalRecord): ReviewFormState {
  return {
    finalXDraft: signal.finalXDraft ?? signal.xDraft ?? "",
    finalLinkedInDraft: signal.finalLinkedInDraft ?? signal.linkedInDraft ?? "",
    finalRedditDraft: signal.finalRedditDraft ?? signal.redditDraft ?? "",
    xReviewStatus: signal.xReviewStatus ?? "",
    linkedInReviewStatus: signal.linkedInReviewStatus ?? "",
    redditReviewStatus: signal.redditReviewStatus ?? "",
    finalReviewNotes: signal.finalReviewNotes ?? "",
  };
}

function statusLabel(value: ReviewFormState["xReviewStatus"]): string {
  switch (value) {
    case "ready":
      return "Ready";
    case "needs_edit":
      return "Needs edit";
    case "skip":
      return "Skip";
    default:
      return "Needs review";
  }
}

function statusClasses(value: ReviewFormState["xReviewStatus"]): string {
  switch (value) {
    case "ready":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "skip":
      return "bg-slate-100 text-slate-700 ring-slate-200";
    case "needs_edit":
    default:
      return "bg-amber-50 text-amber-700 ring-amber-200";
  }
}

function postingStateClasses(state: ReturnType<typeof buildSignalPostingSummary>["platformRows"][number]["state"]): string {
  switch (state) {
    case "posted":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "ready_not_posted":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "skip":
      return "bg-slate-100 text-slate-700 ring-slate-200";
    case "needs_edit":
    case "not_reviewed":
    default:
      return "bg-amber-50 text-amber-700 ring-amber-200";
  }
}

function postingStateLabel(state: ReturnType<typeof buildSignalPostingSummary>["platformRows"][number]["state"]): string {
  switch (state) {
    case "posted":
      return "Posted";
    case "ready_not_posted":
      return "Ready, not posted";
    case "skip":
      return "Skipped";
    case "needs_edit":
      return "Needs edit";
    case "not_reviewed":
    default:
      return "No post logged";
  }
}

function toDateTimeLocalValue(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const offset = parsed.getTimezoneOffset();
  return new Date(parsed.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function createPostingFormState(
  signal: SignalRecord,
  platform: PostingPlatform,
  latestEntry: PostingLogEntry | null,
): PostingFormState {
  const draftValue =
    platform === "x"
      ? signal.finalXDraft ?? signal.xDraft ?? ""
      : platform === "linkedin"
        ? signal.finalLinkedInDraft ?? signal.linkedInDraft ?? ""
        : signal.finalRedditDraft ?? signal.redditDraft ?? "";

  return {
    postedAt: toDateTimeLocalValue(latestEntry?.postedAt ?? new Date().toISOString()),
    finalPostedText: latestEntry?.finalPostedText ?? draftValue,
    postUrl: latestEntry?.postUrl ?? "",
    note: latestEntry?.note ?? "",
  };
}

export function FinalReviewWorkspace({
  signal,
  source,
  appliedPatternName,
  initialPostingEntries,
}: {
  signal: SignalRecord;
  source: SignalDataSource;
  appliedPatternName: string | null;
  initialPostingEntries: PostingLogEntry[];
}) {
  const [currentSignal, setCurrentSignal] = useState(signal);
  const [formState, setFormState] = useState<ReviewFormState>(() => createFormState(signal));
  const [savedState, setSavedState] = useState<ReviewFormState>(() => createFormState(signal));
  const [postingEntries, setPostingEntries] = useState<PostingLogEntry[]>(initialPostingEntries);
  const [activePostingPlatform, setActivePostingPlatform] = useState<PostingPlatform | null>(null);
  const [postingForms, setPostingForms] = useState<Record<PostingPlatform, PostingFormState>>(() => ({
    x: createPostingFormState(signal, "x", initialPostingEntries.find((entry) => entry.platform === "x") ?? null),
    linkedin: createPostingFormState(signal, "linkedin", initialPostingEntries.find((entry) => entry.platform === "linkedin") ?? null),
    reddit: createPostingFormState(signal, "reddit", initialPostingEntries.find((entry) => entry.platform === "reddit") ?? null),
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error";
    title: string;
    body: string;
  } | null>(null);

  const xProfile = useMemo(() => getPlatformIntentProfile("x"), []);
  const linkedInProfile = useMemo(() => getPlatformIntentProfile("linkedin"), []);
  const redditProfile = useMemo(() => getPlatformIntentProfile("reddit"), []);
  const isDirty = useMemo(
    () => JSON.stringify(formState) !== JSON.stringify(savedState),
    [formState, savedState],
  );
  const reviewSummary = useMemo(
    () =>
      buildFinalReviewSummary({
        ...currentSignal,
        finalXDraft:
          formState.finalXDraft !== savedState.finalXDraft ? formState.finalXDraft.trim() || null : currentSignal.finalXDraft,
        finalLinkedInDraft:
          formState.finalLinkedInDraft !== savedState.finalLinkedInDraft
            ? formState.finalLinkedInDraft.trim() || null
            : currentSignal.finalLinkedInDraft,
        finalRedditDraft:
          formState.finalRedditDraft !== savedState.finalRedditDraft
            ? formState.finalRedditDraft.trim() || null
            : currentSignal.finalRedditDraft,
        xReviewStatus: formState.xReviewStatus !== savedState.xReviewStatus ? formState.xReviewStatus || null : currentSignal.xReviewStatus,
        linkedInReviewStatus:
          formState.linkedInReviewStatus !== savedState.linkedInReviewStatus
            ? formState.linkedInReviewStatus || null
            : currentSignal.linkedInReviewStatus,
        redditReviewStatus:
          formState.redditReviewStatus !== savedState.redditReviewStatus
            ? formState.redditReviewStatus || null
            : currentSignal.redditReviewStatus,
        finalReviewNotes:
          formState.finalReviewNotes !== savedState.finalReviewNotes
            ? formState.finalReviewNotes.trim() || null
            : currentSignal.finalReviewNotes,
      }),
    [currentSignal, formState, savedState],
  );
  const postingSummary = useMemo(
    () => buildSignalPostingSummary(currentSignal, postingEntries),
    [currentSignal, postingEntries],
  );

  function updateField<K extends keyof ReviewFormState>(key: K, value: ReviewFormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function updatePostingField(platform: PostingPlatform, key: keyof PostingFormState, value: string) {
    setPostingForms((current) => ({
      ...current,
      [platform]: {
        ...current[platform],
        [key]: value,
      },
    }));
  }

  function openPostingForm(platform: PostingPlatform) {
    const latestEntry = postingEntries.find((entry) => entry.platform === platform) ?? null;
    setPostingForms((current) => ({
      ...current,
      [platform]: createPostingFormState(currentSignal, platform, latestEntry),
    }));
    setActivePostingPlatform((current) => (current === platform ? null : platform));
  }

  async function handleSave() {
    setFeedback(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/signals/${currentSignal.recordId}/review`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          finalXDraft: formState.finalXDraft,
          finalLinkedInDraft: formState.finalLinkedInDraft,
          finalRedditDraft: formState.finalRedditDraft,
          xReviewStatus: formState.xReviewStatus || null,
          linkedInReviewStatus: formState.linkedInReviewStatus || null,
          redditReviewStatus: formState.redditReviewStatus || null,
          finalReviewNotes: formState.finalReviewNotes,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        source?: SignalDataSource;
        signal?: SignalRecord | null;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.success || !data.signal) {
        throw new Error(data.error ?? "Unable to save final review.");
      }

      const nextState = createFormState(data.signal);
      setCurrentSignal(data.signal);
      setFormState(nextState);
      setSavedState(nextState);
      setFeedback({
        tone: data.source === "airtable" ? "success" : "warning",
        title: data.source === "airtable" ? "Saved to Airtable" : "Saved in mock mode",
        body: data.message ?? "Final review saved.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Save failed",
        body: error instanceof Error ? error.message : "Unable to save final review.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePostingSave(platform: PostingPlatform) {
    setFeedback(null);
    setIsPosting(true);

    try {
      const form = postingForms[platform];
      const response = await fetch(`/api/signals/${currentSignal.recordId}/posting-log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform,
          postedAt: form.postedAt,
          finalPostedText: form.finalPostedText,
          postUrl: form.postUrl,
          note: form.note,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        entry?: PostingLogEntry | null;
        entries?: PostingLogEntry[];
        signal?: SignalRecord | null;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.success || !data.entry || !Array.isArray(data.entries)) {
        throw new Error(data.error ?? "Unable to log posted draft.");
      }

      setPostingEntries(data.entries);
      if (data.signal) {
        setCurrentSignal(data.signal);
      }
      setActivePostingPlatform(null);
      setFeedback({
        tone: "success",
        title: "Post logged",
        body: data.message ?? `${getPostingPlatformLabel(platform)} post recorded.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Posting log failed",
        body: error instanceof Error ? error.message : "Unable to save posting log.",
      });
    } finally {
      setIsPosting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Final Review Workspace</CardTitle>
          <CardDescription>
            Compare platform drafts, make final edits, and record which outputs are ready, need more work, or should be skipped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Review readiness</p>
              <p className="mt-2 text-sm font-medium text-slate-950">{reviewSummary.summary}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Ready now</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{reviewSummary.readyCount}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Needs edit</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{reviewSummary.needsEditCount}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Skipped</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{reviewSummary.skipCount}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">Posting memory</p>
            <p className="mt-2">{postingSummary.summary}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
              <span>{postingSummary.totalPosts} posts logged</span>
              <span>{postingSummary.postedPlatformsCount} platforms posted</span>
              {postingSummary.latestPostedAt ? <span>Latest {formatDateTime(postingSummary.latestPostedAt)}</span> : null}
            </div>
          </div>

          <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
            Drafts are reviewed here with the current Scenario Angle, interpretation, optional applied pattern, editorial mode, and platform profile already in mind.
            {appliedPatternName ? ` Last applied pattern: ${appliedPatternName}.` : ""}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Scenario Angle</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{currentSignal.scenarioAngle ?? "Not set"}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Interpretation</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">{currentSignal.contentAngle ?? currentSignal.interpretationNotes ?? "Not set"}</p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Editorial Mode</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {currentSignal.editorialMode ? getEditorialModeDefinition(currentSignal.editorialMode).label : "Not set"}
              </p>
            </div>
            <div className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Review state</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {reviewSummary.started ? "Final review started" : "Final review not started"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {source === "airtable" ? "Live Airtable review state" : "Mock review state"} · {isDirty ? "Unsaved changes" : "All review fields saved"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        {[
          {
            key: "x" as const,
            label: "X Draft",
            helper: xProfile.helperNote,
            structure: xProfile.structure,
            generatedValue: currentSignal.xDraft ?? "",
            finalValue: formState.finalXDraft,
            statusValue: formState.xReviewStatus,
          },
          {
            key: "linkedin" as const,
            label: "LinkedIn Draft",
            helper: linkedInProfile.helperNote,
            structure: linkedInProfile.structure,
            generatedValue: currentSignal.linkedInDraft ?? "",
            finalValue: formState.finalLinkedInDraft,
            statusValue: formState.linkedInReviewStatus,
          },
          {
            key: "reddit" as const,
            label: "Reddit Draft",
            helper: redditProfile.helperNote,
            structure: redditProfile.structure,
            generatedValue: currentSignal.redditDraft ?? "",
            finalValue: formState.finalRedditDraft,
            statusValue: formState.redditReviewStatus,
          },
        ].map((panel) => (
          <Card key={panel.key}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>{panel.label}</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusClasses(panel.statusValue)}`}>
                    {statusLabel(panel.statusValue)}
                  </span>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${postingStateClasses(postingSummary.platformRows.find((row) => row.platform === panel.key)?.state ?? "not_reviewed")}`}>
                    {postingStateLabel(postingSummary.platformRows.find((row) => row.platform === panel.key)?.state ?? "not_reviewed")}
                  </span>
                </div>
              </div>
              <CardDescription>
                {panel.helper}. {panel.structure}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
                <p className="font-medium text-slate-900">Generated draft</p>
                <p className="mt-2 whitespace-pre-wrap">{panel.generatedValue || "No generated draft saved."}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${panel.key}-final`}>Final editable draft</Label>
                <Textarea
                  id={`${panel.key}-final`}
                  value={panel.finalValue}
                  onChange={(event) => {
                    if (panel.key === "x") {
                      updateField("finalXDraft", event.target.value);
                    } else if (panel.key === "linkedin") {
                      updateField("finalLinkedInDraft", event.target.value);
                    } else {
                      updateField("finalRedditDraft", event.target.value);
                    }
                  }}
                  className="min-h-[220px]"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${panel.key}-status`}>Final decision</Label>
                <Select
                  id={`${panel.key}-status`}
                  value={panel.statusValue}
                  onChange={(event) => {
                    const nextValue = event.target.value as ReviewFormState["xReviewStatus"];
                    if (panel.key === "x") {
                      updateField("xReviewStatus", nextValue);
                    } else if (panel.key === "linkedin") {
                      updateField("linkedInReviewStatus", nextValue);
                    } else {
                      updateField("redditReviewStatus", nextValue);
                    }
                  }}
                >
                  <option value="">Needs review</option>
                  <option value="ready">Ready</option>
                  <option value="needs_edit">Needs edit</option>
                  <option value="skip">Skip</option>
                </Select>
              </div>
              <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium text-slate-900">Posting memory</p>
                  <Button type="button" variant="secondary" size="sm" onClick={() => openPostingForm(panel.key)}>
                    {postingSummary.platformRows.find((row) => row.platform === panel.key)?.latestEntry ? "Log another posted entry" : "Mark as posted"}
                  </Button>
                </div>
                {postingSummary.platformRows.find((row) => row.platform === panel.key)?.latestEntry ? (
                  <div className="mt-3 space-y-2">
                    <p>
                      Latest logged post: {formatDateTime(postingSummary.platformRows.find((row) => row.platform === panel.key)?.latestEntry?.postedAt ?? null)}
                    </p>
                    <p className="line-clamp-4 whitespace-pre-wrap">
                      {postingSummary.platformRows.find((row) => row.platform === panel.key)?.latestEntry?.finalPostedText}
                    </p>
                    {postingSummary.platformRows.find((row) => row.platform === panel.key)?.latestEntry?.postUrl ? (
                      <Link
                        href={postingSummary.platformRows.find((row) => row.platform === panel.key)?.latestEntry?.postUrl ?? "#"}
                        target="_blank"
                        className="text-[color:var(--accent)] underline underline-offset-4"
                      >
                        Open live URL
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3">
                    No external publishing entry logged for {getPostingPlatformLabel(panel.key)} yet.
                  </p>
                )}
              </div>
              {activePostingPlatform === panel.key ? (
                <div className="space-y-4 rounded-2xl border border-black/8 bg-white/80 p-4">
                  <div className="grid gap-2">
                    <Label htmlFor={`${panel.key}-posted-at`}>Posted date and time</Label>
                    <Input
                      id={`${panel.key}-posted-at`}
                      type="datetime-local"
                      value={postingForms[panel.key].postedAt}
                      onChange={(event) => updatePostingField(panel.key, "postedAt", event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${panel.key}-posted-text`}>Final posted text</Label>
                    <Textarea
                      id={`${panel.key}-posted-text`}
                      value={postingForms[panel.key].finalPostedText}
                      onChange={(event) => updatePostingField(panel.key, "finalPostedText", event.target.value)}
                      className="min-h-[160px]"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${panel.key}-post-url`}>Post URL</Label>
                    <Input
                      id={`${panel.key}-post-url`}
                      placeholder="https://..."
                      value={postingForms[panel.key].postUrl}
                      onChange={(event) => updatePostingField(panel.key, "postUrl", event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${panel.key}-post-note`}>Posting note</Label>
                    <Textarea
                      id={`${panel.key}-post-note`}
                      value={postingForms[panel.key].note}
                      onChange={(event) => updatePostingField(panel.key, "note", event.target.value)}
                      className="min-h-[100px]"
                      placeholder="Anything worth remembering about what was actually posted?"
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button type="button" onClick={() => handlePostingSave(panel.key)} disabled={isPosting}>
                      {isPosting ? "Saving..." : "Save posting log"}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setActivePostingPlatform(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overall Review Notes</CardTitle>
          <CardDescription>One compact note for the final editorial decision.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={formState.finalReviewNotes}
            onChange={(event) => updateField("finalReviewNotes", event.target.value)}
            className="min-h-[140px]"
            placeholder="What is strongest, what still needs work, and what should be skipped?"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save final review"}
            </Button>
            <Link href={`/signals/${currentSignal.recordId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Back to record
            </Link>
            <Link href="/review" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Back to review queue
            </Link>
            <p className="text-sm text-slate-500">
              Final review saves edited drafts and per-platform decisions without changing manual posting workflow.
            </p>
          </div>
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
