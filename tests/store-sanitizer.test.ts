import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import { sanitizeGroupedStore } from "../lib/store-sanitizer";

test("sanitizeGroupedStore keeps valid groups and drops invalid ones", () => {
  const eventSchema = z.object({
    id: z.string().min(1),
    summary: z.string().min(1),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  });

  const store = sanitizeGroupedStore(
    {
      valid: [
        {
          id: "event-1",
          summary: "Viewed digest.",
          metadata: {
            window: "all",
          },
        },
      ],
      invalid: [
        {
          id: "event-2",
          summary: "Viewed digest.",
          metadata: {
            nested: {
              unsupported: true,
            },
          },
        },
      ],
    },
    z.array(eventSchema),
    "audit",
  );

  assert.deepEqual(Object.keys(store), ["valid"]);
  assert.equal(store.valid?.length, 1);
  assert.equal(store.valid?.[0]?.id, "event-1");
});
