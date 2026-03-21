const BLOCKED_TRUST_PHRASES = [
  "viral",
  "must-watch",
  "must watch",
  "game changer",
  "secret",
  "you won't believe",
  "this changes everything",
  "every teacher needs",
  "must-see",
  "instant fix",
  "high-converting",
  "unlock",
  "dominate",
  "skyrocket",
  "stop scrolling",
  "don't miss this",
] as const;

const BRO_MARKETING_PHRASES = [
  "guru",
  "bro marketing",
  "coach",
  "level up",
  "crush it",
  "magnetic",
  "founder-led growth",
  "creator economy",
  "thought leadership",
] as const;

const GENERIC_WELLNESS_PHRASES = [
  "self-care",
  "wellness routine",
  "mindset shift",
  "mindset reset",
  "burnout recovery journey",
  "productivity hack",
  "productivity system",
  "personal brand",
  "streamline your workflow",
  "frictionless",
  "all-in-one solution",
  "content machine",
  "saas",
  "workflow stack",
  "tool stack",
  "drive engagement",
  "boost conversions",
  "conversion",
  "engagement",
  "content creator",
  "creator",
] as const;

const MANIPULATIVE_URGENCY_PHRASES = [
  "urgent",
  "right now",
  "today only",
  "don't wait",
  "before it's too late",
  "act now",
  "limited time",
  "exclusive",
  "must act",
  "need to now",
] as const;

const EXAGGERATED_FEAR_PHRASES = [
  "disaster if",
  "wake-up call",
  "everything falls apart",
  "the risk is huge",
  "catastrophic",
  "panic",
  "everyone is failing",
  "nobody is safe",
  "ruin",
] as const;

const OVERPROMISE_PHRASES = [
  "guaranteed",
  "guarantees",
  "always works",
  "never fails",
  "will fix",
  "will solve",
  "proves that",
  "the answer is",
  "everyone should",
  "simple trick",
  "proven",
  "best way to",
  "top tip",
  "here is how to",
  "close the deal",
  "lead funnel",
  "buy now",
  "sign up now",
  "sell more",
  "convert more",
] as const;

const PRODUCT_EARLY_PHRASES = [
  "zaza draft",
  "we built zaza",
  "built zaza draft",
  "our product",
  "our tool",
  "the product",
  "the app",
] as const;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "so",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "when",
  "with",
  "you",
  "your",
]);

export interface PhaseBTrustCheck {
  isSafe: boolean;
  penalty: number;
  reasons: string[];
}

export function normalizePhaseBText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function tokenizePhaseBText(value: string): string[] {
  return normalizePhaseBText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

export function buildPhaseBAnchorTokens(
  values: Array<string | null | undefined>,
): Set<string> {
  return new Set(values.flatMap((value) => tokenizePhaseBText(value ?? "")));
}

export function countPhaseBAnchorOverlap(
  text: string,
  anchorTokens: Set<string>,
): number {
  return tokenizePhaseBText(text).filter((token) => anchorTokens.has(token)).length;
}

function hasPhrase(value: string, phrases: readonly string[]): boolean {
  const normalized = normalizePhaseBText(value).toLowerCase();
  return phrases.some((phrase) => normalized.includes(phrase));
}

export function evaluatePhaseBTrust(
  value: string,
  options?: {
    allowProductMention?: boolean;
  },
): PhaseBTrustCheck {
  const reasons: string[] = [];
  let penalty = 0;

  if (hasPhrase(value, BLOCKED_TRUST_PHRASES)) {
    reasons.push("blocked-language");
    penalty += 40;
  }

  if (hasPhrase(value, BRO_MARKETING_PHRASES)) {
    reasons.push("bro-marketing");
    penalty += 26;
  }

  if (hasPhrase(value, GENERIC_WELLNESS_PHRASES)) {
    reasons.push("generic-drift");
    penalty += 22;
  }

  if (hasPhrase(value, MANIPULATIVE_URGENCY_PHRASES)) {
    reasons.push("manipulative-urgency");
    penalty += 24;
  }

  if (hasPhrase(value, EXAGGERATED_FEAR_PHRASES)) {
    reasons.push("exaggerated-fear");
    penalty += 24;
  }

  if (hasPhrase(value, OVERPROMISE_PHRASES)) {
    reasons.push("overpromising");
    penalty += 22;
  }

  if (!options?.allowProductMention && hasPhrase(value, PRODUCT_EARLY_PHRASES)) {
    reasons.push("product-too-early");
    penalty += 18;
  }

  return {
    isSafe: penalty === 0,
    penalty,
    reasons,
  };
}
