"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  buildSignalAssetBundle,
  buildGeneratedImagePlaceholderUrl,
  getAssetPrimaryImage,
  getAssetPrimaryVideo,
  parseAssetBundle,
  stringifyAssetBundle,
  type AssetBundle,
  type AssetPrimaryType,
} from "@/lib/assets";
import {
  buildRepurposingBundleSummary,
  buildSignalRepurposingBundle,
  parseRepurposingBundle,
  parseSelectedRepurposedOutputIds,
  stringifyRepurposingBundle,
  stringifySelectedRepurposedOutputIds,
  type RepurposedOutput,
  type RepurposingBundle,
} from "@/lib/repurposing";
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
  imagePrompt: string;
  videoScript: string;
  assetBundleJson: string;
  preferredAssetType: "" | AssetPrimaryType;
  selectedImageAssetId: string;
  selectedVideoConceptId: string;
  generatedImageUrl: string;
  repurposingBundleJson: string;
  selectedRepurposedOutputIdsJson: string;
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
  const assetBundleJson = signal.assetBundleJson ?? stringifyAssetBundle(buildSignalAssetBundle(signal)) ?? "";
  const repurposingBundle = buildSignalRepurposingBundle(signal);
  const repurposingBundleJson = signal.repurposingBundleJson ?? stringifyRepurposingBundle(repurposingBundle) ?? "";
  const selectedRepurposedOutputIdsJson =
    signal.selectedRepurposedOutputIdsJson ??
    stringifySelectedRepurposedOutputIds(repurposingBundle?.recommendedSubset ?? []) ??
    "";

  return {
    finalXDraft: signal.finalXDraft ?? signal.xDraft ?? "",
    finalLinkedInDraft: signal.finalLinkedInDraft ?? signal.linkedInDraft ?? "",
    finalRedditDraft: signal.finalRedditDraft ?? signal.redditDraft ?? "",
    xReviewStatus: signal.xReviewStatus ?? "",
    linkedInReviewStatus: signal.linkedInReviewStatus ?? "",
    redditReviewStatus: signal.redditReviewStatus ?? "",
    finalReviewNotes: signal.finalReviewNotes ?? "",
    imagePrompt: signal.imagePrompt ?? "",
    videoScript: signal.videoScript ?? "",
    assetBundleJson,
    preferredAssetType: signal.preferredAssetType ?? "",
    selectedImageAssetId: signal.selectedImageAssetId ?? "",
    selectedVideoConceptId: signal.selectedVideoConceptId ?? "",
    generatedImageUrl: signal.generatedImageUrl ?? "",
    repurposingBundleJson,
    selectedRepurposedOutputIdsJson,
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
        imagePrompt: formState.imagePrompt !== savedState.imagePrompt ? formState.imagePrompt.trim() || null : currentSignal.imagePrompt,
        videoScript: formState.videoScript !== savedState.videoScript ? formState.videoScript.trim() || null : currentSignal.videoScript,
        assetBundleJson:
          formState.assetBundleJson !== savedState.assetBundleJson ? formState.assetBundleJson.trim() || null : currentSignal.assetBundleJson,
        preferredAssetType:
          formState.preferredAssetType !== savedState.preferredAssetType ? formState.preferredAssetType || null : currentSignal.preferredAssetType,
        selectedImageAssetId:
          formState.selectedImageAssetId !== savedState.selectedImageAssetId
            ? formState.selectedImageAssetId.trim() || null
            : currentSignal.selectedImageAssetId,
        selectedVideoConceptId:
          formState.selectedVideoConceptId !== savedState.selectedVideoConceptId
            ? formState.selectedVideoConceptId.trim() || null
            : currentSignal.selectedVideoConceptId,
        generatedImageUrl:
          formState.generatedImageUrl !== savedState.generatedImageUrl
            ? formState.generatedImageUrl.trim() || null
            : currentSignal.generatedImageUrl,
        repurposingBundleJson:
          formState.repurposingBundleJson !== savedState.repurposingBundleJson
            ? formState.repurposingBundleJson.trim() || null
            : currentSignal.repurposingBundleJson,
        selectedRepurposedOutputIdsJson:
          formState.selectedRepurposedOutputIdsJson !== savedState.selectedRepurposedOutputIdsJson
            ? formState.selectedRepurposedOutputIdsJson.trim() || null
            : currentSignal.selectedRepurposedOutputIdsJson,
      }),
    [currentSignal, formState, savedState],
  );
  const postingSummary = useMemo(
    () => buildSignalPostingSummary(currentSignal, postingEntries),
    [currentSignal, postingEntries],
  );
  const assetBundle = useMemo(() => parseAssetBundle(formState.assetBundleJson), [formState.assetBundleJson]);
  const primaryImageAsset = useMemo(
    () => getAssetPrimaryImage(assetBundle, formState.selectedImageAssetId || null),
    [assetBundle, formState.selectedImageAssetId],
  );
  const primaryVideoConcept = useMemo(
    () => getAssetPrimaryVideo(assetBundle, formState.selectedVideoConceptId || null),
    [assetBundle, formState.selectedVideoConceptId],
  );
  const repurposingBundle = useMemo(
    () => parseRepurposingBundle(formState.repurposingBundleJson),
    [formState.repurposingBundleJson],
  );
  const selectedRepurposedOutputIds = useMemo(
    () => parseSelectedRepurposedOutputIds(formState.selectedRepurposedOutputIdsJson),
    [formState.selectedRepurposedOutputIdsJson],
  );
  const repurposingSummary = useMemo(
    () => buildRepurposingBundleSummary(repurposingBundle),
    [repurposingBundle],
  );

  function updateField<K extends keyof ReviewFormState>(key: K, value: ReviewFormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function updateAssetBundle(mutator: (bundle: AssetBundle) => AssetBundle) {
    setFormState((current) => {
      const bundle = parseAssetBundle(current.assetBundleJson);
      if (!bundle) {
        return current;
      }

      return {
        ...current,
        assetBundleJson: stringifyAssetBundle(mutator(bundle)) ?? "",
      };
    });
  }

  function updateRepurposingBundle(mutator: (bundle: RepurposingBundle) => RepurposingBundle) {
    setFormState((current) => {
      const bundle = parseRepurposingBundle(current.repurposingBundleJson);
      if (!bundle) {
        return current;
      }

      const nextBundle = mutator(bundle);
      const selectedIds = parseSelectedRepurposedOutputIds(current.selectedRepurposedOutputIdsJson).filter((id) =>
        nextBundle.outputs.some((output) => output.id === id),
      );

      return {
        ...current,
        repurposingBundleJson: stringifyRepurposingBundle(nextBundle) ?? "",
        selectedRepurposedOutputIdsJson: stringifySelectedRepurposedOutputIds(selectedIds) ?? "",
      };
    });
  }

  function toggleRepurposedOutput(outputId: string) {
    const nextIds = selectedRepurposedOutputIds.includes(outputId)
      ? selectedRepurposedOutputIds.filter((id) => id !== outputId)
      : [...selectedRepurposedOutputIds, outputId];
    updateField("selectedRepurposedOutputIdsJson", stringifySelectedRepurposedOutputIds(nextIds) ?? "");
  }

  function updateRepurposedOutput(outputId: string, patch: Partial<RepurposedOutput>) {
    updateRepurposingBundle((bundle) => ({
      ...bundle,
      outputs: bundle.outputs.map((output) => (output.id === outputId ? { ...output, ...patch } : output)),
    }));
  }

  function removeRepurposedOutput(outputId: string) {
    updateRepurposingBundle((bundle) => ({
      ...bundle,
      outputs: bundle.outputs.filter((output) => output.id !== outputId),
      recommendedSubset: (bundle.recommendedSubset ?? []).filter((id) => id !== outputId),
    }));
  }

  function handleImageSelection(imageAssetId: string) {
    updateField("selectedImageAssetId", imageAssetId);
    const selected = assetBundle?.imageAssets.find((asset) => asset.id === imageAssetId);
    if (selected) {
      updateField("imagePrompt", selected.imagePrompt);
    }
  }

  function handleVideoSelection(videoConceptId: string) {
    updateField("selectedVideoConceptId", videoConceptId);
    const selected = assetBundle?.videoConcepts.find((concept) => concept.id === videoConceptId);
    if (selected) {
      updateField("videoScript", selected.scriptShort);
    }
  }

  function handleImagePromptEdit(value: string) {
    updateField("imagePrompt", value);
    if (!formState.selectedImageAssetId) {
      return;
    }

    updateAssetBundle((bundle) => ({
      ...bundle,
      imageAssets: bundle.imageAssets.map((asset) =>
        asset.id === formState.selectedImageAssetId ? { ...asset, imagePrompt: value } : asset,
      ),
    }));
  }

  function handleVideoScriptEdit(value: string) {
    updateField("videoScript", value);
    if (!formState.selectedVideoConceptId) {
      return;
    }

    updateAssetBundle((bundle) => ({
      ...bundle,
      videoConcepts: bundle.videoConcepts.map((concept) =>
        concept.id === formState.selectedVideoConceptId ? { ...concept, scriptShort: value } : concept,
      ),
    }));
  }

  function handleGenerateImagePlaceholder() {
    if (!formState.selectedImageAssetId) {
      return;
    }

    updateField("generatedImageUrl", buildGeneratedImagePlaceholderUrl(currentSignal.recordId, formState.selectedImageAssetId));
    setFeedback({
      tone: "warning",
      title: "Placeholder image generated",
      body: "A mock generated-image reference was attached so the preferred visual can travel with final review.",
    });
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
          imagePrompt: formState.imagePrompt,
          videoScript: formState.videoScript,
          assetBundleJson: formState.assetBundleJson || null,
          preferredAssetType: formState.preferredAssetType || null,
          selectedImageAssetId: formState.selectedImageAssetId || null,
          selectedVideoConceptId: formState.selectedVideoConceptId || null,
          generatedImageUrl: formState.generatedImageUrl || null,
          repurposingBundleJson: formState.repurposingBundleJson || null,
          selectedRepurposedOutputIdsJson: formState.selectedRepurposedOutputIdsJson || null,
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

          {assetBundle ? (
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Asset review</p>
              <p className="mt-2">
                Primary asset is currently {formState.preferredAssetType === "image" ? "image-first" : formState.preferredAssetType === "video" ? "video-first" : "text-first"}.
              </p>
              <p className="mt-2">
                Image concept: {primaryImageAsset?.conceptTitle ?? "Not selected"} · Video concept: {primaryVideoConcept?.conceptTitle ?? "Not selected"}
              </p>
            </div>
          ) : null}

          {repurposingBundle ? (
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Repurposing bundle</p>
              <p className="mt-2">
                Repurposed into {repurposingSummary?.count ?? repurposingBundle.outputs.length} variants with {repurposingSummary?.primaryPlatformLabel ?? "LinkedIn"} as the primary platform.
              </p>
              <p className="mt-2">
                Selected variants: {selectedRepurposedOutputIds.length > 0 ? selectedRepurposedOutputIds.length : repurposingBundle.recommendedSubset?.length ?? 0}
              </p>
            </div>
          ) : null}

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

      {assetBundle ? (
        <Card>
          <CardHeader>
            <CardTitle>Asset Concepts</CardTitle>
            <CardDescription>
              Lightweight final review for the preferred visual or short-form video support. This stays prompt-and-script level only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="review-primary-asset-type">Primary asset type</Label>
                <Select
                  id="review-primary-asset-type"
                  value={formState.preferredAssetType}
                  onChange={(event) => updateField("preferredAssetType", event.target.value as ReviewFormState["preferredAssetType"])}
                >
                  <option value="">Text-first</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="text_first">Text-first</option>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="review-image-concept">Image concept</Label>
                <Select id="review-image-concept" value={formState.selectedImageAssetId} onChange={(event) => handleImageSelection(event.target.value)}>
                  <option value="">No image concept</option>
                  {assetBundle.imageAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.conceptTitle}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="review-video-concept">Video concept</Label>
                <Select id="review-video-concept" value={formState.selectedVideoConceptId} onChange={(event) => handleVideoSelection(event.target.value)}>
                  <option value="">No video concept</option>
                  {assetBundle.videoConcepts.map((concept) => (
                    <option key={concept.id} value={concept.id}>
                      {concept.conceptTitle}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
                <p className="font-medium text-slate-900">Selected image concept</p>
                <p className="mt-2">{primaryImageAsset?.conceptTitle ?? "No image concept selected"}</p>
                <p className="mt-2 leading-6">{primaryImageAsset?.conceptDescription}</p>
                {primaryImageAsset ? (
                  <>
                    <p className="mt-2">Style: {primaryImageAsset.visualStyle} · Ratio: {primaryImageAsset.aspectRatio}</p>
                    <p className="mt-2">Platforms: {primaryImageAsset.platformSuggestions.join(" · ")}</p>
                    {primaryImageAsset.textOverlay ? <p className="mt-2">Text overlay: {primaryImageAsset.textOverlay}</p> : null}
                  </>
                ) : null}
              </div>
              <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
                <p className="font-medium text-slate-900">Selected video concept</p>
                <p className="mt-2">{primaryVideoConcept?.conceptTitle ?? "No video concept selected"}</p>
                <p className="mt-2 leading-6">{primaryVideoConcept?.conceptDescription}</p>
                {primaryVideoConcept ? (
                  <>
                    <p className="mt-2">Hook: {primaryVideoConcept.hook}</p>
                    <p className="mt-2">Platforms: {primaryVideoConcept.platformSuggestions.join(" · ")}</p>
                    <div className="mt-3 space-y-1">
                      {primaryVideoConcept.shotList.map((shot) => (
                        <p key={shot}>- {shot}</p>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="review-image-prompt">Editable image prompt</Label>
                <Textarea id="review-image-prompt" value={formState.imagePrompt} onChange={(event) => handleImagePromptEdit(event.target.value)} className="min-h-[180px]" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="review-video-script">Editable video script</Label>
                <Textarea id="review-video-script" value={formState.videoScript} onChange={(event) => handleVideoScriptEdit(event.target.value)} className="min-h-[180px]" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={handleGenerateImagePlaceholder}>
                Generate image
              </Button>
              <p className="text-sm text-slate-500">
                Provider-agnostic placeholder only for now. It stores a mock generated-image reference on the signal.
              </p>
            </div>
            {formState.generatedImageUrl ? (
              <div className="rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-900">Generated image reference</p>
                <p className="mt-2 break-all">{formState.generatedImageUrl}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {repurposingBundle ? (
        <Card>
          <CardHeader>
            <CardTitle>Repurposed Outputs</CardTitle>
            <CardDescription>
              One strong idea expanded into a few bounded platform variants. Select the ones worth keeping, edit them, or remove weak variants.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Bundle summary</p>
              <p className="mt-2">
                {repurposingSummary
                  ? `Repurposed into ${repurposingSummary.count} variants. Primary platform: ${repurposingSummary.primaryPlatformLabel}.`
                  : "No repurposing summary available."}
              </p>
              {repurposingSummary?.previewLabels.length ? (
                <p className="mt-2">Top previews: {repurposingSummary.previewLabels.join(" · ")}</p>
              ) : null}
            </div>

            <div className="space-y-4">
              {repurposingBundle.outputs.map((output) => {
                const selected = selectedRepurposedOutputIds.includes(output.id);
                const platformLabel =
                  output.platform === "x"
                    ? "X"
                    : output.platform === "linkedin"
                      ? "LinkedIn"
                      : output.platform === "reddit"
                        ? "Reddit"
                        : output.platform === "email"
                          ? "Email"
                          : output.platform === "video"
                            ? "Video"
                            : output.platform === "carousel"
                              ? "Carousel"
                              : "Founder thought";

                return (
                  <div key={output.id} className="rounded-2xl bg-slate-50/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full bg-slate-950 px-2.5 py-1 text-xs font-medium text-white">{platformLabel}</span>
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{output.formatType}</span>
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                          <input type="checkbox" checked={selected} onChange={() => toggleRepurposedOutput(output.id)} />
                          Select
                        </label>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeRepurposedOutput(output.id)}>
                        Remove variant
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor={`${output.id}-title`}>Title</Label>
                        <Input
                          id={`${output.id}-title`}
                          value={output.title ?? ""}
                          onChange={(event) => updateRepurposedOutput(output.id, { title: event.target.value || null })}
                          placeholder="Optional title"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`${output.id}-hook`}>Hook</Label>
                        <Input
                          id={`${output.id}-hook`}
                          value={output.hook ?? ""}
                          onChange={(event) => updateRepurposedOutput(output.id, { hook: event.target.value || null })}
                          placeholder="Optional hook"
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2">
                      <Label htmlFor={`${output.id}-content`}>Content</Label>
                      <Textarea
                        id={`${output.id}-content`}
                        value={output.content}
                        onChange={(event) => updateRepurposedOutput(output.id, { content: event.target.value })}
                        className="min-h-[180px]"
                      />
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor={`${output.id}-cta`}>CTA</Label>
                        <Input
                          id={`${output.id}-cta`}
                          value={output.CTA ?? ""}
                          onChange={(event) => updateRepurposedOutput(output.id, { CTA: event.target.value || null })}
                          placeholder="Optional CTA"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`${output.id}-notes`}>Notes</Label>
                        <Input
                          id={`${output.id}-notes`}
                          value={output.notes ?? ""}
                          onChange={(event) => updateRepurposedOutput(output.id, { notes: event.target.value || null })}
                          placeholder="Optional operator note"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

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
