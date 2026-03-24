"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProductionDefaults } from "@/lib/production-defaults";
import type { ProductionDefaultsResponse } from "@/types/api";

type FormState = {
  voiceId: string;
  styleAnchorPrompt: string;
  referenceImageUrl: string;
  modelFamily: string;
  motionStyle: string;
  negativeConstraintsText: string;
  aspectRatio: ProductionDefaults["aspectRatio"];
  resolution: ProductionDefaults["resolution"];
  captionPreset: string;
  captionPlacement: ProductionDefaults["captionStyle"]["placement"];
  captionCasing: ProductionDefaults["captionStyle"]["casing"];
  transitionStyle: string;
  musicMode: NonNullable<ProductionDefaults["compositionDefaults"]["musicMode"]>;
};

function toFormState(productionDefaults: ProductionDefaults): FormState {
  return {
    voiceId: productionDefaults.voiceId,
    styleAnchorPrompt: productionDefaults.styleAnchorPrompt,
    referenceImageUrl: productionDefaults.referenceImageUrl ?? "",
    modelFamily: productionDefaults.modelFamily ?? "",
    motionStyle: productionDefaults.motionStyle,
    negativeConstraintsText: productionDefaults.negativeConstraints.join("\n"),
    aspectRatio: productionDefaults.aspectRatio,
    resolution: productionDefaults.resolution,
    captionPreset: productionDefaults.captionStyle.preset,
    captionPlacement: productionDefaults.captionStyle.placement,
    captionCasing: productionDefaults.captionStyle.casing,
    transitionStyle: productionDefaults.compositionDefaults.transitionStyle ?? "",
    musicMode: productionDefaults.compositionDefaults.musicMode ?? "none",
  };
}

function toneClasses(tone: "success" | "error") {
  return tone === "success"
    ? "bg-emerald-50 text-emerald-700"
    : "bg-rose-50 text-rose-700";
}

