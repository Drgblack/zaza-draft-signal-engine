import { NextResponse } from "next/server";

import { appendAuditEventsSafe, buildOperatorOverrideEvent, type AuditEventInput } from "@/lib/audit";
import { getSignalWithFallback } from "@/lib/signal-repository";
import { suggestEditorialMode } from "@/lib/editorial-modes";
import { generateDrafts, toGenerationInputFromSignal } from "@/lib/generator";
import { getPattern, getPatternAuditSubjectId, isPatternActive } from "@/lib/patterns";
import { getOperatorTuning } from "@/lib/tuning";
import { generateRequestSchema, toGenerationInput, type GenerationResponse } from "@/types/api";

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

  const inputSignal = parsed.data.signal ? toGenerationInput(parsed.data.signal) : null;
  const sourceSignal = inputSignal ? null : parsed.data.signalId ? await getSignalWithFallback(parsed.data.signalId) : null;

  if (!inputSignal && sourceSignal && !sourceSignal.signal) {
    return NextResponse.json(
      {
        success: false,
        error: sourceSignal.error ?? "Signal not found.",
      },
      { status: 404 },
    );
  }

  const selectedPattern = parsed.data.patternId ? await getPattern(parsed.data.patternId) : null;
  if (parsed.data.patternId && !selectedPattern) {
    return NextResponse.json(
      {
        success: false,
        error: "Selected pattern not found.",
      },
      { status: 404 },
    );
  }
  if (selectedPattern && !isPatternActive(selectedPattern)) {
    return NextResponse.json(
      {
        success: false,
        error: "Retired patterns are kept for reference only and cannot be applied in generation.",
      },
      { status: 400 },
    );
  }

  const signal = inputSignal ?? (sourceSignal?.signal ? toGenerationInputFromSignal(sourceSignal.signal) : null);
  if (!signal) {
    return NextResponse.json(
      {
        success: false,
        error: "Generation requires interpretation fields to be present first.",
      },
      { status: 400 },
    );
  }

  const editorialMode =
    parsed.data.editorialMode ??
    sourceSignal?.signal?.editorialMode ??
    (sourceSignal?.signal ? suggestEditorialMode(sourceSignal.signal).mode : "awareness");
  const founderVoiceMode =
    parsed.data.founderVoiceMode ??
    sourceSignal?.signal?.founderVoiceMode ??
    "founder_voice_on";
  const generation = await generateDrafts(signal, {
    pattern: selectedPattern,
    editorialMode,
    founderVoiceMode,
    founderOverrideHints: parsed.data.founderOverrideHints,
    revenueAmplifierHints: parsed.data.revenueAmplifierHints,
  });
  const currentSignalId = signal.recordId ?? parsed.data.signalId ?? null;
  const tuning = await getOperatorTuning();

  if (currentSignalId) {
    const currentSignalResult = await getSignalWithFallback(currentSignalId);
    const usedSuggestedPattern =
      Boolean(parsed.data.suggestedPatternId) &&
      parsed.data.suggestedPatternId === generation.appliedPattern?.id;
    const auditEvents: AuditEventInput[] = [
      {
        signalId: currentSignalId,
        eventType: "GENERATION_RUN",
        actor: "operator",
        summary: "Ran draft generation preview.",
        metadata: {
          generationSource: generation.outputs.generationSource,
          usedFallback: generation.usedFallback,
          patternId: generation.appliedPattern?.id ?? null,
          patternName: generation.appliedPattern?.name ?? null,
          suggestedPatternId: usedSuggestedPattern ? parsed.data.suggestedPatternId ?? null : null,
          editorialMode,
          founderVoiceMode,
        },
      },
    ];

    if (founderVoiceMode === "founder_voice_on") {
      auditEvents.push({
        signalId: currentSignalId,
        eventType: "FOUNDER_VOICE_APPLIED",
        actor: "system",
        summary: "Founder Voice Mode shaped the generated drafts.",
        metadata: {
          editorialMode,
          founderVoiceMode,
        },
      });
    }

    if (generation.appliedPattern) {
      auditEvents.push({
        signalId: currentSignalId,
        eventType: "PATTERN_APPLIED",
        actor: "operator",
        summary: `Applied pattern: ${generation.appliedPattern.name}.`,
        metadata: {
          patternId: generation.appliedPattern.id,
          patternName: generation.appliedPattern.name,
          suggestedPatternUsed: usedSuggestedPattern,
        },
      });
      auditEvents.push({
        signalId: getPatternAuditSubjectId(generation.appliedPattern.id),
        eventType: "PATTERN_APPLIED",
        actor: "operator",
        summary: `Applied pattern: ${generation.appliedPattern.name}.`,
        metadata: {
          patternId: generation.appliedPattern.id,
          patternName: generation.appliedPattern.name,
          signalId: currentSignalId,
          suggestedPatternUsed: usedSuggestedPattern,
        },
      });
    }

    if (currentSignalResult.signal) {
      const overrideEvent = buildOperatorOverrideEvent(currentSignalResult.signal, "generate", tuning.settings);
      if (overrideEvent) {
        auditEvents.push(overrideEvent);
      }
    }

    await appendAuditEventsSafe(auditEvents);
  }

  return NextResponse.json<GenerationResponse>({
    success: true,
    signal,
    outputs: generation.outputs,
    appliedPattern: generation.appliedPattern,
    editorialMode,
    founderVoiceMode,
    message: generation.message,
    usedFallback: generation.usedFallback,
  });
}

