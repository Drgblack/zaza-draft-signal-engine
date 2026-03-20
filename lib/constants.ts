import type { SignalCategory, SignalStatus } from "@/types/signal";

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/signals", label: "Signals" },
  { href: "/patterns", label: "Patterns" },
  { href: "/playbook", label: "Playbook" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/plan", label: "Plan" },
  { href: "/recap", label: "Recap" },
  { href: "/insights", label: "Insights" },
  { href: "/settings", label: "Settings" },
  { href: "/ingestion", label: "Ingestion" },
  { href: "/signals/new", label: "New Signal" },
  { href: "/review", label: "Review" },
] as const;

export const SOURCE_TYPE_OPTIONS = [
  "Article",
  "Social Post",
  "Podcast",
  "Community Thread",
  "Support Ticket",
  "Customer Call",
  "Internal Note",
  "Other",
] as const;

export const STATUS_DISPLAY_ORDER: SignalStatus[] = [
  "New",
  "Interpreted",
  "Draft Generated",
  "Reviewed",
  "Approved",
  "Scheduled",
  "Posted",
  "Archived",
  "Rejected",
];

export const CATEGORY_TONES: Record<SignalCategory, string> = {
  Risk: "bg-rose-50 text-rose-700 ring-rose-200",
  Stress: "bg-amber-50 text-amber-700 ring-amber-200",
  Conflict: "bg-orange-50 text-orange-700 ring-orange-200",
  Confusion: "bg-slate-100 text-slate-700 ring-slate-200",
  Success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export const STATUS_TONES: Record<SignalStatus, string> = {
  New: "bg-slate-100 text-slate-700 ring-slate-200",
  Interpreted: "bg-sky-50 text-sky-700 ring-sky-200",
  "Draft Generated": "bg-indigo-50 text-indigo-700 ring-indigo-200",
  Reviewed: "bg-violet-50 text-violet-700 ring-violet-200",
  Approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Scheduled: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  Posted: "bg-green-50 text-green-700 ring-green-200",
  Archived: "bg-stone-100 text-stone-700 ring-stone-200",
  Rejected: "bg-rose-50 text-rose-700 ring-rose-200",
};

export const SEVERITY_TONES: Record<1 | 2 | 3, string> = {
  1: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  2: "bg-amber-50 text-amber-700 ring-amber-200",
  3: "bg-rose-50 text-rose-700 ring-rose-200",
};
