import { NextResponse } from "next/server";

import { appendAuditEventsSafe } from "@/lib/audit";
import {
  buildDistributionBundles,
  distributionPrepareRequestSchema,
} from "@/lib/distribution";
import { listPostingAssistantPackages } from "@/lib/posting-assistant";
import type { DistributionActionResponse } from "@/types/api";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = distributionPrepareRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<DistributionActionResponse>(
      {
        success: false,
        persisted: false,
        bundle: null,
        message: "Distribution bundle could not be prepared.",
        error: parsed.error.issues[0]?.message ?? "Invalid distribution payload.",
      },
      { status: 400 },
    );
  }

  try {
    const packages = await listPostingAssistantPackages({ status: "active" });
    const bundle =
      buildDistributionBundles({ packages }).find(
        (candidate) =>
          candidate.bundleId === parsed.data.bundleId &&
          candidate.signalId === parsed.data.signalId,
      ) ?? null;

    if (!bundle) {
      return NextResponse.json<DistributionActionResponse>(
        {
          success: false,
          persisted: false,
          bundle: null,
          message: "Distribution bundle could not be prepared.",
          error: "Distribution bundle not found.",
        },
        { status: 404 },
      );
    }

    await appendAuditEventsSafe([
      {
        signalId: bundle.signalId,
        eventType: "DISTRIBUTION_PREPARED",
        actor: "operator",
        summary: `Prepared safe-mode distribution bundle across ${bundle.platforms.length} platform${bundle.platforms.length === 1 ? "" : "s"}.`,
        metadata: {
          bundleId: bundle.bundleId,
          packageCount: bundle.packageIds.length,
          platformCount: bundle.platforms.length,
          hasSequence: Boolean(bundle.sequenceLabel),
        },
      },
    ]);

    return NextResponse.json<DistributionActionResponse>({
      success: true,
      persisted: true,
      bundle,
      message:
        bundle.platforms.length > 1
          ? "Distribution bundle prepared for manual cross-platform execution."
          : "Distribution package prepared for manual posting.",
    });
  } catch (error) {
    return NextResponse.json<DistributionActionResponse>(
      {
        success: false,
        persisted: false,
        bundle: null,
        message: "Distribution bundle could not be prepared.",
        error:
          error instanceof Error
            ? error.message
            : "Unknown distribution preparation failure.",
      },
      { status: 500 },
    );
  }
}
