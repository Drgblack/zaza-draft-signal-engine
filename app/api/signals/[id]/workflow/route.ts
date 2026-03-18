import { NextResponse } from "next/server";

import { saveSignalWithFallback } from "@/lib/airtable";
import {
  toWorkflowSavePayload,
  workflowUpdateRequestSchema,
  type SaveWorkflowResponse,
} from "@/types/api";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = workflowUpdateRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: "airtable",
        signal: null,
        message: "Workflow update could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid workflow payload.",
      },
      { status: 400 },
    );
  }

  const workflow = toWorkflowSavePayload(parsed.data);
  const result = await saveSignalWithFallback(id, {
    status: workflow.status,
    reviewNotes: workflow.reviewNotes,
    scheduledDate: workflow.scheduledDate ?? undefined,
    postedDate: workflow.status === "Posted" ? workflow.postedDate ?? new Date().toISOString() : workflow.postedDate ?? undefined,
    platformPostedTo: workflow.platformPostedTo ?? undefined,
    postUrl: workflow.postUrl ?? undefined,
    finalCaptionUsed: workflow.finalCaptionUsed ?? undefined,
    posted: workflow.status === "Posted" ? true : undefined,
  });

  if (!result.signal) {
    return NextResponse.json(
      {
        success: false,
        persisted: result.persisted,
        source: result.source,
        signal: null,
        message: "Workflow update could not be saved.",
        error: result.error ?? "Signal not found.",
      },
      { status: result.source === "mock" ? 404 : 502 },
    );
  }

  return NextResponse.json<SaveWorkflowResponse>({
    success: true,
    persisted: result.persisted,
    source: result.source,
    signal: result.signal,
    message:
      result.source === "airtable"
        ? `Workflow updated in Airtable. Record is now ${workflow.status}.`
        : `Workflow updated in mock mode. Record is now ${workflow.status} for the current session flow only.`,
  });
}
