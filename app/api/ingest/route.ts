import { NextResponse } from "next/server";

import { runIngestion } from "@/lib/ingestion/service";
import { ingestRequestSchema, type IngestApiResponse } from "@/types/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const parsed = ingestRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        mode: "airtable",
        error: parsed.error.issues[0]?.message ?? "Invalid ingestion request.",
      },
      { status: 400 },
    );
  }

  try {
    const { mode, result } = await runIngestion(parsed.data.sourceIds);

    return NextResponse.json<IngestApiResponse>({
      success: true,
      mode,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        mode: "airtable",
        error: error instanceof Error ? error.message : "Ingestion failed.",
      },
      { status: 502 },
    );
  }
}
