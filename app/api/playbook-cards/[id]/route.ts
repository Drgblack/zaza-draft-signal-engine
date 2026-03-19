import { NextResponse } from "next/server";

import { appendAuditEventsSafe } from "@/lib/audit";
import {
  getPlaybookCard,
  updatePlaybookCard,
  updatePlaybookCardRequestSchema,
} from "@/lib/playbook-cards";
import type { PlaybookCardResponse } from "@/types/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const card = await getPlaybookCard(id);
    if (!card) {
      return NextResponse.json<PlaybookCardResponse>(
        {
          success: false,
          persisted: false,
          card: null,
          message: "Playbook card not found.",
          error: "Playbook card not found.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json<PlaybookCardResponse>({
      success: true,
      persisted: true,
      card,
      message: "Playbook card loaded.",
    });
  } catch (error) {
    return NextResponse.json<PlaybookCardResponse>(
      {
        success: false,
        persisted: false,
        card: null,
        message: "Playbook card could not be loaded.",
        error: error instanceof Error ? error.message : "Unable to load playbook card.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json().catch(() => null);
  const parsed = updatePlaybookCardRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<PlaybookCardResponse>(
      {
        success: false,
        persisted: false,
        card: null,
        message: "Playbook card could not be updated.",
        error: parsed.error.issues[0]?.message ?? "Invalid playbook card update payload.",
      },
      { status: 400 },
    );
  }

  try {
    const previous = await getPlaybookCard(id);
    const card = await updatePlaybookCard(id, parsed.data);

    if (!card) {
      return NextResponse.json<PlaybookCardResponse>(
        {
          success: false,
          persisted: false,
          card: null,
          message: "Playbook card not found.",
          error: "Playbook card not found.",
        },
        { status: 404 },
      );
    }

    const retiredNow = previous && previous.status !== "retired" && card.status === "retired";

    await appendAuditEventsSafe([
      {
        signalId: `playbook:${card.id}`,
        eventType: retiredNow ? "PLAYBOOK_CARD_RETIRED" : "PLAYBOOK_CARD_UPDATED",
        actor: "operator",
        summary: retiredNow
          ? `Retired playbook card: ${card.title}.`
          : `Updated playbook card: ${card.title}.`,
        metadata: {
          cardId: card.id,
          status: card.status,
          relatedPatternCount: card.relatedPatternIds.length,
          relatedBundleCount: card.relatedBundleIds.length,
        },
      },
    ]);

    return NextResponse.json<PlaybookCardResponse>({
      success: true,
      persisted: true,
      card,
      message: retiredNow ? "Playbook card retired." : "Playbook card updated.",
    });
  } catch (error) {
    return NextResponse.json<PlaybookCardResponse>(
      {
        success: false,
        persisted: false,
        card: null,
        message: "Playbook card could not be updated.",
        error: error instanceof Error ? error.message : "Unable to update playbook card.",
      },
      { status: 500 },
    );
  }
}
