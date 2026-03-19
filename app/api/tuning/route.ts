import { NextResponse } from "next/server";

import { appendAuditEventsSafe } from "@/lib/audit";
import {
  getControlOptionLabel,
  getOperatorTuning,
  resetOperatorTuning,
  setOperatorTuningPreset,
  updateOperatorTuningSettings,
} from "@/lib/tuning";
import { tuningUpdateRequestSchema, type TuningResponse } from "@/types/api";

const TUNING_AUDIT_SUBJECT = "operator-tuning";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tuning = await getOperatorTuning();

    return NextResponse.json<TuningResponse>({
      success: true,
      tuning,
      message: "Current operator tuning loaded.",
    });
  } catch (error) {
    return NextResponse.json<TuningResponse>(
      {
        success: false,
        tuning: null,
        error: error instanceof Error ? error.message : "Unable to load operator tuning.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = tuningUpdateRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<TuningResponse>(
      {
        success: false,
        tuning: null,
        error: parsed.error.issues[0]?.message ?? "Invalid tuning payload.",
      },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.preset) {
      const { next } = await setOperatorTuningPreset(parsed.data.preset);
      await appendAuditEventsSafe([
        {
          signalId: TUNING_AUDIT_SUBJECT,
          eventType: "TUNING_PRESET_CHANGED",
          actor: "operator",
          summary: `Changed operator tuning preset to ${next.preset}.`,
          metadata: {
            preset: next.preset,
          },
        },
      ]);

      return NextResponse.json<TuningResponse>({
        success: true,
        tuning: next,
        message: "Operator tuning preset updated.",
      });
    }

    const { next, changedKeys } = await updateOperatorTuningSettings(parsed.data.settings ?? {});
    await appendAuditEventsSafe([
      {
        signalId: TUNING_AUDIT_SUBJECT,
        eventType: "TUNING_SETTING_UPDATED",
        actor: "operator",
        summary:
          changedKeys.length > 0
            ? `Updated operator tuning: ${changedKeys
                .map((key) => `${key} set to ${getControlOptionLabel(key, next.settings[key])}`)
                .join(", ")}.`
            : "Saved operator tuning with no effective setting changes.",
        metadata: {
          changedKeys: changedKeys.join(", "),
          preset: next.preset,
        },
      },
    ]);

    return NextResponse.json<TuningResponse>({
      success: true,
      tuning: next,
      message: "Operator tuning updated.",
    });
  } catch (error) {
    return NextResponse.json<TuningResponse>(
      {
        success: false,
        tuning: null,
        error: error instanceof Error ? error.message : "Unable to update operator tuning.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const { next } = await resetOperatorTuning();
    await appendAuditEventsSafe([
      {
        signalId: TUNING_AUDIT_SUBJECT,
        eventType: "TUNING_RESET_TO_DEFAULTS",
        actor: "operator",
        summary: "Reset operator tuning to balanced defaults.",
        metadata: {
          preset: next.preset,
        },
      },
    ]);

    return NextResponse.json<TuningResponse>({
      success: true,
      tuning: next,
      message: "Operator tuning reset to defaults.",
    });
  } catch (error) {
    return NextResponse.json<TuningResponse>(
      {
        success: false,
        tuning: null,
        error: error instanceof Error ? error.message : "Unable to reset operator tuning.",
      },
      { status: 500 },
    );
  }
}
