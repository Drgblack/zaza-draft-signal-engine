import { NextResponse } from "next/server";

import { listSignalsWithFallback } from "@/lib/airtable";
import { updateIngestionSource } from "@/lib/ingestion/sources";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listPostingOutcomes } from "@/lib/outcomes";
import { buildSourceAutopilotV2State } from "@/lib/source-autopilot-v2";
import { listStrategicOutcomes } from "@/lib/strategic-outcomes";
import {
  sourceRegistryUpdateRequestSchema,
  type UpdateSourceRegistryResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = sourceRegistryUpdateRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        source: "airtable",
        error: parsed.error.issues[0]?.message ?? "Invalid source settings payload.",
      },
      { status: 400 },
    );
  }

  try {
    const [updatedSource, signalResult, postingEntries, postingOutcomes, strategicOutcomes] = await Promise.all([
      updateIngestionSource(id, parsed.data),
      listSignalsWithFallback({ limit: 500 }),
      listPostingLogEntries(),
      listPostingOutcomes(),
      listStrategicOutcomes(),
    ]);

    const autopilotState = await buildSourceAutopilotV2State({
      source: signalResult.source,
      sourceRegistry: [updatedSource],
      signals: signalResult.signals,
      postingEntries,
      postingOutcomes,
      strategicOutcomes,
    });

    return NextResponse.json<UpdateSourceRegistryResponse>({
      success: true,
      source: signalResult.source,
      sourceRecord: autopilotState.sources[0],
      message: "Source settings updated.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update source settings.";
    const status = message.toLowerCase().includes("unknown ingestion source") ? 404 : 500;

    return NextResponse.json(
      {
        success: false,
        source: "airtable",
        error: message,
      },
      { status },
    );
  }
}
