import { NextResponse } from "next/server";

import { listContentOpportunityState } from "@/lib/content-opportunities";
import { buildFactoryDatasetExport } from "@/lib/video-factory-dataset-export";
import { listVideoFactoryLanguageMemoryRecords } from "@/lib/video-factory-language-memory";
import { listFactoryPublishOutcomes } from "@/lib/video-factory-publish-outcomes";
import type { FactoryInputDatasetExportResponse } from "@/types/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [state, publishOutcomes, languageMemory] = await Promise.all([
      listContentOpportunityState(),
      listFactoryPublishOutcomes(),
      listVideoFactoryLanguageMemoryRecords(),
    ]);

    const dataset = buildFactoryDatasetExport({
      opportunities: state.opportunities,
      publishOutcomes,
      languageMemory,
    });

    return NextResponse.json<FactoryInputDatasetExportResponse>({
      success: true,
      dataset,
      message: "Factory dataset exported.",
    });
  } catch (error) {
    return NextResponse.json<FactoryInputDatasetExportResponse>(
      {
        success: false,
        dataset: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to export factory dataset.",
      },
      { status: 500 },
    );
  }
}
