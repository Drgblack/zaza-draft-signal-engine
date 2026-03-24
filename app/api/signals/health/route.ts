import { NextResponse } from "next/server";

import { getAirtableDiagnostics } from "@/lib/signal-repository";
import type { AirtableHealthResponse } from "@/types/api";

export async function GET() {
  const diagnostics = await getAirtableDiagnostics();
  const isHealthy =
    !diagnostics.configured ||
    (diagnostics.apiReachable && diagnostics.tableReachable && diagnostics.schemaAligned && diagnostics.mappingSucceeded);

  return NextResponse.json<AirtableHealthResponse>(
    {
      success: isHealthy,
      diagnostics,
    },
    { status: isHealthy ? 200 : 503 },
  );
}

