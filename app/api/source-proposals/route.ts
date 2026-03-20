import { NextResponse } from "next/server";

import {
  applySourceChangeProposalAction,
  sourceChangeProposalActionSchema,
} from "@/lib/source-autopilot-v2";
import type { SourceProposalActionResponse } from "@/types/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = sourceChangeProposalActionSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: "airtable",
        error: parsed.error.issues[0]?.message ?? "Invalid source proposal payload.",
      },
      { status: 400 },
    );
  }

  try {
    const { proposal, state } = await applySourceChangeProposalAction(parsed.data);

    return NextResponse.json<SourceProposalActionResponse>({
      success: true,
      persisted: true,
      source: state.source,
      proposal,
      proposals: state.proposals,
      recentProposalChanges: state.recentChanges,
      proposalSummary: state.proposalSummary,
      sources: state.sources,
      message:
        parsed.data.action === "approve"
          ? `${proposal?.title ?? "Source change"} approved and applied.`
          : `${proposal?.title ?? "Source change"} dismissed.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        persisted: false,
        source: "airtable",
        error: error instanceof Error ? error.message : "Unable to process source proposal.",
      },
      { status: 500 },
    );
  }
}
