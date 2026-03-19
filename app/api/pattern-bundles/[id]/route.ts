import { NextResponse } from "next/server";

import { appendAuditEventsSafe } from "@/lib/audit";
import {
  getPatternBundle,
  updatePatternBundle,
  updatePatternBundleRequestSchema,
} from "@/lib/pattern-bundles";
import type { PatternBundleResponse } from "@/types/api";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const bundle = await getPatternBundle(id);

  if (!bundle) {
    return NextResponse.json<PatternBundleResponse>(
      {
        success: false,
        persisted: false,
        bundle: null,
        message: "Pattern bundle not found.",
        error: "Pattern bundle not found.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json<PatternBundleResponse>({
    success: true,
    persisted: true,
    bundle,
    message: "Pattern bundle loaded.",
  });
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = updatePatternBundleRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<PatternBundleResponse>(
      {
        success: false,
        persisted: false,
        bundle: null,
        message: "Pattern bundle could not be updated.",
        error: parsed.error.issues[0]?.message ?? "Invalid pattern bundle payload.",
      },
      { status: 400 },
    );
  }

  try {
    const bundle = await updatePatternBundle(id, parsed.data);

    if (!bundle) {
      return NextResponse.json<PatternBundleResponse>(
        {
          success: false,
          persisted: false,
          bundle: null,
          message: "Pattern bundle not found.",
          error: "Pattern bundle not found.",
        },
        { status: 404 },
      );
    }

    await appendAuditEventsSafe([
      {
        signalId: `bundle:${bundle.id}`,
        eventType: "PATTERN_UPDATED",
        actor: "operator",
        summary: `Updated pattern bundle: ${bundle.name}.`,
        metadata: {
          bundleId: bundle.id,
          patternCount: bundle.patternIds.length,
        },
      },
    ]);

    return NextResponse.json<PatternBundleResponse>({
      success: true,
      persisted: true,
      bundle,
      message: "Pattern bundle updated.",
    });
  } catch (error) {
    return NextResponse.json<PatternBundleResponse>(
      {
        success: false,
        persisted: false,
        bundle: null,
        message: "Pattern bundle could not be updated.",
        error: error instanceof Error ? error.message : "Unable to persist pattern bundle.",
      },
      { status: 500 },
    );
  }
}
