// The classifier adapter: gpt-oss-20b on Groq, asked to answer in the shape a
// decision model returns. Replacing it with Jev or a fine-tuned Laya means a
// new version of this file; everything else uses classifyState().
import { ChatGroq } from "@langchain/groq";
import { z } from "zod";
import { CATEGORIES, DATE_KINDS, normalizeAnswers, QUESTIONS, SYSTEM_PROMPT, URGENCY_LEVELS } from "./classify.js";
import { estimateTokens, withGroqModels } from "./groqLimiter.js";

export const SOURCE = "gpt-oss-20b";

const probabilities = (options) => z.object(Object.fromEntries(options.map((option) => [option, z.number()])));

const answerSchema = z.object({
  security: z.object({ p: z.number() }),
  category: z.object({ probs: probabilities(CATEGORIES) }),
  needs_action: z.object({ p: z.number() }),
  urgency: z.object({ probs: probabilities(URGENCY_LEVELS) }),
  date_kind: z.object({ probs: probabilities(DATE_KINDS) }),
});

// Temperature 0 for the first try. A retry of the same request at 0 mostly
// repeats the same mistake (seen live: a list instead of an object), so
// retries add a little randomness.
const FIRST_TEMPERATURE = 0;
const RETRY_TEMPERATURE = 0.3;

// Created on first use, after dotenv has loaded GROQ_API_KEY.
const models = new Map();
const getModel = ({ model: name, apiKey }, temperature) => {
  const key = `${name}@${apiKey}@${temperature}`;
  if (!models.has(key)) {
    const model = new ChatGroq({ model: name, apiKey, temperature, reasoningEffort: "low", maxRetries: 0 });
    // jsonSchema: Groq rejects any reply that does not match the schema.
    models.set(key, model.withStructuredOutput(answerSchema, { method: "jsonSchema", includeRaw: true }));
  }
  return models.get(key);
};

export { DailyLimitError } from "./groqLimiter.js";

export function classifyState(state) {
  const input = JSON.stringify({ state, questions: QUESTIONS });
  return withGroqModels(estimateTokens(SYSTEM_PROMPT, input), async (option, attempt) => {
    const temperature = attempt === 1 ? FIRST_TEMPERATURE : RETRY_TEMPERATURE;
    const { parsed, raw } = await getModel(option, temperature).invoke([
      ["system", SYSTEM_PROMPT],
      ["human", input],
    ]);
    return { value: normalizeAnswers(parsed), tokens: raw.usage_metadata?.total_tokens };
  });
}
