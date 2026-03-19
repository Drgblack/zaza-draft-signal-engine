import { NextResponse } from "next/server";

import { appendAuditEventsSafe, type AuditEventInput } from "@/lib/audit";
import {
  appendPlaybookCard,
  createPlaybookCardRequestSchema,
  listPlaybookCards,
} from "@/lib/playbook-cards";
import type { PlaybookCardListResponse, PlaybookCardResponse } from "@/types/api";

function getSourceGap(payload: unknown):
  | {
      key: string;
      label: string;
      kind: "uncovered" | "weak_coverage" | "opportunity";
      flag: string;
    }
  | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const sourceGap = (payload as Record<string, unknown>).sourceGap;
  if (!sourceGap || typeof sourceGap !== "object") {
    return null;
  }

  const sourceGapRecord = sourceGap as Record<string, unknown>;
  const key = typeof sourceGapRecord.key === "string" ? sourceGapRecord.key : null;
  const label = typeof sourceGapRecord.label === "string" ? sourceGapRecord.label : null;
  const kind = sourceGapRecord.kind;
  const flag = typeof sourceGapRecord.flag === "string" ? sourceGapRecord.flag : null;

  if (!key || !label || !flag) {
    return null;
  }

  if (kind !== "uncovered" && kind !== "weak_coverage" && kind !== "opportunity") {
    return null;
  }

  return {
    key,
    label,
    kind,
    flag,
  };
}

export async function GET() {
  try {
    const cards = await listPlaybookCards({ status: "all" });
    return NextResponse.json<PlaybookCardListResponse>({
      success: true,
      cards,
    });
  } catch (error) {
    return NextResponse.json<PlaybookCardListResponse>(
      {
        success: false,
        cards: [],
        error: error instanceof Error ? error.message : "Unable to load playbook cards.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = createPlaybookCardRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json<PlaybookCardResponse>(
      {
        success: false,
        persisted: false,
        card: null,
        message: "Playbook card could not be saved.",
        error: parsed.error.issues[0]?.message ?? "Invalid playbook card payload.",
      },
      { status: 400 },
    );
  }

  try {
    const sourceGap = getSourceGap(payload);
    const card = await appendPlaybookCard({
      ...parsed.data,
      suggestedModes: parsed.data.suggestedModes ?? [],
      relatedPatternIds: parsed.data.relatedPatternIds ?? [],
      relatedBundleIds: parsed.data.relatedBundleIds ?? [],
      relatedTags: parsed.data.relatedTags ?? [],
      status: parsed.data.status ?? "active",
    });
    const auditEvents: AuditEventInput[] = [
      {
        signalId: `playbook:${card.id}`,
        eventType: "PLAYBOOK_CARD_CREATED",
        actor: "operator",
        summary: `Created playbook card: ${card.title}.`,
        metadata: {
          cardId: card.id,
          status: card.status,
          relatedPatternCount: card.relatedPatternIds.length,
          relatedBundleCount: card.relatedBundleIds.length,
        },
      },
    ];

    if (sourceGap) {
      auditEvents.push({
        signalId: `playbook:${card.id}`,
        eventType: "PLAYBOOK_CARD_CREATED_FROM_GAP",
        actor: "operator",
        summary: `Created playbook card from gap: ${sourceGap.label}.`,
        metadata: {
          cardId: card.id,
          coverageGapKey: sourceGap.key,
          coverageGapLabel: sourceGap.label,
          gapKind: sourceGap.kind,
          gapFlag: sourceGap.flag,
        },
      });
    }

    await appendAuditEventsSafe(auditEvents);

    return NextResponse.json<PlaybookCardResponse>({
      success: true,
      persisted: true,
      card,
      message: "Playbook card saved.",
    });
  } catch (error) {
    return NextResponse.json<PlaybookCardResponse>(
      {
        success: false,
        persisted: false,
        card: null,
        message: "Playbook card could not be saved.",
        error: error instanceof Error ? error.message : "Unable to persist playbook card.",
      },
      { status: 500 },
    );
  }
}
