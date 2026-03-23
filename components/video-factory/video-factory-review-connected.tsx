"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import VideoFactoryReview from "@/components/video-factory/VideoFactoryReview";
import type { ContentOpportunity, ContentOpportunityState } from "@/lib/content-opportunities";
import {
  buildVideoFactoryReviewBrief,
  buildVideoFactoryReviewJob,
  type PreTriageConcern,
  type RegenerationReason,
} from "@/lib/video-factory-review-model";
import type { FactoryInputRenderStatusResponse, FactoryInputResponse } from "@/types/api";

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
  const [feedback, setFeedback] = useState<{
    kind: "status" | "error";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeProvider = useMemo(
    () => opportunity.generationState?.renderJob?.provider ?? "runway",
    [opportunity.generationState?.renderJob?.provider],
  );
  const pollingEnabled = shouldPoll(opportunity);

  useEffect(() => {
    setOpportunity(initialOpportunity);
  }, [initialOpportunity]);

  useEffect(() => {
    if (!pollingEnabled) {
      return;
    }

    let cancelled = false;

    const pollStatus = async () => {
      try {
        const response = await fetch(
          `/api/factory-inputs/render-status?opportunityId=${encodeURIComponent(opportunity.opportunityId)}`,
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
  }, [opportunity.opportunityId, pollingEnabled]);

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
        url: "/api/factory-inputs/generate-video",
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
        url: "/api/factory-inputs/render-review",
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
        url: "/api/factory-inputs/render-review",
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
        url: "/api/factory-inputs/regenerate-video",
        method: "POST",
        body: {
          opportunityId: opportunity.opportunityId,
          provider: activeProvider,
          regenerationReason: reason,
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
        url: "/api/factory-inputs/discard-asset",
        method: "POST",
        body: {
          opportunityId: opportunity.opportunityId,
        },
      });
    });
  }

  if (!brief) {
    return null;
  }

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
        onGenerate={handleGenerate}
        onApprove={handleApprove}
        onReject={handleReject}
        onRegenerate={handleRegenerate}
        onEditBrief={handleEditBrief}
        onDiscard={handleDiscard}
        actionsDisabled={isPending}
      />
    </div>
  );
}
