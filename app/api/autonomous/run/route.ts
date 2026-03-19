import { NextResponse } from "next/server";

import { runAutonomousPipeline } from "@/lib/pipeline";
import { autonomousRunRequestSchema, type AutonomousRunResponse } from "@/types/api";

export const dynamic = "force-dynamic";

function parseBoolean(value: string | null): boolean | undefined {
  if (value === null) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

function parseNumberValue(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = autonomousRunRequestSchema.safeParse({
    ingestFresh: parseBoolean(url.searchParams.get("ingestFresh")),
    sourceIds: url.searchParams.getAll("sourceIds"),
    maxCandidates: parseNumberValue(url.searchParams.get("maxCandidates")),
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        source: "airtable",
        error: parsed.error.issues[0]?.message ?? "Invalid autonomous run query.",
      },
      { status: 400 },
    );
  }

  try {
    const autonomousRun = await runAutonomousPipeline(parsed.data);

    return NextResponse.json<AutonomousRunResponse>({
      success: true,
      source: autonomousRun.source,
      result: autonomousRun.result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        source: "airtable",
        error: error instanceof Error ? error.message : "Autonomous run failed.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = autonomousRunRequestSchema.safeParse(payload ?? {});

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        source: "airtable",
        error: parsed.error.issues[0]?.message ?? "Invalid autonomous run payload.",
      },
      { status: 400 },
    );
  }

  try {
    const autonomousRun = await runAutonomousPipeline(parsed.data);

    return NextResponse.json<AutonomousRunResponse>({
      success: true,
      source: autonomousRun.source,
      result: autonomousRun.result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        source: "airtable",
        error: error instanceof Error ? error.message : "Autonomous run failed.",
      },
      { status: 500 },
    );
  }
}
