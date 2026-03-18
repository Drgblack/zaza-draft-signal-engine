import { NextResponse } from "next/server";

import { buildMockDrafts } from "@/lib/generator";
import { generateRequestSchema, type GenerationResponse } from "@/types/api";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = generateRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid generation request.",
      },
      { status: 400 },
    );
  }

  const outputs = buildMockDrafts(parsed.data);

  return NextResponse.json<GenerationResponse>({
    success: true,
    outputs,
  });
}
