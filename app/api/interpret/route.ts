import { NextResponse } from "next/server";

import { buildMockInterpretation } from "@/lib/interpreter";
import { interpretRequestSchema, type InterpretationResponse } from "@/types/api";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = interpretRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid interpretation request.",
      },
      { status: 400 },
    );
  }

  const interpretation = buildMockInterpretation(parsed.data);

  return NextResponse.json<InterpretationResponse>({
    success: true,
    interpretation,
  });
}
