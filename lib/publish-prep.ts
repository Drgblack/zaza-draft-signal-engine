import { z } from "zod";

import { buildSignalAssetBundle, getAssetPrimaryImage, type AssetBundle } from "@/lib/assets";
import {
  buildSignalRepurposingBundle,
  type RepurposedOutput,
} from "@/lib/repurposing";
import { selectBestSiteLink, type SiteLinkDefinition } from "@/lib/site-links";
import type { SignalRecord } from "@/types/signal";

const PUBLISH_PREP_PLATFORMS = [
  "x",
  "linkedin",
  "reddit",
  "email",
  "video",
  "carousel",
  "founder_thought",
] as const;

const PUBLISH_PREP_OUTPUT_KINDS = ["primary_draft", "repurposed_output"] as const;

const hookVariantSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  styleLabel: z.string().trim().min(1),
});

const ctaVariantSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  goalLabel: z.string().trim().min(1),
});

const hashtagOrKeywordSetSchema = z.object({
  id: z.string().trim().min(1),
  items: z.array(z.string().trim().min(1)).max(8),
});

const altTextSchema = z.object({
  text: z.string().trim().min(1),
});

const commentPromptSchema = z.object({
  text: z.string().trim().min(1),
});

const utmParametersSchema = z.object({
  utm_source: z.string().trim().min(1),
  utm_medium: z.string().trim().min(1),
  utm_campaign: z.string().trim().min(1),
  utm_content: z.string().trim().min(1),
});

const linkVariantSchema = z.object({
  url: z.string().trim().min(1),
  label: z.string().trim().min(1),
  siteLinkId: z.string().trim().nullable().optional(),
  destinationLabel: z.string().trim().nullable().optional(),
  usedFallback: z.boolean().optional(),
  utmParameters: utmParametersSchema.optional(),
});

const publishPrepPackageSchema = z.object({
  id: z.string().trim().min(1),
  targetId: z.string().trim().min(1),
  outputKind: z.enum(PUBLISH_PREP_OUTPUT_KINDS),
  platform: z.enum(PUBLISH_PREP_PLATFORMS),
  outputLabel: z.string().trim().nullable(),
  primaryHook: z.string().trim().nullable(),
  selectedHookId: z.string().trim().nullable(),
  hookVariants: z.array(hookVariantSchema).max(4),
  primaryCta: z.string().trim().nullable(),
  selectedCtaId: z.string().trim().nullable(),
  ctaVariants: z.array(ctaVariantSchema).max(4),
  hashtagsOrKeywords: hashtagOrKeywordSetSchema,
  altText: altTextSchema.nullable(),
  commentPrompt: commentPromptSchema.nullable(),
  suggestedPostingTime: z.string().trim().nullable(),
  siteLinkId: z.string().trim().nullable(),
  siteLinkLabel: z.string().trim().nullable(),
  siteLinkReason: z.string().trim().nullable(),
  siteLinkUsedFallback: z.boolean().optional(),
  linkVariants: z.array(linkVariantSchema).max(3),
  notes: z.string().trim().nullable(),
});

const publishPrepBundleSchema = z.object({
  signalId: z.string().trim().min(1),
  primaryPlatform: z.enum(PUBLISH_PREP_PLATFORMS).nullable(),
  packages: z.array(publishPrepPackageSchema).max(10),
});

export type PublishPrepPlatform = (typeof PUBLISH_PREP_PLATFORMS)[number];
export type PublishPrepOutputKind = (typeof PUBLISH_PREP_OUTPUT_KINDS)[number];
export type HookVariant = z.infer<typeof hookVariantSchema>;
export type CtaVariant = z.infer<typeof ctaVariantSchema>;
export type HashtagOrKeywordSet = z.infer<typeof hashtagOrKeywordSetSchema>;
export type AltText = z.infer<typeof altTextSchema>;
export type CommentPrompt = z.infer<typeof commentPromptSchema>;
export type UtmParameters = z.infer<typeof utmParametersSchema>;
export type LinkVariant = z.infer<typeof linkVariantSchema>;
export type PublishPrepPackage = z.infer<typeof publishPrepPackageSchema>;
export type PublishPrepBundle = z.infer<typeof publishPrepBundleSchema>;

