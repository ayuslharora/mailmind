import { test } from "node:test";
import assert from "node:assert/strict";
import { senderMatches } from "../utils/senders.js";

const blog = "Ayush Arora <newsletter@blog.ayuslh.in>";

test("a sender is found by name, part of a name, or domain", () => {
  assert.equal(senderMatches("Ayush Arora", blog), true);
  assert.equal(senderMatches("ayus arora", blog), true, "the user's own typo");
  assert.equal(senderMatches("ayuslh blog", blog), true);
  assert.equal(senderMatches("Kaggle", "Kaggle <noreply@kaggle.com>"), true);
  assert.equal(senderMatches("arrora", blog), true, "one typo in a longer word");
});

test("other senders do not match", () => {
  assert.equal(senderMatches("Ayush Arora", "Kaggle <noreply@kaggle.com>"), false);
  assert.equal(senderMatches("ayush sharma", blog), false, "every word must match");
  assert.equal(senderMatches("", blog), false);
  assert.equal(senderMatches("ab", blog), false, "words under three letters are ignored");
});
