import type { SignalRecord } from "@/types/signal";

export type SourceProfileKind = "reddit" | "feed" | "forum" | "internal" | "report" | "other";

export interface SourceProfile {
  id:
    | "reddit-teacher-discussion"
    | "reddit-higher-ed-discussion"
    | "reddit-education-discussion"
    | "feed-policy-news"
    | "feed-teacher-news"
    | "forum-teacher-discussion"
    | "internal-operator-signal"
    | "formal-report"
    | "generic-external";
  sourceKind: SourceProfileKind;
  kindLabel: string;
  contextLabel: string;
  teacherProximity: number;
  communicationProximity: number;
  trustBaseline: number;
  notes: string[];
  subreddit: string | null;
}

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function extractSubredditName(signal: Pick<SignalRecord, "sourcePublisher" | "ingestionSource" | "sourceUrl">): string | null {
  const combined = [signal.sourcePublisher, signal.ingestionSource, signal.sourceUrl].filter(Boolean).join(" ");
  const match = combined.match(/r\/([A-Za-z0-9_]+)/i);
  return match?.[1] ?? null;
}

export function getSourceProfile(signal: SignalRecord): SourceProfile {
  const ingestionMethod = normalize(signal.ingestionMethod);
  const sourceType = normalize(signal.sourceType);
  const sourcePublisher = normalize(signal.sourcePublisher);
  const ingestionSource = normalize(signal.ingestionSource);
  const sourceUrl = normalize(signal.sourceUrl);
  const subreddit = extractSubredditName(signal);

  if (ingestionMethod === "reddit" || sourcePublisher.includes("reddit") || sourceUrl.includes("reddit.com")) {
    if (subreddit && ["teachers", "teachinguk"].includes(subreddit.toLowerCase())) {
      return {
        id: "reddit-teacher-discussion",
        sourceKind: "reddit",
        kindLabel: "Reddit",
        contextLabel: `Teacher discussion${subreddit ? ` · r/${subreddit}` : ""}`,
        teacherProximity: 90,
        communicationProximity: 82,
        trustBaseline: 46,
        notes: ["Teacher-authored discussion can be high-signal when the post names a live communication tension."],
        subreddit,
      };
    }

    if (subreddit?.toLowerCase() === "professors") {
      return {
        id: "reddit-higher-ed-discussion",
        sourceKind: "reddit",
        kindLabel: "Reddit",
        contextLabel: `Higher-ed discussion${subreddit ? ` · r/${subreddit}` : ""}`,
        teacherProximity: 65,
        communicationProximity: 58,
        trustBaseline: 44,
        notes: ["Higher-ed discussion can still surface documentation and communication pressure, but is less directly aligned than school-teacher discussion."],
        subreddit,
      };
    }

    return {
      id: "reddit-education-discussion",
      sourceKind: "reddit",
      kindLabel: "Reddit",
      contextLabel: `Education discussion${subreddit ? ` · r/${subreddit}` : ""}`,
      teacherProximity: 72,
      communicationProximity: 56,
      trustBaseline: 42,
      notes: ["Education discussion is useful when the post is teacher-facing, but source trust remains moderate because it is still a public forum."],
      subreddit,
    };
  }

  if (["support ticket", "internal note", "customer call"].includes(sourceType)) {
    return {
      id: "internal-operator-signal",
      sourceKind: "internal",
      kindLabel: "Internal",
      contextLabel: "Operator / support signal",
      teacherProximity: 88,
      communicationProximity: 78,
      trustBaseline: 78,
      notes: ["Internal operator signals are close to real teacher friction, though they still need editorial judgement."],
      subreddit: null,
    };
  }

  if (["community thread", "forum post"].includes(sourceType)) {
    return {
      id: "forum-teacher-discussion",
      sourceKind: "forum",
      kindLabel: "Forum",
      contextLabel: "Teacher discussion",
      teacherProximity: 78,
      communicationProximity: 68,
      trustBaseline: 50,
      notes: ["Forum-style teacher discussion is valuable when it names the communication problem directly."],
      subreddit: null,
    };
  }

  if (
    sourcePublisher.includes("government") ||
    sourcePublisher.includes("department for education") ||
    sourceUrl.includes(".gov") ||
    sourceUrl.includes(".edu")
  ) {
    return {
      id: "formal-report",
      sourceKind: "report",
      kindLabel: "Report",
      contextLabel: "Formal report / official source",
      teacherProximity: 58,
      communicationProximity: 42,
      trustBaseline: 84,
      notes: ["Formal reports can be credible, but they often need clearer transformability before they become usable communication signals."],
      subreddit: null,
    };
  }

  if (ingestionSource.includes("policy") || sourcePublisher.includes("google news") || sourceType === "article") {
    const policyLike = ingestionSource.includes("policy") || sourcePublisher.includes("google news") || sourceUrl.includes("news");
    if (policyLike) {
      return {
        id: "feed-policy-news",
        sourceKind: "feed",
        kindLabel: "Feed",
        contextLabel: "News / policy",
        teacherProximity: 48,
        communicationProximity: 34,
        trustBaseline: 64,
        notes: ["Policy/news can matter, but it usually needs stronger transformation into a teacher response situation."],
        subreddit: null,
      };
    }

    return {
      id: "feed-teacher-news",
      sourceKind: "feed",
      kindLabel: "Feed",
      contextLabel: "Teacher news",
      teacherProximity: 62,
      communicationProximity: 46,
      trustBaseline: 62,
      notes: ["Teacher-focused feeds can surface useful patterns, though they are often less emotionally situated than discussion sources."],
      subreddit: null,
    };
  }

  return {
    id: "generic-external",
    sourceKind: "other",
    kindLabel: "External",
    contextLabel: "General external source",
    teacherProximity: 45,
    communicationProximity: 32,
    trustBaseline: 52,
    notes: ["General external sources need clear teacher and communication relevance before they should move forward."],
    subreddit: null,
  };
}
