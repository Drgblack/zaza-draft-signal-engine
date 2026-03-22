import { NextResponse } from "next/server";

import { exportContentOpportunityProductionPackage } from "@/lib/content-opportunities";
import {
  factoryInputExportPackageRequestSchema,
  type FactoryInputProductionPackageResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = factoryInputExportPackageRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<FactoryInputProductionPackageResponse>(
      {
        success: false,
        productionPackage: null,
        error: parsed.error.issues[0]?.message ?? "Invalid export package payload.",
      },
      { status: 400 },
    );
  }

  try {
    const productionPackage = await exportContentOpportunityProductionPackage(
      parsed.data.opportunityId,
    );

    return NextResponse.json<FactoryInputProductionPackageResponse>({
      success: true,
      productionPackage,
      message: "Production package exported.",
    });
  } catch (error) {
    return NextResponse.json<FactoryInputProductionPackageResponse>(
      {
        success: false,
        productionPackage: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to export production package.",
      },
      { status: 500 },
    );
  }
}
