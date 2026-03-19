import { NextResponse } from "next/server";

import { getManagedIngestionSourcesWithFallback } from "@/lib/ingestion/source-performance";
import type { SourceRegistryResponse } from "@/types/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getManagedIngestionSourcesWithFallback();

    return NextResponse.json<SourceRegistryResponse>({
      success: true,
      source: result.source,
      sources: result.sources,
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
