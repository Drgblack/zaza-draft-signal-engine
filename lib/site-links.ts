import type { CtaGoal, FunnelStage, SignalRecord } from "@/types/signal";

export const ZAZA_SITE_BASE_URL = "https://www.zazadraft.com";

export const SITE_LINK_ROUTE_STATUSES = ["confirmed", "fallback"] as const;

export type SiteLinkRouteStatus = (typeof SITE_LINK_ROUTE_STATUSES)[number];

export interface SiteLinkDefinition {
  id:
    | "home"
    | "get_started"
    | "pricing"
    | "product_overview"
    | "teacher_protection"
    | "planning_support"
    | "product_education"
    | "newsletter"
    | "resources";
  label: string;
  url: string;
  description: string;
  routeStatus: SiteLinkRouteStatus;
  intendedFunnelStages: FunnelStage[];
  intendedCtaGoals: CtaGoal[];
  campaignFitTags?: string[];
}

export interface SiteLinkSelection {
  siteLink: SiteLinkDefinition;
  reason: string;
  usedFallback: boolean;
}

export const SITE_LINK_REGISTRY: SiteLinkDefinition[] = [
  {
    id: "home",
    label: "Homepage",
    url: `${ZAZA_SITE_BASE_URL}/`,
    description: "General overview and safest fallback destination.",
    routeStatus: "confirmed",
    intendedFunnelStages: ["Awareness", "Trust", "Consideration"],
    intendedCtaGoals: ["Awareness", "Visit site"],
    campaignFitTags: ["general", "overview"],
  },
  {
    id: "get_started",
    label: "Get Started",
    url: `${ZAZA_SITE_BASE_URL}/get-started`,
    description: "Primary start or signup path for conversion-focused content.",
    routeStatus: "confirmed",
    intendedFunnelStages: ["Consideration", "Conversion"],
    intendedCtaGoals: ["Sign up", "Try product", "Visit site"],
    campaignFitTags: ["signup", "trial", "conversion"],
  },
  {
    id: "pricing",
    label: "Pricing",
    url: `${ZAZA_SITE_BASE_URL}/pricing`,
    description: "Direct pricing destination for consideration and conversion content.",
    routeStatus: "confirmed",
    intendedFunnelStages: ["Consideration", "Conversion"],
    intendedCtaGoals: ["Visit site", "Try product", "Sign up"],
    campaignFitTags: ["pricing", "product", "conversion"],
  },
  {
    id: "product_overview",
    label: "Product Overview",
    url: `${ZAZA_SITE_BASE_URL}/`,
    description: "Soft product explanation destination when a dedicated route is not yet registered.",
    routeStatus: "fallback",
    intendedFunnelStages: ["Trust", "Consideration"],
    intendedCtaGoals: ["Visit site", "Awareness"],
    campaignFitTags: ["product", "overview"],
  },
  {
    id: "teacher_protection",
    label: "Teacher Protection",
    url: `${ZAZA_SITE_BASE_URL}/`,
    description: "Teacher-protection themed destination placeholder until a dedicated route is registered.",
    routeStatus: "fallback",
    intendedFunnelStages: ["Awareness", "Trust"],
    intendedCtaGoals: ["Awareness", "Visit site"],
    campaignFitTags: ["teacher protection", "boundary", "risk", "policy"],
  },
  {
    id: "planning_support",
    label: "Planning Support",
    url: `${ZAZA_SITE_BASE_URL}/`,
    description: "Planning-support destination placeholder until a dedicated route is registered.",
    routeStatus: "fallback",
    intendedFunnelStages: ["Awareness", "Trust", "Consideration"],
    intendedCtaGoals: ["Awareness", "Visit site"],
    campaignFitTags: ["planning", "workload", "support"],
  },
  {
    id: "product_education",
    label: "Product Education",
    url: `${ZAZA_SITE_BASE_URL}/`,
    description: "Educational product destination placeholder until a dedicated route is registered.",
    routeStatus: "fallback",
    intendedFunnelStages: ["Trust", "Consideration"],
    intendedCtaGoals: ["Awareness", "Visit site", "Try product"],
    campaignFitTags: ["education", "product", "how it works"],
  },
  {
    id: "newsletter",
    label: "Newsletter",
    url: `${ZAZA_SITE_BASE_URL}/`,
    description: "Newsletter destination placeholder until a dedicated route is registered.",
    routeStatus: "fallback",
    intendedFunnelStages: ["Awareness", "Trust", "Retention"],
    intendedCtaGoals: ["Awareness", "Sign up"],
    campaignFitTags: ["newsletter", "updates"],
  },
  {
    id: "resources",
    label: "Resources",
    url: `${ZAZA_SITE_BASE_URL}/`,
    description: "General resources destination placeholder until a dedicated route is registered.",
    routeStatus: "fallback",
    intendedFunnelStages: ["Awareness", "Trust"],
    intendedCtaGoals: ["Awareness", "Visit site"],
    campaignFitTags: ["resources", "helpful tip", "support"],
  },
];

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function getCombinedSignalText(signal: SignalRecord): string {
  return [
    signal.sourceTitle,
    signal.manualSummary,
    signal.rawExcerpt,
    signal.signalSubtype,
    signal.contentAngle,
    signal.interpretationNotes,
    signal.teacherPainPoint,
    signal.riskToTeacher,
    signal.campaignId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getRouteFallback(siteLink: SiteLinkDefinition): boolean {
  return siteLink.routeStatus === "fallback";
}

function getSiteLink(id: SiteLinkDefinition["id"]): SiteLinkDefinition {
  return SITE_LINK_REGISTRY.find((entry) => entry.id === id)!;
}

function isProductEducationSignal(signal: SignalRecord, combinedText: string): boolean {
  return (
    signal.editorialMode === "professional_guidance" ||
    signal.ctaGoal === "Try product" ||
    signal.ctaGoal === "Sign up" ||
    includesAny(combinedText, ["product", "tool", "workflow", "system", "how it works"])
  );
}

export function getSiteLinkById(id: string | null | undefined): SiteLinkDefinition | null {
  if (!id) {
    return null;
  }

  return SITE_LINK_REGISTRY.find((entry) => entry.id === id) ?? null;
}

export function selectBestSiteLink(input: {
  signal: SignalRecord;
  platform: string;
  targetId?: string | null;
  preferredSiteLinkId?: string | null;
}): SiteLinkSelection {
  const { signal, preferredSiteLinkId } = input;
  const combinedText = getCombinedSignalText(signal);

  if (preferredSiteLinkId) {
    const preferred = getSiteLinkById(preferredSiteLinkId);
    if (preferred) {
      return {
        siteLink: preferred,
        reason: "Operator-selected destination preserved from publish prep.",
        usedFallback: getRouteFallback(preferred),
      };
    }
  }

  if (signal.ctaGoal === "Sign up" || signal.ctaGoal === "Try product" || signal.funnelStage === "Conversion") {
    const siteLink = getSiteLink("get_started");
    return {
      siteLink,
      reason: "Conversion or signup-oriented content routes to the main get-started path.",
      usedFallback: false,
    };
  }

  if (
    signal.funnelStage === "Consideration" ||
    signal.ctaGoal === "Visit site" ||
    isProductEducationSignal(signal, combinedText)
  ) {
    const siteLink = includesAny(combinedText, ["pricing", "cost", "plan", "subscription"])
      ? getSiteLink("pricing")
      : isProductEducationSignal(signal, combinedText)
        ? getSiteLink("product_education")
        : getSiteLink("product_overview");
    return {
      siteLink,
      reason: "Consideration and product-education content should point to clearer product context.",
      usedFallback: getRouteFallback(siteLink),
    };
  }

  if (includesAny(combinedText, ["planning", "workload", "behind", "organis", "organize", "lesson"])) {
    const siteLink = getSiteLink("planning_support");
    return {
      siteLink,
      reason: "Planning and workload themes fit the planning-support destination.",
      usedFallback: true,
    };
  }

  if (includesAny(combinedText, ["policy", "boundary", "complaint", "document", "discipline", "risk"])) {
    const siteLink = getSiteLink("teacher_protection");
    return {
      siteLink,
      reason: "Teacher-risk and protection themes fit the teacher-protection destination.",
      usedFallback: true,
    };
  }

  if (signal.funnelStage === "Trust") {
    const siteLink = getSiteLink("resources");
    return {
      siteLink,
      reason: "Trust-stage content should land on a softer educational destination.",
      usedFallback: true,
    };
  }

  if (signal.funnelStage === "Retention") {
    const siteLink = getSiteLink("newsletter");
    return {
      siteLink,
      reason: "Retention-oriented content should point to a recurring update destination.",
      usedFallback: true,
    };
  }

  const siteLink = getSiteLink("home");
  return {
    siteLink,
    reason: "Homepage is the safest general destination when no stronger site-link fit is available.",
    usedFallback: false,
  };
}
