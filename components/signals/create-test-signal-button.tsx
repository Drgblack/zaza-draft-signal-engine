"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { CreateTestSignalApiResponse } from "@/types/api";

export function CreateTestSignalButton() {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreateTestSignal() {
    if (isPending) {
      return;
    }

    startTransition(async () => {
      setFeedback(null);

      try {
        const response = await fetch("/api/signals/test-signal", {
          method: "POST",
        });
        const data =
          (await response.json().catch(() => null)) as CreateTestSignalApiResponse | null;

        if (!response.ok || !data?.success || !data.signal?.recordId) {
          throw new Error(data?.error ?? "Unable to create the test signal.");
        }

        router.push("/review?view=ready_to_approve#approval-ready");
        router.refresh();
      } catch (error) {
        setFeedback(
          error instanceof Error ? error.message : "Unable to create the test signal.",
        );
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={handleCreateTestSignal} disabled={isPending}>
        {isPending ? "Creating test signal..." : "Create test signal"}
      </Button>
      {feedback ? <p className="text-sm text-rose-700">{feedback}</p> : null}
    </div>
  );
}
