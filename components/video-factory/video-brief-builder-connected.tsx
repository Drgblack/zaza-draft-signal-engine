"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { ContentOpportunity, ContentOpportunityState } from "@/lib/content-opportunities";
import type { HookSet } from "@/lib/hook-engine";
import { MESSAGE_ANGLE_PLAYBOOK, type MessageAngle } from "@/lib/message-angles";
import type { VideoBrief } from "@/lib/video-briefs";
import type {
  FactoryInputResponse,
  FactoryInputVideoBriefDraft,
} from "@/types/api";

function updateOpportunityFromState(
  state: ContentOpportunityState | null,
  opportunityId: string,
): ContentOpportunity | null {
  return state?.opportunities.find((item) => item.opportunityId === opportunityId) ?? null;
}

function toDraft(brief: VideoBrief | null): FactoryInputVideoBriefDraft | null {
  if (!brief) {
    return null;
  }

  return {
    title: brief.title,
    hook: brief.hook,
    goal: brief.goal,
    structure: brief.structure.map((beat) => ({
      order: beat.order,
      purpose: beat.purpose,
      guidance: beat.guidance,
      suggestedOverlay: beat.suggestedOverlay ?? null,
    })),
    overlayLines: [...brief.overlayLines],
    cta: brief.cta,
    contentType: brief.contentType ?? null,
  };
}

function angleLabel(angle: MessageAngle) {
  return MESSAGE_ANGLE_PLAYBOOK[angle.framingType]?.label ?? angle.framingType;
}

