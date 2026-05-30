import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeHebrew, validateHebrew } from "../copy.ts";

test("sanitizeHebrew replaces em/en/sentence dashes with comma", () => {
  assert.equal(sanitizeHebrew("מבצע — היום"), "מבצע, היום");
  assert.equal(sanitizeHebrew("זהב – טהור"), "זהב, טהור");
  assert.equal(sanitizeHebrew("חדש - ומיוחד"), "חדש, ומיוחד");
});

test("validateHebrew flags specific dates and English-in-Hebrew", () => {
  assert.equal(validateHebrew("רק היום").hasSpecificDate, false);
  assert.equal(validateHebrew("עד 25/12").hasSpecificDate, true);
  assert.equal(validateHebrew("קולקציית Summer חדשה").hasEnglishInHebrew, true);
  assert.equal(validateHebrew("קולקציה חדשה").hasEnglishInHebrew, false);
});
