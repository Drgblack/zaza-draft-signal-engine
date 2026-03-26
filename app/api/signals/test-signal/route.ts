import { NextResponse } from "next/server";

import { createTestSignalReadyForApproval } from "@/lib/test-signal-bootstrap";
import type { CreateTestSignalApiResponse } from "@/types/api";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await createTestSignalReadyForApproval();

    return NextResponse.json<CreateTestSignalApiResponse>({
      success: true,
      source: result.source,
      persisted: result.persisted,
      signal: result.signal,
      message: "Test signal created and prepared for approval.",
    });
  } catch (error) {
    return NextResponse.json<CreateTestSignalApiResponse>(
      {
        success: false,
        source: "mock",
        persisted: false,
        signal: null,
        message: "Test signal could not be created.",
        error:
          error instanceof Error
            ? error.message
            : "Test signal could not be created.",
        errorCode: "unknown_error",
      },
      { status: 500 },
    );
  }
}
