import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyState } from "../utils/classifierJev.js";

// A reply in the shape Jev returned on 7 October 2026.
const reply = {
  answers: {
    security: { type: "noul", noul: 0.01 },
    category: { type: "choice", choice: "academic", probabilities: { promos: 0, academic: 1, finance: 0, jobs: 0, personal: 0, notifications: 0 } },
    needs_action: { type: "noul", noul: 0.97 },
    urgency: { type: "score", score: 2.11, probabilities: { 0: 0, 1: 0.01, 2: 0.88, 3: 0.1, 4: 0.01 } },
    date_kind: { type: "choice", choice: "deadline", probabilities: { none: 0, event: 0, deadline: 1 } },
  },
};

test("Jev's answers come out in the same shape as the main classifier's", async () => {
  let sent;
  globalThis.fetch = async (url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => reply };
  };
  const answers = await classifyState({ subject: "x" });
  assert.equal(sent.questions.security.type, "noul", "yes/no questions are sent as noul");
  assert.ok(Array.isArray(sent.questions.urgency.criteria), "score levels are sent as a list");
  assert.equal(answers.category, "academic");
  assert.equal(answers.needsActionP, 0.97);
  assert.equal(answers.dateKind, "deadline");
  assert.equal(Math.round(answers.urgency * 100) / 100, 2.11);
});

test("no credit left fails at once instead of retrying", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: false, status: 402, text: async () => "insufficient credits" };
  };
  await assert.rejects(classifyState({}), /402/);
  assert.equal(calls, 1);
});
