"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DistributionBundle } from "@/lib/distribution";
import type { NarrativeSequenceStepMatch } from "@/lib/narrative-sequences";
import type { PostingAssistantPackage } from "@/lib/posting-assistant";
import { getPostingPlatformLabel } from "@/lib/posting-memory";
import type { SafePostingEligibilityAssessment } from "@/lib/safe-posting";
import type {
  DistributionActionResponse,
  PostingAssistantActionResponse,
} from "@/types/api";

function statusClasses(status: PostingAssistantPackage["status"]) {
  if (status === "posted") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (status === "staged_for_posting") {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }

  if (status === "canceled") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function toDateTimeLocalValue(value: string | null | undefined) {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const offset = parsed.getTimezoneOffset();
  return new Date(parsed.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function distributionActionLabel(actionType: DistributionBundle["actions"][number]["actionType"]) {
  switch (actionType) {
    case "prepare_multi_platform_set":
      return "Multi-platform set";
    case "prepare_linkedin_version":
      return "LinkedIn version";
    case "prepare_reddit_version":
      return "Reddit version";
    case "prepare_x_version":
      return "X version";
    case "prepare_comment_reply":
      return "Comment reply";
    case "prepare_follow_up_message":
      return "Follow-up note";
    case "prepare_post_package":
    default:
      return "Full post package";
  }
}

export function PostingAssistantPanel({
  packages,
  sequenceByPackageId = {},
  distributionBundles = [],
  safePostingEligibilityByPackageId = {},
  safeModeEnabled,
  safePostingRequiresConfirmation,
}: {
  packages: PostingAssistantPackage[];
  sequenceByPackageId?: Record<string, NarrativeSequenceStepMatch | null>;
  distributionBundles?: DistributionBundle[];
  safePostingEligibilityByPackageId?: Record<string, SafePostingEligibilityAssessment | null>;
  safeModeEnabled: boolean;
  safePostingRequiresConfirmation: boolean;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [activeConfirmPackageId, setActiveConfirmPackageId] = useState<string | null>(null);
  const [activeSafeConfirmPackageId, setActiveSafeConfirmPackageId] = useState<string | null>(null);
  const [activeBundleId, setActiveBundleId] = useState<string | null>(null);
  const [activeSafePostPackageId, setActiveSafePostPackageId] = useState<string | null>(null);
  const [postedAtByPackageId, setPostedAtByPackageId] = useState<Record<string, string>>(
    Object.fromEntries(packages.map((pkg) => [pkg.packageId, toDateTimeLocalValue(pkg.postedAt)])),
  );
  const [postUrlByPackageId, setPostUrlByPackageId] = useState<Record<string, string>>(
    Object.fromEntries(packages.map((pkg) => [pkg.packageId, pkg.postUrl ?? ""])),
  );
  const [noteByPackageId, setNoteByPackageId] = useState<Record<string, string>>(
    Object.fromEntries(packages.map((pkg) => [pkg.packageId, pkg.note ?? ""])),
  );
  const [isPending, startTransition] = useTransition();

  const stagedPackages = packages.filter((pkg) => pkg.status === "staged_for_posting");
  const postedPackages = packages.filter((pkg) => pkg.status === "posted").slice(0, 6);

  async function runAction(body: object) {
    const response = await fetch("/api/posting-assistant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as PostingAssistantActionResponse | null;

    if (!response.ok || !data?.success) {
      throw new Error(data?.error ?? "Unable to update posting assistant package.");
    }

    setFeedback(data.message);
    router.refresh();
  }

  async function prepareBundle(bundle: DistributionBundle) {
    const response = await fetch("/api/distribution", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bundleId: bundle.bundleId,
        signalId: bundle.signalId,
        packageIds: bundle.packageIds,
      }),
    });
    const data = (await response.json().catch(() => null)) as DistributionActionResponse | null;

    if (!response.ok || !data?.success) {
      throw new Error(data?.error ?? "Unable to prepare distribution bundle.");
    }

    setFeedback(data.message);
    router.refresh();
  }

  function cancelPackage(packageId: string) {
    startTransition(() => {
      void runAction({
        action: "cancel_package",
        packageId,
      }).catch((error) => {
        setFeedback(error instanceof Error ? error.message : "Unable to cancel staged package.");
      });
    });
  }

  function confirmPosted(pkg: PostingAssistantPackage) {
    startTransition(() => {
      void runAction({
        action: "confirm_posted",
        packageId: pkg.packageId,
        postedAt: postedAtByPackageId[pkg.packageId] ?? toDateTimeLocalValue(new Date().toISOString()),
        postUrl: postUrlByPackageId[pkg.packageId] || null,
        note: noteByPackageId[pkg.packageId] || null,
      })
        .then(() => setActiveConfirmPackageId(null))
        .catch((error) => {
          setFeedback(error instanceof Error ? error.message : "Unable to confirm manual posting.");
        });
    });
  }

  function runSafePost(pkg: PostingAssistantPackage, confirm: boolean) {
    startTransition(() => {
      setActiveSafePostPackageId(pkg.packageId);
      void runAction({
        action: "safe_post_now",
        packageId: pkg.packageId,
        confirm,
      })
        .then(() => setActiveSafeConfirmPackageId(null))
        .catch((error) => {
          setFeedback(
            error instanceof Error
              ? error.message
              : "Unable to complete strict safe-mode posting.",
          );
        })
        .finally(() => setActiveSafePostPackageId(null));
    });
  }

  function copyValue(label: string, value: string | null | undefined) {
    if (!value?.trim()) {
      setCopyFeedback(`No ${label.toLowerCase()} is available to copy.`);
      return;
    }

    void navigator.clipboard.writeText(value).then(
      () => setCopyFeedback(`${label} copied.`),
      () => setCopyFeedback(`Unable to copy ${label.toLowerCase()}.`),
    );
  }

  return (
    <div className="space-y-4">
      {feedback ? (
        <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">{feedback}</div>
      ) : null}
      {copyFeedback ? (
        <div className="rounded-2xl bg-slate-50/80 px-4 py-4 text-sm text-slate-600">{copyFeedback}</div>
      ) : null}

      {distributionBundles.length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white/80 px-4 py-4">
            <p className="font-medium text-slate-950">Distribution bundles</p>
            <p className="mt-2 text-sm text-slate-600">
              Safe-mode bundles keep all prepared platform variants, comment prompts, and follow-up notes grouped together for manual execution. Nothing posts automatically.
            </p>
          </div>
          {distributionBundles.map((bundle) => (
            <div key={bundle.bundleId} className="rounded-2xl bg-white/80 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                  {bundle.platforms.length > 1 ? "Multi-platform bundle" : "Single-platform package"}
                </Badge>
                {bundle.platforms.map((platform) => (
                  <Badge key={`${bundle.bundleId}:${platform}`} className="bg-slate-100 text-slate-700 ring-slate-200">
                    {getPostingPlatformLabel(platform)}
                  </Badge>
                ))}
                {bundle.sequenceLabel ? (
                  <Badge className="bg-violet-50 text-violet-700 ring-violet-200">
                    {bundle.sequenceLabel}
                  </Badge>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-950">{bundle.sourceTitle}</p>
                  <p className="mt-2 text-sm text-slate-600">
                    {bundle.sequenceReason ??
                      (bundle.platforms.length > 1
                        ? "Prepared variants are grouped so one signal can move through a compact manual distribution flow."
                        : "Prepared package is ready for a single-platform manual posting pass.")}
                  </p>
                  {bundle.suggestedCadenceNotes ? (
                    <p className="mt-2 text-xs text-slate-500">{bundle.suggestedCadenceNotes}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={bundle.reviewHref}>
                    <Button size="sm" variant="secondary">Open final review</Button>
                  </Link>
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(() => {
                        setActiveBundleId(bundle.bundleId);
                        void prepareBundle(bundle)
                          .catch((error) => {
                            setFeedback(error instanceof Error ? error.message : "Unable to prepare distribution bundle.");
                          })
                          .finally(() => setActiveBundleId(null));
                      })
                    }
                  >
                    {activeBundleId === bundle.bundleId && isPending ? "Preparing..." : "Prepare bundle"}
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Distribution checklist</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {bundle.checklist.map((item) => (
                    <Badge key={`${bundle.bundleId}:${item}`} className="bg-white text-slate-700 ring-slate-200">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {bundle.actions.map((action) => (
                  <div key={action.actionId} className="rounded-2xl bg-slate-50/80 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-white text-slate-700 ring-slate-200">
                          {distributionActionLabel(action.actionType)}
                        </Badge>
                        {action.targetPlatform ? (
                          <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                            {getPostingPlatformLabel(action.targetPlatform)}
                          </Badge>
                        ) : null}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => copyValue(distributionActionLabel(action.actionType), action.preparedContent)}>
                        Copy
                      </Button>
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-400">Required operator step</p>
                    <p className="mt-2 text-sm text-slate-700">{action.requiredOperatorStep}</p>
                    <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-400">Prepared content</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{action.preparedContent}</p>
                    {action.notes ? <p className="mt-3 text-xs text-slate-500">{action.notes}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {stagedPackages.length === 0 ? (
        <div className="rounded-2xl bg-slate-100 px-4 py-4 text-sm text-slate-600">
          No staged posting packages are waiting for manual publishing confirmation yet.
        </div>
      ) : (
        stagedPackages.map((pkg) => (
          <div key={pkg.packageId} className="rounded-2xl bg-white/80 px-4 py-4">
            {safePostingEligibilityByPackageId[pkg.packageId] ? (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge
                  className={
                    safePostingEligibilityByPackageId[pkg.packageId]?.postingEligibility ===
                    "eligible_safe_post"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : safePostingEligibilityByPackageId[pkg.packageId]
                            ?.postingEligibility === "manual_only"
                        ? "bg-sky-50 text-sky-700 ring-sky-200"
                        : "bg-amber-50 text-amber-700 ring-amber-200"
                  }
                >
                  {safePostingEligibilityByPackageId[pkg.packageId]?.postingEligibility ===
                  "eligible_safe_post"
                    ? "Eligible for safe posting"
                    : safePostingEligibilityByPackageId[pkg.packageId]
                          ?.postingEligibility === "manual_only"
                      ? "Manual only"
                      : "Blocked from safe posting"}
                </Badge>
                {safePostingEligibilityByPackageId[pkg.packageId]?.supportedExecutionPath ? (
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                    {safePostingEligibilityByPackageId[pkg.packageId]?.supportedExecutionPath}
                  </Badge>
                ) : null}
              </div>
            ) : null}
            {sequenceByPackageId[pkg.packageId] ? (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge className="bg-violet-50 text-violet-700 ring-violet-200">
                  {sequenceByPackageId[pkg.packageId]?.narrativeLabel}
                </Badge>
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                  Step {sequenceByPackageId[pkg.packageId]?.stepNumber} of {sequenceByPackageId[pkg.packageId]?.totalSteps}
                </Badge>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={statusClasses(pkg.status)}>Staged for posting</Badge>
              <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{getPostingPlatformLabel(pkg.platform)}</Badge>
              {pkg.founderVoiceMode === "founder_voice_on" ? (
                <Badge className="bg-violet-50 text-violet-700 ring-violet-200">Founder voice</Badge>
              ) : null}
              {pkg.selectedAssetType ? (
                <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                  {pkg.selectedAssetType.replaceAll("_", " ")}
                </Badge>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-950">{pkg.sourceTitle}</p>
                <p className="mt-2 text-sm text-slate-600">{pkg.readinessReason}</p>
                {pkg.lastExecutionError ? (
                  <p className="mt-2 text-sm text-rose-600">{pkg.lastExecutionError}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={pkg.reviewHref}>
                  <Button size="sm" variant="secondary">Open final review</Button>
                </Link>
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => cancelPackage(pkg.packageId)}>
                  Cancel staging
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Hook</p>
                <p className="mt-2 text-sm text-slate-700">{pkg.selectedHook ?? "No hook locked"}</p>
              </div>
              <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">CTA</p>
                <p className="mt-2 text-sm text-slate-700">{pkg.selectedCta ?? "No CTA locked"}</p>
              </div>
              <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Destination</p>
                <p className="mt-2 text-sm text-slate-700">{pkg.selectedDestination?.label ?? "No destination locked"}</p>
              </div>
              <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Timing suggestion</p>
                <p className="mt-2 text-sm text-slate-700">{pkg.timingSuggestion ?? "No timing suggestion"}</p>
              </div>
            </div>

            {safePostingEligibilityByPackageId[pkg.packageId] ? (
              <div className="mt-4 rounded-2xl bg-slate-50/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  Strict safe-mode status
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  {safePostingEligibilityByPackageId[pkg.packageId]?.summary}
                </p>
                {safePostingEligibilityByPackageId[pkg.packageId]?.postingEligibility ===
                "blocked" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {safePostingEligibilityByPackageId[pkg.packageId]?.blockReasons.map(
                      (reason) => (
                        <Badge
                          key={`${pkg.packageId}:${reason}`}
                          className="bg-white text-slate-700 ring-slate-200"
                        >
                          {reason}
                        </Badge>
                      ),
                    )}
                  </div>
                ) : null}
                {safePostingEligibilityByPackageId[pkg.packageId]?.postingEligibility ===
                "manual_only" ? (
                  <p className="mt-3 text-xs text-slate-500">
                    {safePostingEligibilityByPackageId[pkg.packageId]?.manualOnlyReason}
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-slate-500">
                  Safe mode is {safeModeEnabled ? "enabled" : "disabled"} and final confirmation is{" "}
                  {safePostingRequiresConfirmation ? "required" : "optional"}.
                </p>
              </div>
            ) : null}

            {sequenceByPackageId[pkg.packageId] ? (
              <div className="mt-4 rounded-2xl bg-slate-50/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Narrative sequence</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {sequenceByPackageId[pkg.packageId]?.rationale}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {sequenceByPackageId[pkg.packageId]?.sequenceReason}
                </p>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 xl:grid-cols-[1.35fr_0.65fr]">
              <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Final caption</p>
                  <Button size="sm" variant="ghost" onClick={() => copyValue("Caption", pkg.finalCaption)}>
                    Copy caption
                  </Button>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{pkg.finalCaption}</p>
              </div>
              <div className="space-y-3">
                <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Final URL</p>
                    <Button size="sm" variant="ghost" onClick={() => copyValue("URL", pkg.finalUtmUrl ?? pkg.selectedDestination?.url)}>
                      Copy URL
                    </Button>
                  </div>
                  <p className="mt-2 break-all text-sm text-slate-700">{pkg.finalUtmUrl ?? pkg.selectedDestination?.url ?? "No destination URL"}</p>
                </div>
                <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Asset</p>
                  <p className="mt-2 text-sm text-slate-700">{pkg.selectedAssetLabel ?? "Text-first, no visual asset"}</p>
                  {pkg.selectedAssetReference ? <p className="mt-2 break-all text-xs text-slate-500">{pkg.selectedAssetReference}</p> : null}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Comment prompt</p>
                  <Button size="sm" variant="ghost" onClick={() => copyValue("Comment prompt", pkg.commentPrompt)}>
                    Copy prompt
                  </Button>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-700">{pkg.commentPrompt ?? "No comment prompt prepared."}</p>
              </div>
              <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Alt text</p>
                  <Button size="sm" variant="ghost" onClick={() => copyValue("Alt text", pkg.altText)}>
                    Copy alt text
                  </Button>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-700">{pkg.altText ?? "No alt text prepared."}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {safePostingEligibilityByPackageId[pkg.packageId]?.postingEligibility ===
              "eligible_safe_post" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isPending}
                  onClick={() =>
                    safePostingRequiresConfirmation
                      ? setActiveSafeConfirmPackageId((current) =>
                          current === pkg.packageId ? null : pkg.packageId,
                        )
                      : runSafePost(pkg, false)
                  }
                >
                  {activeSafePostPackageId === pkg.packageId && isPending
                    ? "Posting..."
                    : "Post now (safe mode)"}
                </Button>
              ) : null}
              <Button size="sm" onClick={() => setActiveConfirmPackageId((current) => (current === pkg.packageId ? null : pkg.packageId))}>
                {activeConfirmPackageId === pkg.packageId ? "Hide confirmation" : "Mark as posted"}
              </Button>
            </div>

            {activeSafeConfirmPackageId === pkg.packageId ? (
              <div className="mt-4 space-y-4 rounded-2xl border border-black/8 bg-white p-4">
                <div>
                  <p className="font-medium text-slate-950">
                    Confirm strict safe-mode posting
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    This will use the staged package exactly as shown below and record
                    the posting source as <code>engine_safe_mode</code>.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      Platform
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {getPostingPlatformLabel(pkg.platform)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      CTA
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {pkg.selectedCta ?? "No CTA locked"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      Timing
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {pkg.timingSuggestion ?? "No timing suggestion"}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      Destination
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {pkg.finalUtmUrl ?? pkg.selectedDestination?.url ?? "No destination URL"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      Asset
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {pkg.selectedAssetLabel ?? "Text-first"}
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Final caption
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {pkg.finalCaption}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() => runSafePost(pkg, true)}
                  >
                    {activeSafePostPackageId === pkg.packageId && isPending
                      ? "Posting..."
                      : "Confirm and post"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setActiveSafeConfirmPackageId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {activeConfirmPackageId === pkg.packageId ? (
              <div className="mt-4 space-y-4 rounded-2xl border border-black/8 bg-white p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor={`${pkg.packageId}-posted-at`}>Posted date and time</Label>
                    <Input
                      id={`${pkg.packageId}-posted-at`}
                      type="datetime-local"
                      value={postedAtByPackageId[pkg.packageId] ?? ""}
                      onChange={(event) =>
                        setPostedAtByPackageId((current) => ({ ...current, [pkg.packageId]: event.target.value }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${pkg.packageId}-post-url`}>Post URL</Label>
                    <Input
                      id={`${pkg.packageId}-post-url`}
                      placeholder="https://..."
                      value={postUrlByPackageId[pkg.packageId] ?? ""}
                      onChange={(event) =>
                        setPostUrlByPackageId((current) => ({ ...current, [pkg.packageId]: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${pkg.packageId}-note`}>Posting note</Label>
                  <Textarea
                    id={`${pkg.packageId}-note`}
                    className="min-h-[96px]"
                    placeholder="Anything worth preserving from the live posting step?"
                    value={noteByPackageId[pkg.packageId] ?? ""}
                    onChange={(event) =>
                      setNoteByPackageId((current) => ({ ...current, [pkg.packageId]: event.target.value }))
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={isPending} onClick={() => confirmPosted(pkg)}>
                    {isPending ? "Saving..." : "Confirm manual posting"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setActiveConfirmPackageId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ))
      )}

      {postedPackages.length > 0 ? (
        <div className="rounded-2xl bg-white/80 px-4 py-4">
          <p className="font-medium text-slate-950">Recently confirmed from staged packages</p>
          <div className="mt-3 space-y-3">
            {postedPackages.map((pkg) => (
              <div key={pkg.packageId} className="rounded-2xl bg-slate-50/80 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusClasses(pkg.status)}>Posted</Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{getPostingPlatformLabel(pkg.platform)}</Badge>
                </div>
                <p className="mt-3 font-medium text-slate-950">{pkg.sourceTitle}</p>
                <p className="mt-2 text-sm text-slate-600">{pkg.postedAt ? `Confirmed ${pkg.postedAt.slice(0, 10)}` : "Recently confirmed"}</p>
                {pkg.executionSource === "engine_safe_mode" ? (
                  <p className="mt-2 text-xs text-slate-500">Posted via strict safe mode.</p>
                ) : null}
                {pkg.postUrl ? (
                  <Link href={pkg.postUrl} target="_blank" className="mt-2 inline-flex text-sm text-[color:var(--accent)] underline underline-offset-4">
                    Open live URL
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
