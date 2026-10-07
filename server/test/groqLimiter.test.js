import { test } from "node:test";
import assert from "node:assert/strict";

process.env.GROQ_API_KEY = "key-one";
process.env.GROQ_API_KEY_2 = "key-two";
const { DailyLimitError, withGroqModels } = await import("../utils/groqLimiter.js");

// What Groq sends when a model's daily token limit is used up.
const dailyLimit = () => Object.assign(new Error("Rate limit reached on tokens per day (TPD)"), { status: 429 });

test("when a model's day is used up, the next model and then the next key take over", async () => {
  const tried = [];
  const value = await withGroqModels(100, async ({ model, apiKey }) => {
    tried.push(`${model}@${apiKey}`);
    if (apiKey === "key-one") throw dailyLimit();
    return { value: "answer", tokens: 10 };
  });
  assert.equal(value, "answer");
  assert.deepEqual(tried, ["openai/gpt-oss-20b@key-one", "openai/gpt-oss-120b@key-one", "openai/gpt-oss-20b@key-two"]);
});

test("a model known to be out is not tried again on the next question", async () => {
  const tried = [];
  await withGroqModels(100, async ({ model, apiKey }) => {
    tried.push(`${model}@${apiKey}`);
    return { value: "ok", tokens: 10 };
  });
  assert.deepEqual(tried, ["openai/gpt-oss-20b@key-two"]);
});

test("when everything is out, a DailyLimitError says so", async () => {
  await assert.rejects(
    withGroqModels(100, async () => {
      throw dailyLimit();
    }),
    DailyLimitError,
  );
});
