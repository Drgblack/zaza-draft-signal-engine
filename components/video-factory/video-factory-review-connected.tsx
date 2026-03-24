"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import VideoFactoryReview from "@/components/video-factory/VideoFactoryReview";
import type { ContentOpportunity, ContentOpportunityState } from "@/lib/content-opportunities";
import { deriveStructuredReasonsFromLegacyRegenerationReason } from "@/lib/video-factory-review-reasons";
import {
  buildVideoFactoryReviewBrief,
  buildVideoFactoryReviewJob,
  type PublishOutcomeSummary,
  type PreTriageConcern,
  type RegenerationReason,
} from "@/lib/video-factory-review-model";
import type {
  FactoryInputPublishOutcomeResponse,
  FactoryInputRenderStatusResponse,
  FactoryInputResponse,
} from "@/types/api";

function updateOpportunityFromState(
  state: ContentOpportunityState | null,
  opportunityId: string,
): ContentOpportunity | null {
  return state?.opportunities.find((item) => item.opportunityId === opportunityId) ?? null;
}

function shouldPoll(opportunity: ContentOpportunity | null): boolean {
  const status = opportunity?.generationState?.factoryLifecycle?.status ?? null;
  return (
    status === "queued" ||
    status === "preparing" ||
    status === "generating_narration" ||
    status === "generating_visuals" ||
    status === "generating_captions" ||
    status === "composing"
  );
}

