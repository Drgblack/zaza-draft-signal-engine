import { NextResponse } from "next/server";

import { listContentOpportunityState } from "@/lib/content-opportunities";
import { buildFactoryProviderBenchmarkCollection } from "@/lib/video-factory-provider-benchmarks";
import type { FactoryInputProviderBenchmarkResponse } from "@/types/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await listContentOpportunityState();
    const benchmarks = buildFactoryProviderBenchmarkCollection({
      opportunities: state.opportunities,
    });

    return NextResponse.json<FactoryInputProviderBenchmarkResponse>({
      success: true,
      benchmarks,
      message: "Provider benchmarks loaded.",
    });
  } catch (error) {
    return NextResponse.json<FactoryInputProviderBenchmarkResponse>(
      {
        success: false,
        benchmarks: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load provider benchmarks.",
      },
      { status: 500 },
    );
  }
}