export interface PublishPrepBundleSummary {
  packageCount: number;
  primaryPlatformLabel: string | null;
  previewLabels: string[];
}

type DraftPackagePlatform = Extract<PublishPrepPlatform, "x" | "linkedin" | "reddit">;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function firstSentence(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    return "";
  }

  const [sentence] = normalized.split(/(?<=[.!?])\s+/);
  return sentence?.trim() || normalized;
}

function shortLine(value: string | null | undefined, maxLength = 140): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function toPrimaryPlatform(signal: SignalRecord): PublishPrepPlatform | null {
  switch (signal.platformPriority) {
    case "X First":
      return "x";
    case "Reddit First":
      return "reddit";
    case "LinkedIn First":
    case "Multi-platform":
      return "linkedin";
    default:
      return null;
  }
}

function getPlatformLabel(platform: PublishPrepPlatform): string {
  switch (platform) {
    case "x":
      return "X";
    case "linkedin":
      return "LinkedIn";
    case "reddit":
      return "Reddit";
    case "email":
      return "Email";
    case "video":
      return "Video";
    case "carousel":
      return "Carousel";
    case "founder_thought":
    default:
      return "Founder thought";
  }
}

function parseKeywords(value: string | null | undefined): string[] {
  return Array.from(
    new Set(
      (value ?? "")
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 6);
}

function toHashtag(value: string): string {
  const compact = value
    .replace(/^#+/, "")
    .split(/\s+/)
    .map((token) => token.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean)
    .map((token, index) =>
      index === 0 ? token.charAt(0).toUpperCase() + token.slice(1) : token.charAt(0).toUpperCase() + token.slice(1),
    )
    .join("");

  return compact ? `#${compact}` : "";
}

function buildKeywordSet(signal: SignalRecord, platform: PublishPrepPlatform): HashtagOrKeywordSet {
  const baseKeywords = parseKeywords(signal.hashtagsOrKeywords);
  const fallbackKeywords = [
    signal.signalSubtype,
    signal.teacherPainPoint,
    signal.contentAngle,
    signal.relatedZazaFrameworkTag,
  ]
    .map((value) => shortLine(value, 32))
    .filter(Boolean);

  const unique = Array.from(new Set([...baseKeywords, ...fallbackKeywords])).slice(0, 4);
  if (platform === "reddit") {
    return {
      id: `keywords-${slugify(signal.recordId)}-${platform}`,
      items: unique.filter((item) => !item.startsWith("#")).slice(0, 3),
    };
  }

  if (platform === "x") {
    const hashtags = unique.map(toHashtag).filter(Boolean).slice(0, 2);
    return {
      id: `keywords-${slugify(signal.recordId)}-${platform}`,
      items: hashtags.length > 0 ? hashtags : unique.slice(0, 2),
    };
  }

  return {
    id: `keywords-${slugify(signal.recordId)}-${platform}`,
    items: unique,
  };
}

function buildHookVariants(signal: SignalRecord, platform: PublishPrepPlatform, content: string, title?: string | null): HookVariant[] {
  const scenario = firstSentence(signal.scenarioAngle ?? signal.sourceTitle);
  const angle = firstSentence(signal.contentAngle ?? signal.interpretationNotes ?? content);
  const template = firstSentence(signal.hookTemplateUsed ?? content);

  const options: Array<[string, string]> =
    platform === "x"
      ? [
          ["sharp", shortLine(template || angle, 100)],
          ["calm", shortLine(`${scenario}. ${angle}`, 120)],
          ["cautionary", shortLine(signal.riskToTeacher ?? angle, 110)],
        ]
      : platform === "linkedin"
        ? [
            ["reflective", shortLine(template || angle, 130)],
            ["professional", shortLine(`What this really shows is ${angle.toLowerCase()}`, 135)],
            ["calm", shortLine(`${scenario}. This is a communication issue before it becomes a bigger one.`, 140)],
          ]
        : platform === "reddit"
          ? [
              ["situational", shortLine(title || scenario, 140)],
              ["discussion", shortLine(`Curious how others would handle this: ${scenario}`, 140)],
            ]
          : platform === "email"
            ? [
                ["subject", shortLine(title || angle || scenario, 110)],
                ["summary", shortLine(`${scenario}: a calmer way to handle it`, 110)],
              ]
            : platform === "video"
              ? [
                  ["hook", shortLine(template || scenario, 90)],
                  ["warning", shortLine(signal.riskToTeacher ?? angle, 100)],
                ]
              : platform === "carousel"
                ? [
                    ["slide-one", shortLine(template || angle, 120)],
                    ["teacher-safe", shortLine(`${scenario} without making it worse`, 120)],
                  ]
                : [
                    ["founder", shortLine(`One pattern I keep noticing: ${angle || scenario}`, 140)],
                    ["observation", shortLine(`What I keep seeing in teacher communication: ${scenario}`, 140)],
                  ];

  return options
    .map(([styleLabel, text], index) => ({
      id: `hook-${slugify(signal.recordId)}-${platform}-${index + 1}`,
      styleLabel,
      text,
    }))
    .filter((variant) => Boolean(variant.text));
}

function buildDestinationAlignedCta(
  siteLink: SiteLinkDefinition,
  platform: PublishPrepPlatform,
  variant: "primary" | "soft",
): string {
  switch (siteLink.id) {
    case "get_started":
      if (platform === "linkedin") {
        return variant === "primary" ? "If useful, try it free and see how the workflow holds up in practice." : "If this pattern keeps showing up, get started and test it in a calmer workflow.";
      }
      if (platform === "email") {
        return variant === "primary" ? "Get started and try the workflow in your own context." : "Start here if you want a practical first step.";
      }
      return variant === "primary" ? "Try it free." : "Get started if you want the calmer version of this workflow.";
    case "pricing":
      return variant === "primary" ? "See pricing." : "Review the pricing and decide whether it fits your team.";
    case "product_overview":
    case "product_education":
      return variant === "primary" ? "See how it works." : "Read the fuller breakdown if you want the structure behind this.";
    case "teacher_protection":
      return variant === "primary" ? "Read the full teacher-protection breakdown." : "This is worth keeping as a calmer teacher-protection reference.";
    case "planning_support":
      return variant === "primary" ? "Read the full planning-support breakdown." : "Keep the fuller planning structure nearby for the next hard week.";
    case "newsletter":
      return variant === "primary" ? "Join for calmer teacher-facing updates." : "Keep following for more practical teacher-safe examples.";
    case "resources":
      return variant === "primary" ? "Read the full breakdown." : "Save this and use the fuller resource when the situation comes up again.";
    case "home":
    default:
      return variant === "primary" ? "See how it works." : "Read more if you want the fuller context behind this.";
  }
}

function buildCtaText(
  signal: SignalRecord,
  platform: PublishPrepPlatform,
  variant: "primary" | "soft",
  siteLink: SiteLinkDefinition,
): string {
  const goal = signal.ctaGoal;
  const funnel = signal.funnelStage;

  if (platform === "reddit") {
    if (goal === "Visit site" || goal === "Sign up" || goal === "Try product" || funnel === "Consideration" || funnel === "Conversion") {
      return variant === "primary"
        ? `If relevant, the fuller ${siteLink.label.toLowerCase()} link is there for context.`
        : "Mainly curious how others would handle this in practice before clicking away.";
    }

    return variant === "primary"
      ? "How would you phrase this without making it colder or more defensive?"
      : "Interested in how others would handle this in practice.";
  }

  if (goal === "Visit site" || goal === "Sign up" || goal === "Try product" || funnel === "Consideration" || funnel === "Conversion") {
    return buildDestinationAlignedCta(siteLink, platform, variant);
  }

  if (platform === "linkedin") {
    return variant === "primary" ? "It is worth slowing this kind of wording down before it escalates." : "This is a good example of where practical judgement matters more than sounding polished.";
  }

  if (platform === "x") {
    return variant === "primary" ? "Worth keeping in mind before your next reply." : "This is the kind of wording shift that changes the whole exchange.";
  }

  if (platform === "email") {
    return variant === "primary"
      ? "Read the fuller example and adapt the wording to your own context."
      : "Keep this as a calm reference point for the next difficult message.";
  }

  if (platform === "video") {
    return variant === "primary" ? "Save this structure for the next version of the conversation." : "Follow for more teacher-safe wording examples.";
  }

  if (platform === "carousel") {
    return variant === "primary" ? "Swipe through the structure before you write the reply." : "Save the slides for the next high-friction message.";
  }

  return variant === "primary"
    ? "That is one of the quieter communication patterns worth noticing."
    : "I keep coming back to this because it shows how much judgment lives inside small wording choices.";
}

function buildCtaVariants(signal: SignalRecord, platform: PublishPrepPlatform, siteLink: SiteLinkDefinition): CtaVariant[] {
  const primary = buildCtaText(signal, platform, "primary", siteLink);
  const soft = buildCtaText(signal, platform, "soft", siteLink);
  const goalLabel =
    signal.ctaGoal === "Share / engage"
      ? "discussion"
      : signal.ctaGoal === "Visit site" || signal.ctaGoal === "Sign up" || signal.ctaGoal === "Try product"
        ? "click"
        : signal.funnelStage?.toLowerCase() ?? "awareness";

  return [
    {
      id: `cta-${slugify(signal.recordId)}-${platform}-1`,
      text: primary,
      goalLabel,
    },
    {
      id: `cta-${slugify(signal.recordId)}-${platform}-2`,
      text: soft,
      goalLabel: goalLabel === "click" ? "trust" : goalLabel,
    },
  ];
}

function buildAltText(
  signal: SignalRecord,
  platform: PublishPrepPlatform,
  assetBundle: AssetBundle | null,
): AltText | null {
  if (platform === "reddit" || platform === "email" || platform === "founder_thought") {
    return null;
  }

  const image = getAssetPrimaryImage(assetBundle, signal.selectedImageAssetId);
  const scenario = firstSentence(signal.scenarioAngle ?? signal.sourceTitle);
  const description = image?.conceptDescription ?? `Teacher-facing visual supporting ${scenario.toLowerCase()}.`;
  const overlay = image?.textOverlay ? ` Optional overlay text reads "${image.textOverlay}".` : "";

  return {
    text: shortLine(`${description}${overlay} Tone stays calm, professional, and teacher-safe.`, 240),
  };
}

function buildCommentPrompt(signal: SignalRecord, platform: PublishPrepPlatform): CommentPrompt | null {
  const scenario = firstSentence(signal.scenarioAngle ?? signal.sourceTitle);

  if (platform === "reddit") {
    return {
      text: `Curious how others would handle "${scenario}" without making the message colder than intended.`,
    };
  }

  if (platform === "linkedin") {
    return {
      text: `One question I would leave under this: where do you usually see the real pressure in this kind of wording?`,
    };
  }

  if (platform === "x") {
    return {
      text: "Follow-up reply prompt: the pressure usually sits inside the wording choices, not only the event.",
    };
  }

  if (platform === "email") {
    return {
      text: "Reply prompt: which part of this situation feels hardest to phrase calmly right now?",
    };
  }

  return {
    text: `Follow-up prompt: show the safer wording move for ${scenario.toLowerCase()}.`,
  };
}

function buildSuggestedPostingTime(signal: SignalRecord, platform: PublishPrepPlatform): string {
  const audience = (signal.audienceSegmentId ?? "").toLowerCase();
  const discussionHeavy = signal.ctaGoal === "Share / engage" || platform === "reddit";

  if (platform === "linkedin" || platform === "founder_thought") {
    if (audience.includes("leader")) {
      return "Suggested time: weekday lunch or early afternoon for school-leader attention.";
    }

    return "Suggested time: weekday morning or lunch when professional attention is highest.";
  }

  if (platform === "x") {
    return discussionHeavy
      ? "Suggested time: early morning or mid-afternoon when quick discussion can pick up."
      : "Suggested time: weekday morning for a sharper short-form post.";
  }

  if (platform === "reddit") {
    return "Suggested time: early evening or a community-active weekend slot for discussion-led posts.";
  }

  if (platform === "email") {
    return "Suggested time: weekday early morning when inbox triage is still active.";
  }

  if (platform === "video") {
    return discussionHeavy
      ? "Suggested time: lunch or early evening when short-form viewing is easier."
      : "Suggested time: midday for a quick short-form explainer.";
  }

  if (platform === "carousel") {
    return "Suggested time: weekday morning for saveable educational content.";
  }

  return "Suggested time: weekday morning for calmer reflective content.";
}

function isLinkRelevant(signal: SignalRecord): boolean {
  return (
    signal.ctaGoal === "Visit site" ||
    signal.ctaGoal === "Sign up" ||
    signal.ctaGoal === "Try product" ||
    signal.funnelStage === "Consideration" ||
    signal.funnelStage === "Conversion"
  );
}

function buildMedium(platform: PublishPrepPlatform): string {
  if (platform === "email") {
    return "newsletter_manual";
  }

  if (platform === "reddit") {
    return "community_manual";
  }

  return "organic_social_manual";
}

function buildTrackedUrl(url: string, utmParameters: UtmParameters): string {
  const trackedUrl = new URL(url);
  Object.entries(utmParameters).forEach(([key, value]) => {
    trackedUrl.searchParams.set(key, value);
  });
  return trackedUrl.toString();
}

function buildLinkVariants(signal: SignalRecord, platform: PublishPrepPlatform, targetId: string): LinkVariant[] {
  if (!isLinkRelevant(signal)) {
    return [];
  }

  const selection = selectBestSiteLink({
    signal,
    platform,
    targetId,
  });
  const campaignSlug = slugify(signal.campaignId ?? "evergreen");
  const contentSlug = slugify(`${signal.editorialMode ?? "content"}-${platform}-${targetId}`);
  const utmParameters: UtmParameters = {
    utm_source: platform,
    utm_medium: buildMedium(platform),
    utm_campaign: campaignSlug || "evergreen",
    utm_content: contentSlug || slugify(signal.recordId),
  };

  return [
    {
      url: buildTrackedUrl(selection.siteLink.url, utmParameters),
      label: buildDestinationAlignedCta(selection.siteLink, platform, "primary"),
      siteLinkId: selection.siteLink.id,
      destinationLabel: selection.siteLink.label,
      usedFallback: selection.usedFallback,
      utmParameters,
    },
  ];
}

function buildNotes(platform: PublishPrepPlatform): string {
  switch (platform) {
    case "x":
      return "Keep the first line clean. Avoid stuffing hashtags into the hook.";
    case "linkedin":
      return "Preserve paragraph spacing and stay reflective rather than sales-heavy.";
    case "reddit":
      return "Keep this conversational. Discussion matters more than polish.";
    case "email":
      return "Use the subject line like a hook, then get to the point quickly.";
    case "video":
      return "Keep the first two seconds direct and match the script to the selected shot list.";
    case "carousel":
      return "One idea per slide. Let the first slide carry the tension clearly.";
    case "founder_thought":
    default:
      return "Keep the tone personal and observational, not performative.";
  }
}

function buildDraftPackage(
  signal: SignalRecord,
  platform: DraftPackagePlatform,
  draft: string,
  assetBundle: AssetBundle | null,
): PublishPrepPackage {
  const hookVariants = buildHookVariants(signal, platform, draft);
  const linkVariants = buildLinkVariants(signal, platform, platform);
  const selectedSiteLink = linkVariants[0]?.siteLinkId ? selectBestSiteLink({ signal, platform, targetId: platform, preferredSiteLinkId: linkVariants[0].siteLinkId }) : selectBestSiteLink({ signal, platform, targetId: platform });
  const ctaVariants = buildCtaVariants(signal, platform, selectedSiteLink.siteLink);

  return {
    id: `publish-prep-${slugify(signal.recordId)}-${platform}`,
    targetId: platform,
    outputKind: "primary_draft",
    platform,
    outputLabel: `${getPlatformLabel(platform)} primary draft`,
    primaryHook: hookVariants[0]?.text ?? null,
    selectedHookId: hookVariants[0]?.id ?? null,
    hookVariants,
    primaryCta: ctaVariants[0]?.text ?? null,
    selectedCtaId: ctaVariants[0]?.id ?? null,
    ctaVariants,
    hashtagsOrKeywords: buildKeywordSet(signal, platform),
    altText: buildAltText(signal, platform, assetBundle),
    commentPrompt: buildCommentPrompt(signal, platform),
    suggestedPostingTime: buildSuggestedPostingTime(signal, platform),
    siteLinkId: linkVariants.length > 0 ? selectedSiteLink.siteLink.id : null,
    siteLinkLabel: linkVariants.length > 0 ? selectedSiteLink.siteLink.label : null,
    siteLinkReason: linkVariants.length > 0 ? selectedSiteLink.reason : null,
    siteLinkUsedFallback: linkVariants.length > 0 ? selectedSiteLink.usedFallback : false,
    linkVariants,
    notes: buildNotes(platform),
  };
}

function shouldIncludeRepurposedOutput(output: RepurposedOutput): boolean {
  if (output.platform === "x" || output.platform === "linkedin" || output.platform === "reddit") {
    return output.formatType !== "post";
  }

  return true;
}

function buildRepurposedPackage(signal: SignalRecord, output: RepurposedOutput, assetBundle: AssetBundle | null): PublishPrepPackage {
  const hookVariants = buildHookVariants(signal, output.platform as PublishPrepPlatform, output.content, output.title);
  const linkVariants = buildLinkVariants(signal, output.platform as PublishPrepPlatform, output.id);
  const selectedSiteLink = linkVariants[0]?.siteLinkId
    ? selectBestSiteLink({
        signal,
        platform: output.platform,
        targetId: output.id,
        preferredSiteLinkId: linkVariants[0].siteLinkId,
      })
    : selectBestSiteLink({
        signal,
        platform: output.platform,
        targetId: output.id,
      });
  const ctaVariants =
    output.CTA?.trim()
      ? [
          {
            id: `cta-${slugify(output.id)}-1`,
            text: output.CTA.trim(),
            goalLabel: signal.ctaGoal?.toLowerCase() ?? "platform",
          },
          ...buildCtaVariants(signal, output.platform as PublishPrepPlatform, selectedSiteLink.siteLink).slice(0, 1).map((variant, index) => ({
            ...variant,
            id: `cta-${slugify(output.id)}-${index + 2}`,
          })),
        ]
      : buildCtaVariants(signal, output.platform as PublishPrepPlatform, selectedSiteLink.siteLink);

  return {
    id: `publish-prep-${slugify(output.id)}`,
    targetId: output.id,
    outputKind: "repurposed_output",
    platform: output.platform as PublishPrepPlatform,
    outputLabel: output.title ?? `${getPlatformLabel(output.platform as PublishPrepPlatform)} ${output.formatType}`,
    primaryHook: hookVariants[0]?.text ?? output.hook ?? null,
    selectedHookId: hookVariants[0]?.id ?? null,
    hookVariants,
    primaryCta: ctaVariants[0]?.text ?? null,
    selectedCtaId: ctaVariants[0]?.id ?? null,
    ctaVariants,
    hashtagsOrKeywords: buildKeywordSet(signal, output.platform as PublishPrepPlatform),
    altText: buildAltText(signal, output.platform as PublishPrepPlatform, assetBundle),
    commentPrompt: buildCommentPrompt(signal, output.platform as PublishPrepPlatform),
    suggestedPostingTime: buildSuggestedPostingTime(signal, output.platform as PublishPrepPlatform),
    siteLinkId: linkVariants.length > 0 ? selectedSiteLink.siteLink.id : null,
    siteLinkLabel: linkVariants.length > 0 ? selectedSiteLink.siteLink.label : null,
    siteLinkReason: linkVariants.length > 0 ? selectedSiteLink.reason : null,
    siteLinkUsedFallback: linkVariants.length > 0 ? selectedSiteLink.usedFallback : false,
    linkVariants,
    notes: output.notes ?? buildNotes(output.platform as PublishPrepPlatform),
  };
}

export function parsePublishPrepBundle(value: string | null | undefined): PublishPrepBundle | null {
  if (!value) {
    return null;
  }

  try {
    return publishPrepBundleSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

export function stringifyPublishPrepBundle(bundle: PublishPrepBundle | null | undefined): string | null {
  if (!bundle) {
    return null;
  }

  return JSON.stringify(publishPrepBundleSchema.parse(bundle));
}

export function getPublishPrepPackageLabel(pkg: PublishPrepPackage): string {
  return pkg.outputLabel ?? `${getPlatformLabel(pkg.platform)} publish prep`;
}

export function getSelectedHookText(pkg: PublishPrepPackage): string | null {
  if (pkg.selectedHookId) {
    const match = pkg.hookVariants.find((variant) => variant.id === pkg.selectedHookId);
    if (match) {
      return match.text;
    }
  }

  return pkg.primaryHook;
}

export function getSelectedCtaText(pkg: PublishPrepPackage): string | null {
  if (pkg.selectedCtaId) {
    const match = pkg.ctaVariants.find((variant) => variant.id === pkg.selectedCtaId);
    if (match) {
      return match.text;
    }
  }

  return pkg.primaryCta;
}

export function getPrimaryLinkVariant(pkg: PublishPrepPackage): LinkVariant | null {
  return pkg.linkVariants[0] ?? null;
}

export function getPublishPrepPackageForPlatform(
  bundle: PublishPrepBundle | null,
  platform: DraftPackagePlatform,
): PublishPrepPackage | null {
  if (!bundle) {
    return null;
  }

  return bundle.packages.find((pkg) => pkg.platform === platform && pkg.outputKind === "primary_draft") ?? null;
}

export function buildPublishPrepBundleSummary(bundle: PublishPrepBundle | null): PublishPrepBundleSummary | null {
  if (!bundle || bundle.packages.length === 0) {
    return null;
  }

  return {
    packageCount: bundle.packages.length,
    primaryPlatformLabel: bundle.primaryPlatform ? getPlatformLabel(bundle.primaryPlatform) : null,
    previewLabels: bundle.packages.slice(0, 3).map((pkg) => getPublishPrepPackageLabel(pkg)),
  };
}

export function buildSignalPublishPrepBundle(signal: SignalRecord): PublishPrepBundle | null {
  const assetBundle = buildSignalAssetBundle(signal);
  const packages: PublishPrepPackage[] = [];

  if (signal.xDraft) {
    packages.push(buildDraftPackage(signal, "x", signal.finalXDraft ?? signal.xDraft, assetBundle));
  }

  if (signal.linkedInDraft) {
    packages.push(buildDraftPackage(signal, "linkedin", signal.finalLinkedInDraft ?? signal.linkedInDraft, assetBundle));
  }

  if (signal.redditDraft) {
    packages.push(buildDraftPackage(signal, "reddit", signal.finalRedditDraft ?? signal.redditDraft, assetBundle));
  }

  const repurposingBundle = buildSignalRepurposingBundle(signal);
  if (repurposingBundle) {
    for (const output of repurposingBundle.outputs.filter(shouldIncludeRepurposedOutput)) {
      packages.push(buildRepurposedPackage(signal, output, assetBundle));
    }
  }

  if (packages.length === 0) {
    return null;
  }

  return {
    signalId: signal.recordId,
    primaryPlatform: toPrimaryPlatform(signal),
    packages: packages.slice(0, 10),
  };
}
