import { NextResponse } from "next/server";

import { appendAuditEventsSafe, type AuditEventInput } from "@/lib/audit";
import { appendPatternBundle, createPatternBundleRequestSchema, listPatternBundles } from "@/lib/pattern-bundles";
import type { PatternBundleListResponse, PatternBundleResponse } from "@/types/api";

export async function GET() {
  try {
    const bundles = await listPatternBundles();
    return NextResponse.json<PatternBundleListResponse>({
      success: true,
      bundles,
    });
  } catch (error) {
    return NextResponse.json<PatternBundleListResponse>(
      {
        success: false,
        bundles: [],
        error: error instanceof Error ? error.message : "Unable to load pattern bundles.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = createPatternBundleRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<PatternBundleResponse>(
      {
        success: false,
        persisted: false,
        bundle: null,
        message: "Pattern bundle could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid pattern bundle payload.",
      },
      { status: 400 },
    );
  }

  try {
    const bundle = await appendPatternBundle(parsed.data);
    const auditEvents: AuditEventInput[] = [
      {
        signalId: `bundle:${bundle.id}`,
        eventType: "PATTERN_BUNDLE_CREATED" as const,
        actor: "operator" as const,
        summary: `Created pattern bundle: ${bundle.name}.`,
        metadata: {
          bundleId: bundle.id,
          patternCount: bundle.patternIds.length,
        },
      },
    ];

    for (const patternId of bundle.patternIds) {
      auditEvents.push({
        signalId: `pattern:${patternId}`,
        eventType: "PATTERN_ASSIGNED_TO_BUNDLE" as const,
        actor: "operator" as const,
        summary: `Assigned pattern to bundle: ${bundle.name}.`,
        metadata: {
          bundleId: bundle.id,
          bundleName: bundle.name,
          patternId,
        },
      });
    }

    await appendAuditEventsSafe(auditEvents);

    return NextResponse.json<PatternBundleResponse>({
      success: true,
      persisted: true,
      bundle,
      message: "Pattern bundle saved.",
    });
  } catch (error) {
    return NextResponse.json<PatternBundleResponse>(
      {
        success: false,
        persisted: false,
        bundle: null,
        message: "Pattern bundle could not be saved.",
        error: error instanceof Error ? error.message : "Unable to persist pattern bundle.",
      },
      { status: 500 },
    );
  }
}