export default function ProductionDefaultsPage() {
  const [savedDefaults, setSavedDefaults] = useState<ProductionDefaults | null>(null);
  const [formState, setFormState] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    title: string;
    body: string;
  } | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProductionDefaults() {
      setLoading(true);
      setFeedback(null);

      try {
        const response = await fetch("/api/production-defaults", {
          cache: "no-store",
        });
        const data = (await response.json()) as ProductionDefaultsResponse;

        if (!response.ok || !data.success || !data.productionDefaults) {
          throw new Error(
            data.error ?? "Unable to load production defaults.",
          );
        }

        if (!active) {
          return;
        }

        setSavedDefaults(data.productionDefaults);
        setFormState(toFormState(data.productionDefaults));
      } catch (error) {
        if (!active) {
          return;
        }

        setFeedback({
          tone: "error",
          title: "Unable to load defaults",
          body:
            error instanceof Error
              ? error.message
              : "Production defaults could not be loaded.",
        });
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadProductionDefaults();

    return () => {
      active = false;
    };
  }, []);

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setFormState((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [key]: value,
      };
    });
  }

  async function handleSave() {
    if (!formState) {
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      const negativeConstraints = formState.negativeConstraintsText
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);

      const response = await fetch("/api/production-defaults", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          voiceId: formState.voiceId,
          styleAnchorPrompt: formState.styleAnchorPrompt,
          referenceImageUrl: formState.referenceImageUrl.trim() || null,
          modelFamily: formState.modelFamily.trim() || null,
          motionStyle: formState.motionStyle,
          negativeConstraints,
          aspectRatio: formState.aspectRatio,
          resolution: formState.resolution,
          captionStyle: {
            preset: formState.captionPreset,
            placement: formState.captionPlacement,
            casing: formState.captionCasing,
          },
          compositionDefaults: {
            transitionStyle: formState.transitionStyle.trim() || undefined,
            musicMode: formState.musicMode,
          },
        }),
      });
      const data = (await response.json()) as ProductionDefaultsResponse;

      if (!response.ok || !data.success || !data.productionDefaults) {
        throw new Error(
          data.error ?? "Unable to update production defaults.",
        );
      }

      setSavedDefaults(data.productionDefaults);
      setFormState(toFormState(data.productionDefaults));
      setFeedback({
        tone: "success",
        title: "Production defaults updated",
        body: data.message ?? "The active founder defaults are now saved.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Unable to update defaults",
        body:
          error instanceof Error
            ? error.message
            : "Production defaults could not be updated.",
      });
    } finally {
      setSaving(false);
    }
  }

  const isDirty =
    savedDefaults && formState
      ? JSON.stringify(toFormState(savedDefaults)) !== JSON.stringify(formState)
      : false;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-slate-100 text-slate-700 ring-slate-200">
              Founder defaults
            </Badge>
            {savedDefaults ? (
              <Badge className="bg-sky-50 text-sky-700 ring-sky-200">
                Updated {new Date(savedDefaults.updatedAt).toLocaleString()}
              </Badge>
            ) : null}
          </div>
          <CardTitle className="text-balance text-3xl">
            Production Defaults
          </CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            One active profile for how approved briefs compile into render-ready production inputs. Keep changes small and founder-readable.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Profile</CardTitle>
          <CardDescription>
            Voice, visual style, captions, and composition defaults used by the compiled production layer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading || !formState ? (
            <p className="text-sm text-slate-600">Loading production defaults...</p>
          ) : (
            <>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="voiceId">Voice ID</Label>
                  <Input
                    id="voiceId"
                    value={formState.voiceId}
                    onChange={(event) => updateField("voiceId", event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="aspectRatio">Aspect ratio</Label>
                  <Select
                    id="aspectRatio"
                    value={formState.aspectRatio}
                    onChange={(event) =>
                      updateField(
                        "aspectRatio",
                        event.target.value as FormState["aspectRatio"],
                      )
                    }
                  >
                    <option value="9:16">9:16</option>
                    <option value="1:1">1:1</option>
                    <option value="16:9">16:9</option>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="resolution">Resolution</Label>
                  <Select
                    id="resolution"
                    value={formState.resolution}
                    onChange={(event) =>
                      updateField(
                        "resolution",
                        event.target.value as FormState["resolution"],
                      )
                    }
                  >
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="modelFamily">Model family</Label>
                  <Input
                    id="modelFamily"
                    value={formState.modelFamily}
                    onChange={(event) =>
                      updateField("modelFamily", event.target.value)
                    }
                    placeholder="e.g. teacher-real-v1"
                  />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="referenceImageUrl">Reference image URL</Label>
                  <Input
                    id="referenceImageUrl"
                    value={formState.referenceImageUrl}
                    onChange={(event) =>
                      updateField("referenceImageUrl", event.target.value)
                    }
                    placeholder="https://..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="transitionStyle">Transition style</Label>
                  <Input
                    id="transitionStyle"
                    value={formState.transitionStyle}
                    onChange={(event) =>
                      updateField("transitionStyle", event.target.value)
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="musicMode">Music mode</Label>
                  <Select
                    id="musicMode"
                    value={formState.musicMode}
                    onChange={(event) =>
                      updateField(
                        "musicMode",
                        event.target.value as FormState["musicMode"],
                      )
                    }
                  >
                    <option value="none">none</option>
                    <option value="light-bed">light-bed</option>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="captionPreset">Caption preset</Label>
                  <Input
                    id="captionPreset"
                    value={formState.captionPreset}
                    onChange={(event) =>
                      updateField("captionPreset", event.target.value)
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="captionPlacement">Caption placement</Label>
                  <Select
                    id="captionPlacement"
                    value={formState.captionPlacement}
                    onChange={(event) =>
                      updateField(
                        "captionPlacement",
                        event.target.value as FormState["captionPlacement"],
                      )
                    }
                  >
                    <option value="center">center</option>
                    <option value="lower-third">lower-third</option>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="captionCasing">Caption casing</Label>
                  <Select
                    id="captionCasing"
                    value={formState.captionCasing}
                    onChange={(event) =>
                      updateField(
                        "captionCasing",
                        event.target.value as FormState["captionCasing"],
                      )
                    }
                  >
                    <option value="sentence">sentence</option>
                    <option value="title">title</option>
                    <option value="upper">upper</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-5">
                <div className="grid gap-2">
                  <Label htmlFor="styleAnchorPrompt">Style anchor prompt</Label>
                  <Textarea
                    id="styleAnchorPrompt"
                    value={formState.styleAnchorPrompt}
                    onChange={(event) =>
                      updateField("styleAnchorPrompt", event.target.value)
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="motionStyle">Motion style</Label>
                  <Textarea
                    id="motionStyle"
                    value={formState.motionStyle}
                    onChange={(event) =>
                      updateField("motionStyle", event.target.value)
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="negativeConstraints">
                    Negative constraints
                  </Label>
                  <Textarea
                    id="negativeConstraints"
                    value={formState.negativeConstraintsText}
                    onChange={(event) =>
                      updateField("negativeConstraintsText", event.target.value)
                    }
                  />
                  <p className="text-xs text-slate-500">
                    One line per constraint.
                  </p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={loading || saving || !isDirty}
        >
          {saving ? "Saving..." : "Save defaults"}
        </Button>
        <p className="text-sm text-slate-500">
          One active profile only.
        </p>
      </div>

      {feedback ? (
        <div className={`rounded-2xl px-4 py-3 text-sm ${toneClasses(feedback.tone)}`}>
          <p className="font-medium">{feedback.title}</p>
          <p className="mt-1">{feedback.body}</p>
        </div>
      ) : null}
    </div>
  );
}
