// Every Groq call (classification fallback, RAG answers, question rewriting)
// goes through here: Groq's free tier allows 8,000 tokens a minute per API
// key, shared by all users and all features.

const TOKENS_PER_MINUTE = 7000; // a margin below 8,000
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

// Thrown when Groq's daily request or token limit is used up.
export class DailyLimitError extends Error {}

const statusOf = (err) => err.status ?? err.response?.status;
const isDailyLimit = (err) => statusOf(err) === 429 && /per day|RPD|TPD/i.test(err.message);
const retryAfterMs = (err) => {
  const header = err.headers?.get?.("retry-after") ?? err.headers?.["retry-after"];
  return (Number(header) || 20) * 1000;
};

// About four characters per token, plus room for the reasoning and the reply.
export const estimateTokens = (...texts) => Math.ceil(texts.join("").length / 4) + 500;

// call(attempt) makes one request and returns { value, tokens }. Calls run
// one at a time, wait for room in the minute's budget, wait as long as Groq
// asks after a 429, and retry other failures (such as a reply that did not
// match the schema) up to four times.
async function run(estimate, call) {
  for (let attempt = 1; ; attempt += 1) {
    await waitForRoom(estimate);
    try {
      const { value, tokens } = await call(attempt);
      recentUsage.push({ at: Date.now(), tokens: tokens ?? estimate });
      return value;
    } catch (err) {
      // A rejected reply was still generated, so it still used tokens.
      if (statusOf(err) !== 429) recentUsage.push({ at: Date.now(), tokens: estimate });
      if (isDailyLimit(err)) throw new DailyLimitError(err.message);
      if (attempt >= MAX_ATTEMPTS) throw err;
      await sleep(statusOf(err) === 429 ? retryAfterMs(err) : 2000 * attempt);
    }
  }
}

let queue = Promise.resolve();

export function withGroqBudget(estimate, call) {
  const result = queue.then(() => run(estimate, call));
  queue = result.catch(() => {});
  return result;
}

// Groq's daily limits are per model and per account, so when one runs out
// the next takes over: every model on the first key, then on the second key
// (GROQ_API_KEY_2, optional). call({ model, apiKey }, attempt) makes one request.
export const GROQ_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];
const RESTING_MS = 60 * 60 * 1000;

// "model@key" → time until which it is known to be out for the day, so the
// next questions do not try it first.
const resting = new Map();

const groqKeys = () => [process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_2].filter(Boolean).map((key) => key.trim());

export async function withGroqModels(estimate, call, models = GROQ_MODELS) {
  const options = groqKeys().flatMap((apiKey, keyIndex) =>
    models.map((model) => ({ model, apiKey, id: `${model}@key${keyIndex + 1}` })),
  );
  const available = options.filter((option) => !(resting.get(option.id) > Date.now()));
  if (available.length === 0) throw new DailyLimitError("Every Groq model and key has used up its day");

  for (const [i, option] of available.entries()) {
    try {
      return await withGroqBudget(estimate, (attempt) => call(option, attempt));
    } catch (err) {
      if (!(err instanceof DailyLimitError)) throw err;
      resting.set(option.id, Date.now() + RESTING_MS);
      if (i === available.length - 1) throw err;
      console.error(`${option.id} reached its daily limit; using ${available[i + 1].id}`);
    }
  }
}