function titleCase(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildHookSetMap(opportunity: ContentOpportunity) {
  return new Map(opportunity.hookSets.map((hookSet) => [hookSet.angleId, hookSet]));
}

function builderStatusLabel(opportunity: ContentOpportunity) {
  if (opportunity.founderSelectionStatus === "approved") {
    return "Brief approved";
  }

  if (opportunity.selectedVideoBrief) {
    return "Brief in progress";
  }

  if (opportunity.selectedHookId) {
    return "Hook selected";
  }

  if (opportunity.selectedAngleId) {
    return "Angle selected";
  }

  return "Ready to start";
}

export function VideoBriefBuilderConnected({
  initialOpportunity,
  approvedOpportunities,
}: {
  initialOpportunity: ContentOpportunity;
  approvedOpportunities: ContentOpportunity[];
}) {
  const router = useRouter();
  const [opportunity, setOpportunity] = useState(initialOpportunity);
  const [feedback, setFeedback] = useState<{
    kind: "status" | "error";
    message: string;
  } | null>(null);
  const [draft, setDraft] = useState<FactoryInputVideoBriefDraft | null>(
    toDraft(initialOpportunity.selectedVideoBrief),
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setOpportunity(initialOpportunity);
  }, [initialOpportunity]);

  const briefFingerprint = JSON.stringify(opportunity.selectedVideoBrief ?? null);

  useEffect(() => {
    setDraft(toDraft(opportunity.selectedVideoBrief));
  }, [
    briefFingerprint,
    opportunity.selectedAngleId,
    opportunity.selectedHookId,
    opportunity.selectedVideoBrief,
  ]);

  const messageAngles = useMemo(
    () => [...opportunity.messageAngles].sort((left, right) => left.rank - right.rank),
    [opportunity.messageAngles],
  );
  const hookSetMap = useMemo(() => buildHookSetMap(opportunity), [opportunity]);
  const selectedAngle = useMemo(
    () =>
      messageAngles.find((angle) => angle.id === opportunity.selectedAngleId) ?? null,
    [messageAngles, opportunity.selectedAngleId],
  );
  const selectedHookSet = useMemo<HookSet | null>(
    () => (selectedAngle ? hookSetMap.get(selectedAngle.id) ?? null : null),
    [hookSetMap, selectedAngle],
  );
  const recommendedAngle = messageAngles.find((angle) => angle.isRecommended) ?? messageAngles[0] ?? null;
  const recommendedHook = selectedHookSet?.primaryHook ?? null;
  const currentStep =
    !opportunity.selectedAngleId
      ? 2
      : !opportunity.selectedHookId
        ? 3
        : 5;
  const currentStepTitle =
    currentStep === 2
      ? "Choose the angle first."
      : currentStep === 3
        ? "Choose the opening hook next."
        : "Review the brief, then approve it.";
  const currentStepCopy =
    currentStep === 2
      ? "A brief is the production plan for the video. The angle decides which teacher tension, promise, and emotional payoff the brief will carry."
      : currentStep === 3
        ? "The hook is the first line the viewer hears. Pick the opening that best matches the angle before you edit the brief beats."
        : "Once the brief is approved, generation becomes available in the existing ZazaReel review screen. Saving is optional; approving is the main next action.";
  const upcomingLabel =
    currentStep === 2
      ? "Use the recommended angle"
      : currentStep === 3
        ? "Use the strongest hook"
        : "Approve brief";

  async function runFactoryAction(body: Record<string, unknown>) {
    const response = await fetch("/api/factory-inputs", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as FactoryInputResponse | null;

    if (!response.ok || !data?.success) {
      throw new Error(data?.error ?? "Unable to update the video brief.");
    }

    const nextOpportunity = updateOpportunityFromState(data.state, opportunity.opportunityId);
    if (nextOpportunity) {
      setOpportunity(nextOpportunity);
    }
    if (data.message) {
      setFeedback({
        kind: "status",
        message: data.message,
      });
    }

    return nextOpportunity;
  }

  function runAction(callback: () => Promise<void>) {
    if (isPending) {
      return;
    }

    startTransition(async () => {
      try {
        setFeedback(null);
        await callback();
      } catch (error) {
        setFeedback({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to update the video brief.",
        });
      }
    });
  }

  function handleSelectAngle(angleId: string) {
    runAction(async () => {
      await runFactoryAction({
        action: "select_message_angle",
        opportunityId: opportunity.opportunityId,
        angleId,
      });
      router.refresh();
    });
  }

  function handleSelectHook(hookId: string) {
    if (!selectedAngle) {
      return;
    }

    runAction(async () => {
      await runFactoryAction({
        action: "select_hook_option",
        opportunityId: opportunity.opportunityId,
        angleId: selectedAngle.id,
        hookId,
      });
      router.refresh();
    });
  }

  function handleSwitchOpportunity(opportunityId: string) {
    if (isPending) {
      return;
    }

    router.push(
      `/factory-inputs?opportunityId=${encodeURIComponent(opportunityId)}&mode=builder#brief-builder`,
    );
  }

  async function saveDraft() {
    if (!draft) {
      throw new Error("Select a hook before saving the video brief.");
    }

    await runFactoryAction({
      action: "save_video_brief_draft",
      opportunityId: opportunity.opportunityId,
      briefDraft: draft,
    });
  }

  function handleSaveDraft() {
    runAction(async () => {
      await saveDraft();
      router.refresh();
    });
  }

  function handleApproveBrief() {
    runAction(async () => {
      await saveDraft();
      await runFactoryAction({
        action: "approve_video_brief",
        opportunityId: opportunity.opportunityId,
      });
      router.push(
        `/factory-inputs?opportunityId=${encodeURIComponent(opportunity.opportunityId)}#review`,
      );
      router.refresh();
    });
  }

  function updateDraft(
    updater: (current: FactoryInputVideoBriefDraft) => FactoryInputVideoBriefDraft,
  ) {
    setDraft((current) => (current ? updater(current) : current));
  }

  function handlePrimaryNextAction() {
    if (currentStep === 2 && recommendedAngle) {
      handleSelectAngle(recommendedAngle.id);
      return;
    }

    if (currentStep === 3 && recommendedHook) {
      handleSelectHook(recommendedHook.id);
      return;
    }

    if (currentStep === 5) {
      handleApproveBrief();
    }
  }

  return (
    <div id="brief-builder" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-6">
        {feedback ? (
          <div
            className={
              feedback.kind === "error"
                ? "rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700"
                : "rounded-2xl bg-white/85 px-4 py-3 text-sm text-slate-600"
            }
          >
            {feedback.message}
          </div>
        ) : null}
        {isPending ? (
          <div className="rounded-2xl bg-white/85 px-4 py-3 text-sm text-slate-500">
            Updating the brief...
          </div>
        ) : null}

        <Card className="bg-white/92">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-slate-100 text-slate-700 ring-slate-200">ZazaReel</Badge>
              <Badge className="bg-[#E9E7FF] text-[#5448B3] ring-[#D8D3FF]">
                Brief builder
              </Badge>
              <Badge className="bg-white text-slate-700 ring-slate-200">
                Step {currentStep} of 7
              </Badge>
            </div>
            <CardTitle>{currentStepTitle}</CardTitle>
            <CardDescription className="max-w-3xl">
              {currentStepCopy}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 md:grid-cols-7">
              {[
                "Choose opportunity",
                "Choose angle",
                "Choose hook",
                "Review brief",
                "Approve brief",
                "Generate video",
                "Review final video",
              ].map((label, index) => {
                const stepNumber = index + 1;
                const isCurrent = stepNumber === currentStep;
                const isComplete = stepNumber < currentStep;
                const isFuture = stepNumber > currentStep;

                return (
                  <div
                    key={label}
                    className={
                      isCurrent
                        ? "rounded-2xl border border-[#6B62D9] bg-[#F4F2FF] px-3 py-3"
                        : isComplete
                          ? "rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3"
                          : isFuture
                            ? "rounded-2xl border border-black/8 bg-white px-3 py-3"
                            : "rounded-2xl border border-black/8 bg-white px-3 py-3"
                    }
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Step {stepNumber}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{label}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={handlePrimaryNextAction} disabled={isPending}>
                {upcomingLabel}
              </Button>
              {currentStep === 5 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleSaveDraft}
                  disabled={isPending}
                >
                  Save draft
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/92">
          <CardHeader>
            <CardTitle>1. Choose an approved opportunity</CardTitle>
            <CardDescription>
              Start from an approved opportunity. That is the source material the brief
              will turn into a generation-ready video plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {approvedOpportunities.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-black/10 bg-white/75 px-4 py-8 text-sm text-slate-500">
                Approve an opportunity in Review first.
              </div>
            ) : (
              approvedOpportunities.map((candidate) => {
                const isSelected = candidate.opportunityId === opportunity.opportunityId;

                return (
                  <div
                    key={candidate.opportunityId}
                    className={
                      isSelected
                        ? "rounded-3xl border-2 border-[#6B62D9] bg-[#F4F2FF] px-4 py-4"
                        : "rounded-3xl border border-black/8 bg-white px-4 py-4"
                    }
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                        {builderStatusLabel(candidate)}
                      </Badge>
                      {isSelected ? (
                        <Badge className="bg-[#E0DBFF] text-[#4F46B5] ring-[#D1CAFF]">
                          Selected
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-3 text-base font-semibold text-slate-950">{candidate.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {candidate.primaryPainPoint}
                    </p>
                    <div className="mt-4">
                      {isSelected ? (
                        <Button type="button" variant="secondary" disabled>
                          Working on this brief
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => handleSwitchOpportunity(candidate.opportunityId)}
                        >
                          {candidate.selectedVideoBrief ? "Open brief" : "Start brief"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="bg-white/92">
            <CardHeader>
              <CardTitle>2. Choose a message angle</CardTitle>
              <CardDescription>
                Choose the framing you want the video to carry forward.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {messageAngles.map((angle) => {
                const isSelected = angle.id === opportunity.selectedAngleId;

                return (
                  <div
                    key={angle.id}
                    className={
                      isSelected
                        ? "rounded-3xl border-2 border-[#6B62D9] bg-[#F4F2FF] px-4 py-4"
                        : "rounded-3xl border border-black/8 bg-white px-4 py-4"
                    }
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                        {angleLabel(angle)}
                      </Badge>
                      <Badge className="bg-white text-slate-700 ring-slate-200">
                        Rank {angle.rank}
                      </Badge>
                      <Badge className="bg-white text-slate-700 ring-slate-200">
                        {titleCase(angle.riskPosture)}
                      </Badge>
                      {angle.isRecommended ? (
                        <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                          Recommended
                        </Badge>
                      ) : null}
                      {isSelected ? (
                        <Badge className="bg-[#E0DBFF] text-[#4F46B5] ring-[#D1CAFF]">
                          Selected
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-3 text-base font-semibold text-slate-950">{angle.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{angle.summary}</p>
                    <div className="mt-3 grid gap-2 text-sm text-slate-600">
                      <p>
                        <span className="font-semibold text-slate-800">Pain:</span>{" "}
                        {angle.primaryPainPoint}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">Promise:</span>{" "}
                        {angle.promisedOutcome}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">Viewer effect:</span>{" "}
                        {angle.intendedViewerEffect}
                      </p>
                    </div>
                    <div className="mt-4">
                      <Button
                        type="button"
                        variant={isSelected ? "secondary" : angle.isRecommended ? "primary" : "secondary"}
                        onClick={() => handleSelectAngle(angle.id)}
                        disabled={isPending}
                      >
                        {isSelected ? "Angle selected" : angle.isRecommended ? "Use recommended angle" : "Choose this angle"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className={selectedAngle ? "bg-white/92" : "bg-white/84 opacity-80"}>
            <CardHeader>
              <CardTitle>3. Choose a hook</CardTitle>
              <CardDescription>
                Pick the opening line that best fits the angle you selected. Generation
                does not unlock until a hook is chosen and the brief is approved.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedAngle || !selectedHookSet ? (
                <div className="rounded-3xl border border-dashed border-black/10 bg-white/75 px-4 py-8 text-sm text-slate-500">
                  Choose a message angle first to review the hook options for that framing.
                </div>
              ) : (
                selectedHookSet.variants.map((hook) => {
                  const isSelected = hook.id === opportunity.selectedHookId;

                  return (
                    <div
                      key={hook.id}
                      className={
                        isSelected
                          ? "rounded-3xl border-2 border-[#6B62D9] bg-[#F4F2FF] px-4 py-4"
                          : "rounded-3xl border border-black/8 bg-white px-4 py-4"
                      }
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                          {titleCase(hook.hookType)}
                        </Badge>
                        <Badge className="bg-white text-slate-700 ring-slate-200">
                          Rank {hook.rank}
                        </Badge>
                        <Badge className="bg-white text-slate-700 ring-slate-200">
                          {hook.recommendedPlatforms.join(" / ")}
                        </Badge>
                        {hook.isRecommended ? (
                          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                            Strongest default
                          </Badge>
                        ) : null}
                        {isSelected ? (
                          <Badge className="bg-[#E0DBFF] text-[#4F46B5] ring-[#D1CAFF]">
                            Selected
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-3 text-base font-semibold text-slate-950">{hook.text}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {hook.intendedEffect}
                      </p>
                      {hook.trustNotes.length > 0 ? (
                        <p className="mt-2 text-xs leading-5 text-amber-700">
                          Trust notes: {hook.trustNotes.join(" ")}
                        </p>
                      ) : null}
                      {hook.riskNotes.length > 0 ? (
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Risk notes: {hook.riskNotes.join(" ")}
                        </p>
                      ) : null}
                      <div className="mt-4">
                        <Button
                          type="button"
                          variant={isSelected ? "secondary" : hook.isRecommended ? "primary" : "secondary"}
                          onClick={() => handleSelectHook(hook.id)}
                          disabled={isPending}
                        >
                          {isSelected ? "Hook selected" : hook.isRecommended ? "Use strongest hook" : "Use this hook"}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        <Card className={draft ? "bg-white/92" : "bg-white/84 opacity-80"}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>4. Review and edit the brief</CardTitle>
                <CardDescription>
                  This brief is the production plan the generator will use. Tighten the
                  beats, overlays, and close, then approve the brief to unlock generation.
                </CardDescription>
              </div>
              {opportunity.selectedVideoBrief ? (
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                    {titleCase(opportunity.selectedVideoBrief.format)}
                  </Badge>
                  <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
                    {opportunity.selectedVideoBrief.durationSec}s
                  </Badge>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {!draft ? (
              <div className="rounded-3xl border border-dashed border-black/10 bg-white/75 px-4 py-8 text-sm text-slate-500">
                Choose both an angle and a hook to open the editable brief.
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="video-brief-title">Brief title</Label>
                    <Input
                      id="video-brief-title"
                      value={draft.title}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="video-brief-hook">Hook</Label>
                    <Input
                      id="video-brief-hook"
                      value={draft.hook}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          hook: event.target.value,
                        }))
                      }
                      disabled={isPending}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="video-brief-goal">Goal</Label>
                  <Textarea
                    id="video-brief-goal"
                    value={draft.goal}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        goal: event.target.value,
                      }))
                    }
                    disabled={isPending}
                    className="min-h-[96px]"
                  />
                </div>

                <div className="space-y-3">
                  <div>
                    <Label>Script beats</Label>
                    <p className="mt-1 text-sm text-slate-500">
                      Keep each beat focused on what the founder should actually say next.
                    </p>
                  </div>
                  <div className="grid gap-4">
                    {draft.structure.map((beat, index) => (
                      <div
                        key={`${beat.order}-${index}`}
                        className="rounded-3xl border border-black/8 bg-white/85 px-4 py-4"
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          Beat {beat.order}
                        </p>
                        <div className="mt-3 grid gap-3">
                          <div className="space-y-2">
                            <Label htmlFor={`video-brief-beat-purpose-${beat.order}`}>
                              Purpose
                            </Label>
                            <Input
                              id={`video-brief-beat-purpose-${beat.order}`}
                              value={beat.purpose}
                              onChange={(event) =>
                                updateDraft((current) => ({
                                  ...current,
                                  structure: current.structure.map((entry, entryIndex) =>
                                    entryIndex === index
                                      ? { ...entry, purpose: event.target.value }
                                      : entry,
                                  ),
                                }))
                              }
                              disabled={isPending}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`video-brief-beat-guidance-${beat.order}`}>
                              Guidance
                            </Label>
                            <Textarea
                              id={`video-brief-beat-guidance-${beat.order}`}
                              value={beat.guidance}
                              onChange={(event) =>
                                updateDraft((current) => ({
                                  ...current,
                                  structure: current.structure.map((entry, entryIndex) =>
                                    entryIndex === index
                                      ? { ...entry, guidance: event.target.value }
                                      : entry,
                                  ),
                                }))
                              }
                              disabled={isPending}
                              className="min-h-[96px]"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`video-brief-beat-overlay-${beat.order}`}>
                              Suggested overlay
                            </Label>
                            <Input
                              id={`video-brief-beat-overlay-${beat.order}`}
                              value={beat.suggestedOverlay ?? ""}
                              onChange={(event) =>
                                updateDraft((current) => ({
                                  ...current,
                                  structure: current.structure.map((entry, entryIndex) =>
                                    entryIndex === index
                                      ? {
                                          ...entry,
                                          suggestedOverlay: event.target.value,
                                        }
                                      : entry,
                                  ),
                                }))
                              }
                              disabled={isPending}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label>Overlay lines</Label>
                    <p className="mt-1 text-sm text-slate-500">
                      Keep these readable and direct. The downstream factory flow will use
                      them as on-screen text anchors.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {draft.overlayLines.map((line, index) => (
                      <div key={`overlay-line-${index}`} className="space-y-2">
                        <Label htmlFor={`overlay-line-${index}`}>Overlay line {index + 1}</Label>
                        <Input
                          id={`overlay-line-${index}`}
                          value={line}
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              overlayLines: current.overlayLines.map((entry, entryIndex) =>
                                entryIndex === index ? event.target.value : entry,
                              ),
                            }))
                          }
                          disabled={isPending}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr_0.9fr]">
                  <div className="space-y-2">
                    <Label htmlFor="video-brief-cta">Soft close / CTA</Label>
                    <Textarea
                      id="video-brief-cta"
                      value={draft.cta}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          cta: event.target.value,
                        }))
                      }
                      disabled={isPending}
                      className="min-h-[96px]"
                    />
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label>Content type</Label>
                      <p className="mt-1 text-sm text-slate-500">
                        This flows into the persisted video brief used by the render pipeline.
                      </p>
                    </div>
                    <RadioGroup
                      value={draft.contentType ?? "validation"}
                      onValueChange={(value) =>
                        updateDraft((current) => ({
                          ...current,
                          contentType: value as NonNullable<VideoBrief["contentType"]>,
                        }))
                      }
                      className="grid gap-2"
                    >
                      {(["pain", "validation", "solution", "story"] as const).map((value) => (
                        <label
                          key={value}
                          className="flex items-center gap-3 rounded-2xl border border-black/8 bg-white px-3 py-3 text-sm text-slate-700"
                        >
                          <RadioGroupItem value={value} />
                          <span className="font-medium text-slate-900">
                            {titleCase(value)}
                          </span>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleSaveDraft}
                    disabled={isPending}
                  >
                    Save draft
                  </Button>
                  <Button
                    type="button"
                    onClick={handleApproveBrief}
                    disabled={isPending}
                  >
                    5. Approve brief
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
