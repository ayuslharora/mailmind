import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSources, validCitations } from "../utils/answer.js";

test("sources are numbered from 1", () => {
  assert.equal(formatSources([{ text: "From: A | Subject: x" }, { text: "From: B" }]), "[1] From: A | Subject: x\n\n[2] From: B");
});

test("only citations of sources that were given count, once each", () => {
  assert.deepEqual(validCitations([2, 2, 1, 7, 0, -1, 1.5], 3), [2, 1]);
  assert.deepEqual(validCitations([], 3), []);
});
