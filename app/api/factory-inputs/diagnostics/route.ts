import { NextResponse } from "next/server";

import { getVideoFactoryDiagnostics } from "@/lib/video-factory-diagnostics";
import type { FactoryInputDiagnosticsResponse } from "@/types/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const diagnostics = getVideoFactoryDiagnostics();
  const success = diagnostics.status !== "unavailable";

  return NextResponse.json<FactoryInputDiagnosticsResponse>(
    {
      success,
      diagnostics,
    },
    { status: success ? 200 : 503 },
  );
}
