// The classifier adapter: gpt-oss-20b on Groq, asked to answer in the shape a
// decision model returns. Replacing it with Jev or a fine-tuned Laya means a
// new version of this file; everything else uses classifyState().
import { ChatGroq } from "@langchain/groq";
import { z } from "zod";
import { CATEGORIES, DATE_KINDS, normalizeAnswers, QUESTIONS, SYSTEM_PROMPT, URGENCY_LEVELS } from "./classify.js";

export const SOURCE = "gpt-oss-20b";

const probabilities = (options) => z.object(Object.fromEntries(options.map((option) => [option, z.number()])));

const answerSchema = z.object({
  security: z.object({ p: z.number() }),
  category: z.object({ probs: probabilities(CATEGORIES) }),
  needs_action: z.object({ p: z.number() }),
  urgency: z.object({ probs: probabilities(URGENCY_LEVELS) }),
  date_kind: z.object({ probs: probabilities(DATE_KINDS) }),
});

// Created on first use, after dotenv has loaded GROQ_API_KEY.
let model;
const getModel = () =>
  (model ??= new ChatGroq({ model: "openai/gpt-oss-20b", temperature: 0, reasoningEffort: "low", maxRetries: 0 })
    // jsonSchema: Groq guarantees the reply matches the schema.
    .withStructuredOutput(answerSchema, { method: "jsonSchema", includeRaw: true }));

// Groq's free tier allows 8,000 tokens a minute; this keeps a margin.
const TOKENS_PER_MINUTE = 7000;
const MINUTE_MS = 60 * 1000;
const MAX_ATTEMPTS = 4;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Tokens used in the last minute: [{ at, tokens }].
const recentUsage = [];

async function waitForRoom(estimate) {
  for (;;) {
    while (recentUsage.length && recentUsage[0].at < Date.now() - MINUTE_MS) recentUsage.shift();
    const used = recentUsage.reduce((sum, u) => sum + u.tokens, 0);
    if (recentUsage.length === 0 || used + estimate <= TOKENS_PER_MINUTE) return;
    await sleep(recentUsage[0].at + MINUTE_MS - Date.now() + 50);
  }
}

// Thrown when Groq's daily request or token limit is used up: classification
// stops and the remaining threads wait, still marked pending.
export class DailyLimitError extends Error {}

const statusOf = (err) => err.status ?? err.response?.status;
const isDailyLimit = (err) => statusOf(err) === 429 && /per day|RPD|TPD/i.test(err.message);
const retryAfterMs = (err) => {
  const header = err.headers?.get?.("retry-after") ?? err.headers?.["retry-after"];
  return (Number(header) || 20) * 1000;
};

async function callModel(state) {
  const input = JSON.stringify({ state, questions: QUESTIONS });
  // About four characters per token, plus room for the reasoning and answer.
  const estimate = Math.ceil((SYSTEM_PROMPT.length + input.length) / 4) + 500;

  for (let attempt = 1; ; attempt += 1) {
    await waitForRoom(estimate);
    try {
      const { parsed, raw } = await getModel().invoke([
        ["system", SYSTEM_PROMPT],
        ["human", input],
      ]);
      recentUsage.push({ at: Date.now(), tokens: raw.usage_metadata?.total_tokens ?? estimate });
      return normalizeAnswers(parsed);
    } catch (err) {
      if (isDailyLimit(err)) throw new DailyLimitError(err.message);
      if (attempt >= MAX_ATTEMPTS) throw err;
      await sleep(statusOf(err) === 429 ? retryAfterMs(err) : 2000 * attempt);
    }
  }
}

// One call at a time for the whole server: the limit is per API key, not per user.
let queue = Promise.resolve();

export function classifyState(state) {
  const run = queue.then(() => callModel(state));
  queue = run.catch(() => {});
  return run;
}
