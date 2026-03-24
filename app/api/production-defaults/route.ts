import { NextResponse } from "next/server";

import { appendAuditEventsSafe } from "@/lib/audit";
import {
  getActiveProductionDefaults,
  updateActiveProductionDefaults,
} from "@/lib/production-defaults";
import {
  productionDefaultsUpdateRequestSchema,
  type ProductionDefaultsResponse,
} from "@/types/api";

const PRODUCTION_DEFAULTS_AUDIT_SUBJECT = "production-defaults";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const productionDefaults = getActiveProductionDefaults();

    return NextResponse.json<ProductionDefaultsResponse>({
      success: true,
      productionDefaults,
      message: "Active production defaults loaded.",
    });
  } catch (error) {
    return NextResponse.json<ProductionDefaultsResponse>(
      {
        success: false,
        productionDefaults: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load production defaults.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = productionDefaultsUpdateRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<ProductionDefaultsResponse>(
      {
        success: false,
        productionDefaults: null,
        error:
          parsed.error.issues[0]?.message ??
          "Invalid production defaults payload.",
      },
      { status: 400 },
    );
  }

  try {
    const previous = getActiveProductionDefaults();
    const productionDefaults = await updateActiveProductionDefaults(parsed.data);

    await appendAuditEventsSafe([
      {
        signalId: PRODUCTION_DEFAULTS_AUDIT_SUBJECT,
        eventType: "PRODUCTION_DEFAULTS_UPDATED",
        actor: "operator",
        summary: "Updated production defaults.",
        metadata: {
          defaultsProfileId: productionDefaults.profileId,
          previousDefaultsVersion: previous.version,
          defaultsVersion: productionDefaults.version,
          changedSource: productionDefaults.changedSource,
          changeNote: productionDefaults.changeNote,
          changedVoiceId:
            previous.voiceId !== productionDefaults.voiceId,
          changedReferenceImageUrl:
            previous.referenceImageUrl !== productionDefaults.referenceImageUrl,
          changedModelFamily:
            previous.modelFamily !== productionDefaults.modelFamily,
          changedAspectRatio:
            previous.aspectRatio !== productionDefaults.aspectRatio,
          changedResolution:
            previous.resolution !== productionDefaults.resolution,
        },
      },
    ]);

    return NextResponse.json<ProductionDefaultsResponse>({
      success: true,
      productionDefaults,
      message: "Production defaults updated.",
    });
  } catch (error) {
    return NextResponse.json<ProductionDefaultsResponse>(
      {
        success: false,
        productionDefaults: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update production defaults.",
      },
      { status: 500 },
    );
  }
}