export function VideoFactoryReviewConnected({
  initialOpportunity,
}: {
  initialOpportunity: ContentOpportunity;
}) {
  const router = useRouter();
  const [opportunity, setOpportunity] = useState(initialOpportunity);
  const [publishOutcome, setPublishOutcome] = useState<PublishOutcomeSummary | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "status" | "error";
    message: string;
  } | null>(null);
  const [thumbnailUrlDraft, setThumbnailUrlDraft] = useState(
    initialOpportunity.generationState?.renderedAsset?.thumbnailUrl ?? "",
  );
  const [isPending, startTransition] = useTransition();
  const activeProvider = useMemo(
    () => opportunity.generationState?.renderJob?.provider ?? "runway",
    [opportunity.generationState?.renderJob?.provider],
  );
  const activeJobId = opportunity.generationState?.renderJob?.id ?? null;
  const pollingEnabled = shouldPoll(opportunity);

  useEffect(() => {
    setOpportunity(initialOpportunity);
  }, [initialOpportunity]);

  useEffect(() => {
    setThumbnailUrlDraft(opportunity.generationState?.renderedAsset?.thumbnailUrl ?? "");
  }, [opportunity.generationState?.renderedAsset?.thumbnailUrl]);

  useEffect(() => {
    const reviewStatus = opportunity.generationState?.assetReview?.status ?? null;
    if (reviewStatus !== "accepted") {
      setPublishOutcome(null);
      return;
    }

    let cancelled = false;

    const loadPublishOutcome = async () => {
      try {
        const response = await fetch(
          `/api/factory-inputs/publish-outcome?opportunityId=${encodeURIComponent(opportunity.opportunityId)}`,
          { cache: "no-store" },
        );
        const data =
          (await response.json().catch(() => null)) as FactoryInputPublishOutcomeResponse | null;

        if (!response.ok || !data?.success || cancelled) {
          return;
        }

        setPublishOutcome(
          data.publishOutcome
            ? {
                published: data.publishOutcome.published,
                platform: data.publishOutcome.platform,
                publishDate: data.publishOutcome.publishDate,
                publishedUrl: data.publishOutcome.publishedUrl,
                impressions: data.publishOutcome.impressions,
                clicks: data.publishOutcome.clicks,
                signups: data.publishOutcome.signups,
              }
            : null,
        );
      } catch {
        if (!cancelled) {
          setPublishOutcome(null);
        }
      }
    };

    void loadPublishOutcome();

    return () => {
      cancelled = true;
    };
  }, [
    opportunity.opportunityId,
    opportunity.generationState?.assetReview?.status,
    opportunity.generationState?.renderedAsset?.id,
  ]);

  useEffect(() => {
    if (!pollingEnabled) {
      return;
    }

    let cancelled = false;

    const pollStatus = async () => {
      try {
        const response = await fetch(
          activeJobId
            ? `/api/render/render-status?jobId=${encodeURIComponent(activeJobId)}`
            : `/api/render/render-status?opportunityId=${encodeURIComponent(opportunity.opportunityId)}`,
          { cache: "no-store" },
        );
        const data =
          (await response.json().catch(() => null)) as FactoryInputRenderStatusResponse | null;
        if (!response.ok || !data?.success || !data.generationState || cancelled) {
          return;
        }

        setOpportunity((current) =>
          current
            ? {
                ...current,
                generationState: data.generationState,
              }
            : current,
        );
      } catch {
        // Polling failures should not interrupt the review flow.
      }
    };

    void pollStatus();
    const interval = window.setInterval(() => {
      void pollStatus();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeJobId, opportunity.opportunityId, pollingEnabled]);

  const brief = useMemo(
    () => buildVideoFactoryReviewBrief(opportunity),
    [opportunity],
  );
  const job = useMemo(
    () => buildVideoFactoryReviewJob(opportunity),
    [opportunity],
  );

  async function runFactoryAction(input: {
    url: string;
    method: "POST" | "PATCH";
    body: Record<string, unknown>;
  }) {
    const response = await fetch(input.url, {
      method: input.method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.body),
    });
    const data = (await response.json().catch(() => null)) as FactoryInputResponse | null;

    if (!response.ok || !data?.success) {
      throw new Error(data?.error ?? "Unable to update video factory state.");
    }

    const nextOpportunity = updateOpportunityFromState(data.state, opportunity.opportunityId);
    if (nextOpportunity) {
      setOpportunity(nextOpportunity);
    }
    if (data?.message) {
      setFeedback({
        kind: "status",
        message: data.message,
      });
    }
    router.refresh();
  }

  function runAction(callback: () => Promise<void>) {
    if (isPending) {
      return;
    }

    startTransition(async () => {
      try {
        setFeedback(null);
        await callback();
      } catch (error) {
        setFeedback({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to update video factory state.",
        });
      }
    });
  }

  function handleGenerate(preTriage: PreTriageConcern) {
    runAction(async () => {
      const briefApproved = Boolean(
        opportunity.generationState?.videoBriefApprovedAt &&
          opportunity.generationState?.videoBriefApprovedBy,
      );

      if (!briefApproved) {
        await runFactoryAction({
          url: "/api/factory-inputs",
          method: "PATCH",
          body: {
            action: "approve_video_brief_for_generation",
            opportunityId: opportunity.opportunityId,
          },
        });
      }

      await runFactoryAction({
        url: "/api/render/generate-video",
        method: "POST",
        body: {
          opportunityId: opportunity.opportunityId,
          provider: activeProvider,
          preTriageConcern: preTriage,
        },
      });
    });
  }

  function handleApprove() {
    runAction(async () => {
      await runFactoryAction({
        url: "/api/render/render-review",
        method: "PATCH",
        body: {
          opportunityId: opportunity.opportunityId,
          status: "accepted",
        },
      });
    });
  }

  function handleReject() {
    runAction(async () => {
      await runFactoryAction({
        url: "/api/render/render-review",
        method: "PATCH",
        body: {
          opportunityId: opportunity.opportunityId,
          status: "rejected",
        },
      });
    });
  }

  function handleRegenerate(reason: RegenerationReason) {
    runAction(async () => {
      await runFactoryAction({
        url: "/api/render/regenerate-video",
        method: "POST",
        body: {
          opportunityId: opportunity.opportunityId,
          provider: activeProvider,
          regenerationReason: reason,
          structuredReasons: deriveStructuredReasonsFromLegacyRegenerationReason(reason),
        },
      });
    });
  }

  function handleEditBrief() {
    if (isPending) {
      return;
    }

    router.push(`/factory-inputs?opportunityId=${encodeURIComponent(opportunity.opportunityId)}#opportunity-${opportunity.opportunityId}`);
  }

  function handleDiscard() {
    runAction(async () => {
      await runFactoryAction({
        url: "/api/render/discard-asset",
        method: "POST",
        body: {
          opportunityId: opportunity.opportunityId,
        },
      });
    });
  }

  function handleThumbnailOverride() {
    runAction(async () => {
      await runFactoryAction({
        url: "/api/render/thumbnail",
        method: "PATCH",
        body: {
          opportunityId: opportunity.opportunityId,
          action: "override",
          thumbnailUrl: thumbnailUrlDraft.trim(),
        },
      });
    });
  }

  function handleThumbnailReset() {
    runAction(async () => {
      await runFactoryAction({
        url: "/api/render/thumbnail",
        method: "PATCH",
        body: {
          opportunityId: opportunity.opportunityId,
          action: "reset_generated",
        },
      });
    });
  }

  if (!brief) {
    return null;
  }

  const canAdjustThumbnail = Boolean(opportunity.generationState?.renderedAsset?.id);

  return (
    <div id="review" className="space-y-4">
      {feedback ? (
        <div
          className={
            feedback.kind === "error"
              ? "rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700"
              : "rounded-2xl bg-white/80 px-4 py-3 text-sm text-slate-600"
          }
        >
          {feedback.message}
        </div>
      ) : null}
      {isPending ? (
        <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-slate-500">
          Updating factory review state...
        </div>
      ) : null}
      <VideoFactoryReview
        brief={brief}
        job={job}
        publishOutcome={publishOutcome}
        onGenerate={handleGenerate}
        onApprove={handleApprove}
        onReject={handleReject}
        onRegenerate={handleRegenerate}
        onEditBrief={handleEditBrief}
        onDiscard={handleDiscard}
        actionsDisabled={isPending}
      />
      {canAdjustThumbnail ? (
        <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-4">
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Thumbnail override</p>
              <p className="mt-1 text-xs text-slate-500">
                Override the current review/export thumbnail with a manual URL, or reset back to the generated thumbnail.
              </p>
            </div>
            <div className="flex flex-col gap-3 md:flex-row">
              <Input
                value={thumbnailUrlDraft}
                onChange={(event) => setThumbnailUrlDraft(event.target.value)}
                placeholder="https://..."
                disabled={isPending}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleThumbnailOverride}
                  disabled={isPending || thumbnailUrlDraft.trim().length === 0}
                >
                  Save override
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleThumbnailReset}
                  disabled={isPending}
                >
                  Reset generated
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
