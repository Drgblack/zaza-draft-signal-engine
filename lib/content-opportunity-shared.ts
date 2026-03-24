export const CONTENT_OPPORTUNITY_STATUSES = [
  "open",
  "approved_for_production",
  "dismissed",
] as const;

export const CONTENT_OPPORTUNITY_SKIP_REASONS = [
  "not_relevant",
  "wrong_audience",
  "trust_risk_too_high",
  "timing_wrong",
  "duplicate_of_existing",
  "other",
] as const;

export type ContentOpportunityStatus =
  (typeof CONTENT_OPPORTUNITY_STATUSES)[number];

export type ContentOpportunitySkipReason =
  (typeof CONTENT_OPPORTUNITY_SKIP_REASONS)[number];
