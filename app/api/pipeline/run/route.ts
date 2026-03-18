import { NextResponse } from "next/server";

import { runPipeline } from "@/lib/pipeline";
import { pipelineRunRequestSchema, type PipelineRunResponse } from "@/types/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = pipelineRunRequestSchema.safeParse(payload ?? {});

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        source: "airtable",
        error: parsed.error.issues[0]?.message ?? "Invalid pipeline request payload.",
      },
      { status: 400 },
    );
  }

  try {
    const pipelineRun = await runPipeline(parsed.data);

    return NextResponse.json<PipelineRunResponse>({
      success: true,
      source: pipelineRun.source,
      result: pipelineRun.result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        source: "airtable",
        error: error instanceof Error ? error.message : "Pipeline run failed.",
      },
      { status: 500 },
    );
  }
}
