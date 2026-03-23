"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ZazaConnectBridgeResponse } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export function ConnectBridgePanel({
  initialPayloadText,
}: {
  initialPayloadText: string;
}) {
  const router = useRouter();
  const [payloadText, setPayloadText] = useState(initialPayloadText);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isCreatingExport, setIsCreatingExport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  async function createExport() {
    setIsCreatingExport(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/connect-bridge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create_export",
        }),
      });
      const data = (await response.json().catch(() => null)) as ZazaConnectBridgeResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error ?? "Unable to create bridge export.");
      }

      setFeedback(data.message);
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to create bridge export.");
    } finally {
      setIsCreatingExport(false);
    }
  }

  async function importContext() {
    setIsImporting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/connect-bridge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "import_context",
          payloadText,
        }),
      });
      const data = (await response.json().catch(() => null)) as ZazaConnectBridgeResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error ?? "Unable to import Zaza Connect context.");
      }

      setFeedback(data.message);
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to import Zaza Connect context.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Card className="border-black/6 bg-white/74 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
        <CardHeader>
          <CardTitle>Create Export</CardTitle>
          <CardDescription>
            Build a portable JSON snapshot for Zaza Connect from the current weekly content and relationship context.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-black/5 bg-white/76 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-slate-100 text-slate-700 ring-slate-200">Loose coupling</Badge>
              <Badge className="bg-sky-50 text-sky-700 ring-sky-200">JSON export</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Exported context includes strong weekly content, influencer-relevant posts, campaign support signals, distribution opportunities, and relationship-memory hints.
            </p>
          </div>
          <Button onClick={createExport} disabled={isCreatingExport}>
            {isCreatingExport ? "Creating export..." : "Create bridge export"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-black/6 bg-white/74 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
        <CardHeader>
          <CardTitle>Import Zaza Connect Context</CardTitle>
          <CardDescription>
            Paste a compact serialized context payload from Zaza Connect to enrich outreach, planning, and digest hints.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs leading-5 text-slate-500">
            Paste compact JSON or serialized bridge context only. The import stays additive and never overwrites existing planning data.
          </p>
          <Textarea
            value={payloadText}
            onChange={(event) => setPayloadText(event.target.value)}
            className="min-h-[280px] font-mono text-xs leading-5"
          />
          <Button variant="secondary" onClick={importContext} disabled={isImporting}>
            {isImporting ? "Importing..." : "Import context"}
          </Button>
          {feedback ? (
            <div className="rounded-2xl border border-black/5 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
              {feedback}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
