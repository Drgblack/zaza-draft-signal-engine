import { NextResponse } from "next/server";

import { appendAuditEventsSafe } from "@/lib/audit";
import { playbookPackUseRequestSchema } from "@/lib/playbook-packs";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = playbookPackUseRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Playbook pack usage could not be recorded.",
        error: parsed.error.issues[0]?.message ?? "Invalid playbook pack usage payload.",
      },
      { status: 400 },
    );
  }

  const data = parsed.data;
  await appendAuditEventsSafe([
    {
      signalId: data.signalId,
      eventType: "PLAYBOOK_PACK_USED",
      actor: "operator",
      summary: `Referenced playbook pack ${data.packId} during ${data.context}.`,
      metadata: {
        packId: data.packId,
        context: data.context,
      },
    },
  ]);

  return NextResponse.json({
    success: true,
    message: "Playbook pack usage recorded.",
  });
}
