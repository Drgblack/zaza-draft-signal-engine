import { NextResponse } from "next/server";

import { listSignalsWithFallback } from "@/lib/airtable";
import { buildManagedIngestionSources } from "@/lib/ingestion/source-performance";
import { updateIngestionSource } from "@/lib/ingestion/sources";
import { listPostingLogEntries } from "@/lib/posting-log";
import { listPostingOutcomes } from "@/lib/outcomes";
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

    const managedSource = buildManagedIngestionSources(
      [updatedSource],
      signalResult.signals,
      postingEntries,
      postingOutcomes,
      strategicOutcomes,
    )[0];

    return NextResponse.json<UpdateSourceRegistryResponse>({
      success: true,
      source: signalResult.source,
      sourceRecord: managedSource,
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
