export const SCORING_VERSION = "rules-v1.1";

export const RELEVANCE_KEYWORDS = [
  "teacher",
  "teachers",
  "school",
  "schools",
  "classroom",
  "pupil",
  "pupils",
  "student",
  "students",
  "parent",
  "parents",
  "lesson",
  "marking",
  "workload",
  "burnout",
  "stress",
  "wellbeing",
  "well-being",
  "admin",
  "administrative",
  "complaint",
  "disciplinary",
  "tribunal",
  "ofsted",
  "safeguarding",
  "behaviour",
  "communication",
  "email",
  "emails",
  "policy",
];

export const BRAND_FIT_KEYWORDS = [
  "email",
  "communication",
  "parent",
  "complaint",
  "disciplinary",
  "reputation",
  "wording",
  "message",
  "messaging",
  "boundary",
  "burnout",
  "stress",
  "workload",
  "admin",
  "administrative",
  "teacher protection",
  "wellbeing",
  "well-being",
  "after-hours",
  "leadership",
  "document",
  "documentation",
  "incident",
  "report",
  "respond",
  "reply",
];

export const URGENCY_KEYWORDS = [
  "breaking",
  "urgent",
  "today",
  "this week",
  "tribunal",
  "disciplinary",
  "investigation",
  "complaint",
  "viral",
  "policy change",
  "deadline",
  "warning",
  "legal",
  "lawsuit",
];

export const COMMUNICATION_SIGNAL_KEYWORDS = [
  "email",
  "message",
  "respond",
  "reply",
  "wording",
  "document",
  "report",
  "complaint",
  "parent",
  "leadership",
  "incident",
  "behaviour",
  "follow up",
  "follow-up",
  "explain",
  "escalate",
  "de-escalate",
  "write",
];

export const ABSTRACT_COMMENTARY_PATTERNS = [
  "thought leadership",
  "future of education",
  "sector commentary",
  "thought piece",
  "opinion",
  "leadership perspective",
];

export const GENERIC_TITLE_PATTERNS = [
  "teachers are stressed",
  "teacher burnout is rising",
  "education crisis",
  "school challenges",
  "edtech trends",
  "future of education",
];

export const TRUSTED_PUBLISHER_KEYWORDS = [
  "government",
  "department for education",
  "bbc",
  "guardian",
  "schools week",
  "tes",
  "education week",
  "edutopia",
];

export const LOW_CONTEXT_SOURCE_TYPES = ["Community Thread", "Social Post"] as const;

export const SYSTEM_NOTE_SOURCE_TYPES = ["Support Ticket", "Internal Note", "Customer Call"] as const;

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function countKeywordMatches(text: string, keywords: string[]): number {
  const normalized = text.toLowerCase();
  return keywords.filter((keyword) => normalized.includes(keyword)).length;
}

export function normalizeTitleFingerprint(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|and|or|for|to|of|in|on|at|by|with)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenOverlapScore(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  return (intersection / Math.max(leftTokens.size, rightTokens.size)) * 100;
}
