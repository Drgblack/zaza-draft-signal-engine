"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExperimentProposalResponse } from "@/types/api";

type ExperimentProposalVariant = {
  variantId: string;
  variantLabel: string;
  summary: string;
  linkedSignalIds: string[];
  platform: "x" | "linkedin" | "reddit" | null;
};

type ExperimentProposal = {
  proposalId: string;
  signalId: string;
  sourceTitle: string;
  experimentType:
    | "hook_variant_test"
    | "cta_variant_test"
    | "destination_test"
    | "editorial_mode_test"
    | "platform_expression_test"
    | "pattern_vs_no_pattern_test";
  whyProposed: string;
  candidateVariants: ExperimentProposalVariant[];
  expectedLearningGoal: string;
  comparisonTarget: string | null;
  reviewHref: string;
  status: "open" | "dismissed" | "postponed" | "confirmed";
};

function experimentTypeLabel(value: ExperimentProposal["experimentType"]): string {
  switch (value) {
    case "hook_variant_test":
      return "Hook variant test";
    case "cta_variant_test":
      return "CTA variant test";
    case "destination_test":
      return "Destination test";
    case "editorial_mode_test":
      return "Editorial mode test";
    case "platform_expression_test":
      return "Platform expression test";
    case "pattern_vs_no_pattern_test":
    default:
      return "Pattern vs no-pattern";
  }
}

async function postAction(body: {
  action: "confirm_proposal" | "dismiss_proposal" | "postpone_proposal";
  proposal: ExperimentProposal;
}) {
  const response = await fetch("/api/experiment-proposals", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return (await response.json()) as ExperimentProposalResponse;
}

export function ExperimentProposalSection({
  proposals,
}: {
  proposals: ExperimentProposal[];
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    title: string;
    body: string;
  } | null>(null);
  const [pendingProposalId, setPendingProposalId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction(
    proposal: ExperimentProposal,
    action: "confirm_proposal" | "dismiss_proposal" | "postpone_proposal",
  ) {
    setPendingProposalId(proposal.proposalId);
    startTransition(() => {
      void (async () => {
        try {
          const result = await postAction({ action, proposal });
          if (!result.success) {
            setFeedback({
              tone: "error",
              title: "Unable to update experiment proposal",
              body: result.error ?? result.message,
            });
            setPendingProposalId(null);
            return;
          }

          setFeedback({
            tone: "success",
            title: action === "confirm_proposal" ? "Experiment created" : "Experiment proposal updated",
            body: result.message,
          });
          router.refresh();
          setPendingProposalId(null);
        } catch (error) {
          setFeedback({
            tone: "error",
            title: "Unable to update experiment proposal",
            body: error instanceof Error ? error.message : "The experiment proposal action failed.",
          });
          setPendingProposalId(null);
        }
      })();
    });
  }

  return (
    <div id="experiment-proposals">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-4">
            <span>Autonomous Experiment Proposals</span>
            <span className="text-sm font-medium text-slate-500">{proposals.length}</span>
          </CardTitle>
          <CardDescription>
            The system proposes small experiments when uncertainty or tradeoffs are meaningful enough to test. Nothing is created until the operator confirms it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {feedback ? (
            <div
              className={`rounded-2xl px-4 py-3 text-sm ${
                feedback.tone === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              }`}
            >
              <p className="font-medium">{feedback.title}</p>
              <p className="mt-1">{feedback.body}</p>
            </div>
          ) : null}

          {proposals.length === 0 ? (
            <div className="rounded-2xl bg-white/80 px-4 py-5 text-sm text-slate-500">
              No strong experiment proposal is active right now.
            </div>
          ) : (
            proposals.map((proposal) => (
              <div key={proposal.proposalId} className="rounded-2xl bg-white/80 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-slate-950 px-2.5 py-1 text-xs font-medium text-white">
                        {experimentTypeLabel(proposal.experimentType)}
                      </span>
                      <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
                        Operator confirmation required
                      </span>
                    </div>
                    <div>
                      <Link href={proposal.reviewHref} className="text-lg font-semibold text-slate-950 hover:text-[color:var(--accent)]">
                        {proposal.sourceTitle}
                      </Link>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{proposal.whyProposed}</p>
                    </div>
                    <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                      <p>
                        <span className="font-medium text-slate-900">Learning goal:</span> {proposal.expectedLearningGoal}
                      </p>
                      <p>
                        <span className="font-medium text-slate-900">Comparison target:</span> {proposal.comparisonTarget ?? "Bounded variant comparison"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => runAction(proposal, "confirm_proposal")}
                        disabled={isPending && pendingProposalId === proposal.proposalId}
                      >
                        Confirm experiment
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => runAction(proposal, "postpone_proposal")}
                        disabled={isPending && pendingProposalId === proposal.proposalId}
                      >
                        Postpone
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => runAction(proposal, "dismiss_proposal")}
                        disabled={isPending && pendingProposalId === proposal.proposalId}
                      >
                        Dismiss
                      </Button>
                      <Link href={proposal.reviewHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                        Open review
                      </Link>
                    </div>
                  </div>

                  <div className="min-w-80 space-y-3 rounded-2xl bg-slate-50/80 p-4 text-sm text-slate-600">
                    {proposal.candidateVariants.map((variant) => (
                      <div key={variant.variantId} className="rounded-2xl bg-white/90 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                            {variant.variantLabel}
                          </span>
                          {variant.platform ? (
                            <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                              {variant.platform === "x" ? "X" : variant.platform === "linkedin" ? "LinkedIn" : "Reddit"}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 leading-6">{variant.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
