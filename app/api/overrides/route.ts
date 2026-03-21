import { NextResponse } from "next/server";

import {
  createFounderOverride,
  removeFounderOverride,
  syncFounderOverrideState,
} from "@/lib/founder-overrides";
import {
  founderOverrideCreateRequestSchema,
  founderOverrideDeleteRequestSchema,
  type FounderOverrideResponse,
} from "@/types/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await syncFounderOverrideState();

    return NextResponse.json<FounderOverrideResponse>({
      success: true,
      state,
      message: "Founder overrides loaded.",
    });
  } catch (error) {
    return NextResponse.json<FounderOverrideResponse>(
      {
        success: false,
        state: null,
        error: error instanceof Error ? error.message : "Unable to load founder overrides.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = founderOverrideCreateRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<FounderOverrideResponse>(
      {
        success: false,
        state: null,
        error: parsed.error.issues[0]?.message ?? "Invalid founder override payload.",
      },
      { status: 400 },
    );
  }

  try {
    const state = await createFounderOverride(parsed.data);
    return NextResponse.json<FounderOverrideResponse>({
      success: true,
      state,
      message: "Founder override applied.",
    });
  } catch (error) {
    return NextResponse.json<FounderOverrideResponse>(
      {
        success: false,
        state: null,
        error: error instanceof Error ? error.message : "Unable to apply founder override.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = founderOverrideDeleteRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<FounderOverrideResponse>(
      {
        success: false,
        state: null,
        error: parsed.error.issues[0]?.message ?? "Invalid founder override delete payload.",
      },
      { status: 400 },
    );
  }

  try {
    const state = await removeFounderOverride(parsed.data.overrideId);
    return NextResponse.json<FounderOverrideResponse>({
      success: true,
      state,
      message: "Founder override removed.",
    });
  } catch (error) {
    return NextResponse.json<FounderOverrideResponse>(
      {
        success: false,
        state: null,
        error: error instanceof Error ? error.message : "Unable to remove founder override.",
      },
      { status: 500 },
    );
  }
}
