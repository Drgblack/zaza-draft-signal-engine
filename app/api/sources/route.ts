import { NextResponse } from "next/server";

import { getSourceAutopilotV2State } from "@/lib/source-autopilot-v2";
import type { SourceRegistryResponse } from "@/types/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getSourceAutopilotV2State();

    return NextResponse.json<SourceRegistryResponse>({
      success: true,
      source: result.source,
      sources: result.sources,
      proposals: result.proposals,
      recentProposalChanges: result.recentChanges,
      proposalSummary: result.proposalSummary,
      message: result.error ?? result.message,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        source: "airtable",
        error: error instanceof Error ? error.message : "Unable to load source registry.",
      },
      { status: 500 },
    );
  }
}
