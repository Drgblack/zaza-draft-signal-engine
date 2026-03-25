import assert from "node:assert/strict";
import test from "node:test";

import { filterFieldsToSupportedAirtableSchema } from "../lib/airtable";

test("filterFieldsToSupportedAirtableSchema removes unsupported context fields from interpretation saves", () => {
  const fields = {
    Status: "Interpreted",
    "Signal Category": "Stress",
    "Campaign ID": "campaign_teacher-protection",
    "Pillar ID": "pillar_teacher-protection",
    "Audience Segment ID": "audience-teachers",
    "Funnel Stage": "Awareness",
    "CTA Goal": "Awareness",
  };

  const filtered = filterFieldsToSupportedAirtableSchema(fields, [
    "Status",
    "Signal Category",
  ]);

  assert.deepEqual(filtered.fields, {
    Status: "Interpreted",
    "Signal Category": "Stress",
  });
  assert.deepEqual(filtered.omittedFields, [
    "Campaign ID",
    "Pillar ID",
    "Audience Segment ID",
    "Funnel Stage",
    "CTA Goal",
  ]);
});
