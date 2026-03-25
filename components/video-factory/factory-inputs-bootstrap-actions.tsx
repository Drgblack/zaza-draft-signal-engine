"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { FactoryInputResponse } from "@/types/api";

export function FactoryInputsBootstrapActions({
  reviewHref,
  reviewLabel,
}: {
  reviewHref: string;
  reviewLabel: string;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreateTestOpportunity() {
    if (isPending) {
      return;
    }

    startTransition(async () => {
      setFeedback(null);

      try {
        const response = await fetch("/api/factory-inputs", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "create_test_opportunity",
          }),
        });
        const data = (await response.json().catch(() => null)) as FactoryInputResponse | null;

        if (!response.ok || !data?.success || !data.opportunityId) {
          throw new Error(data?.error ?? "Unable to create the test opportunity.");
        }

        router.push(
          `/factory-inputs?opportunityId=${encodeURIComponent(data.opportunityId)}&mode=builder#brief-builder`,
        );
        router.refresh();
      } catch (error) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "Unable to create the test opportunity.",
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={handleCreateTestOpportunity} disabled={isPending}>
          {isPending ? "Creating test opportunity..." : "Create test opportunity"}
        </Button>
        <Link
          href={reviewHref}
          className={buttonVariants({ variant: "secondary" })}
        >
          {reviewLabel}
        </Link>
      </div>
      {feedback ? (
        <p className="text-sm text-rose-700">{feedback}</p>
      ) : null}
    </div>
  );
}
