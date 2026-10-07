import { test } from "node:test";
import assert from "node:assert/strict";

// Which adapter answers, and what gets recorded as the source. (The fallback
// to gpt-oss-20b calls Groq, so it is checked live, not here.)
const jevReply = {
  answers: {
    security: { noul: 0.01 },
    category: { probabilities: { promos: 0, academic: 1, finance: 0, jobs: 0, personal: 0, notifications: 0 } },
    needs_action: { noul: 0.9 },
    urgency: { probabilities: { 0: 0, 1: 0, 2: 1, 3: 0, 4: 0 } },
    date_kind: { probabilities: { none: 1, event: 0, deadline: 0 } },
  },
};

test("Jev answers when its key is set", async () => {
  process.env.OPENROUTER_API_KEY = "test";
  globalThis.fetch = async () => ({ ok: true, json: async () => jevReply });
  const { classifyWithBestModel } = await import("../utils/classifyThreads.js");
  const { source, answers } = await classifyWithBestModel({ subject: "x" });
  assert.equal(source, "jev-1.13");
  assert.equal(answers.category, "academic");
});
