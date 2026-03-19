import { NextResponse } from "next/server";

import { appendAuditEventsSafe } from "@/lib/audit";
import {
  addPatternToBundle,
  getPatternBundle,
  removePatternFromBundle,
  updatePatternBundleMembershipRequestSchema,
} from "@/lib/pattern-bundles";
import { getPattern, getPatternAuditSubjectId } from "@/lib/patterns";
import type { PatternBundleResponse } from "@/types/api";

export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = updatePatternBundleMembershipRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<PatternBundleResponse>(
      {
        success: false,
        persisted: false,
        bundle: null,
        message: "Pattern bundle membership could not be updated.",
        error: parsed.error.issues[0]?.message ?? "Invalid bundle membership payload.",
      },
      { status: 400 },
    );
  }

  const pattern = await getPattern(id);
  if (!pattern) {
    return NextResponse.json<PatternBundleResponse>(
      {
        success: false,
        persisted: false,
        bundle: null,
        message: "Pattern not found.",
        error: "Pattern not found.",
      },
      { status: 404 },
    );
  }

  const existingBundle = await getPatternBundle(parsed.data.bundleId);
  if (!existingBundle) {
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

  try {
    const bundle =
      parsed.data.action === "assign"
        ? await addPatternToBundle(parsed.data.bundleId, id)
        : await removePatternFromBundle(parsed.data.bundleId, id);

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
        signalId: getPatternAuditSubjectId(pattern.id),
        eventType:
          parsed.data.action === "assign" ? "PATTERN_ASSIGNED_TO_BUNDLE" : "PATTERN_REMOVED_FROM_BUNDLE",
        actor: "operator",
        summary:
          parsed.data.action === "assign"
            ? `Assigned pattern to bundle: ${bundle.name}.`
            : `Removed pattern from bundle: ${bundle.name}.`,
        metadata: {
          patternId: pattern.id,
          bundleId: bundle.id,
          bundleName: bundle.name,
        },
      },
      {
        signalId: `bundle:${bundle.id}`,
        eventType:
          parsed.data.action === "assign" ? "PATTERN_ASSIGNED_TO_BUNDLE" : "PATTERN_REMOVED_FROM_BUNDLE",
        actor: "operator",
        summary:
          parsed.data.action === "assign"
            ? `Assigned pattern to bundle: ${bundle.name}.`
            : `Removed pattern from bundle: ${bundle.name}.`,
        metadata: {
          patternId: pattern.id,
          patternName: pattern.name,
          bundleId: bundle.id,
        },
      },
    ]);

    return NextResponse.json<PatternBundleResponse>({
      success: true,
      persisted: true,
      bundle,
      message:
        parsed.data.action === "assign"
          ? "Pattern assigned to bundle."
          : "Pattern removed from bundle.",
    });
  } catch (error) {
    return NextResponse.json<PatternBundleResponse>(
      {
        success: false,
        persisted: false,
        bundle: null,
        message: "Pattern bundle membership could not be updated.",
        error: error instanceof Error ? error.message : "Unable to persist bundle membership.",
      },
      { status: 500 },
    );
  }
}
