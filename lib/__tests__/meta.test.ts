// Unit tests for the pure insight helpers that encode the money rules:
// purchase counting (kill rule) and ROAS math. Run with:
//   node --experimental-strip-types --test lib/__tests__/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { purchaseCount, purchaseValue, spendOf, roasOf, type InsightRow } from "../meta.ts";

test("purchaseCount prefers fb_pixel_purchase, then omni_purchase, then purchase", () => {
  assert.equal(
    purchaseCount({ actions: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "7" }] }),
    7
  );
  assert.equal(purchaseCount({ actions: [{ action_type: "omni_purchase", value: "3" }] }), 3);
  assert.equal(purchaseCount({ actions: [{ action_type: "purchase", value: "2" }] }), 2);
  assert.equal(purchaseCount({ actions: [{ action_type: "link_click", value: "99" }] }), 0);
  assert.equal(purchaseCount(null), 0);
  assert.equal(purchaseCount({}), 0);
});

test("purchaseValue reads revenue from action_values", () => {
  assert.equal(
    purchaseValue({ action_values: [{ action_type: "purchase", value: "250.5" }] }),
    250.5
  );
  assert.equal(purchaseValue(null), 0);
});

test("spendOf parses spend defensively", () => {
  assert.equal(spendOf({ spend: "201.4" }), 201.4);
  assert.equal(spendOf({}), 0);
  assert.equal(spendOf(null), 0);
});

test("roasOf prefers purchase_roas, falls back to value/spend, null without spend", () => {
  assert.equal(roasOf({ purchase_roas: [{ value: "4.2" }] }), 4.2);
  const fallback: InsightRow = { spend: "100", action_values: [{ action_type: "purchase", value: "350" }] };
  assert.equal(roasOf(fallback), 3.5);
  assert.equal(roasOf({ action_values: [{ action_type: "purchase", value: "350" }] }), null);
  assert.equal(roasOf(null), null);
});

test("kill-rule shape: zero purchases + spend over threshold is detectable", () => {
  // Mirrors lib/learn.ts classify(): 0 purchases lifetime + spend > 200.
  const row: InsightRow = { spend: "240", actions: [{ action_type: "link_click", value: "12" }] };
  assert.equal(purchaseCount(row), 0);
  assert.ok(spendOf(row) > 200);
});
