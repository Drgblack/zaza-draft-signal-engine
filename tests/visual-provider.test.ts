import assert from "node:assert/strict";
import test from "node:test";

import {
  getVisualProvider,
  listVisualProviders,
} from "../lib/providers/visual-provider";

test("visual provider registry exposes runway and kling", () => {
  const providers = listVisualProviders().map((provider) => provider.id);

  assert.deepEqual(providers, ["runway-gen4", "kling-2"]);
});

test("visual provider resolver keeps backward compatibility for local-default", () => {
  assert.equal(getVisualProvider("local-default").id, "runway-gen4");
  assert.equal(getVisualProvider("kling-2").id, "kling-2");
  assert.equal(getVisualProvider("unknown-provider").id, "runway-gen4");
});
