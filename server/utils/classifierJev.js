// The classifier adapter for Jev (TypeSafe's decision model) through
// OpenRouter. Same contract as utils/classifier.js: classifyState(state)
// returns what normalizeAnswers() returns. Used in the evaluation.
import { normalizeAnswers, QUESTIONS, URGENCY_LEVELS } from "./classify.js";

export const SOURCE = "jev-1.13";

const URL = "https://openrouter.ai/api/alpha/decisions";
const MAX_ATTEMPTS = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Jev calls yes/no questions "noul", and a score takes its levels as a list.
const JEV_QUESTIONS = Object.fromEntries(
  Object.entries(QUESTIONS).map(([name, question]) => {
    if (question.type === "boolean") return [name, { ...question, type: "noul" }];
    if (question.type === "score") return [name, { ...question, criteria: Object.values(question.criteria) }];
    return [name, question];
  }),
);

// Jev's answers in the shape normalizeAnswers() reads.
function toRaw(answers) {
  const levels = answers.urgency.probabilities;
  return {
    security: { p: answers.security.noul },
    category: { probs: answers.category.probabilities },
    needs_action: { p: answers.needs_action.noul },
    urgency: { probs: Object.fromEntries(URGENCY_LEVELS.map((level, i) => [level, levels[String(i)]])) },
    date_kind: { probs: answers.date_kind.probabilities },
  };
}

export async function classifyState(state) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "typesafe/jev-1.13", state, questions: JEV_QUESTIONS }),
    });
    if (res.ok) return normalizeAnswers(toRaw((await res.json()).answers));
    // Out of credit or a bad request: retrying will not help.
    if (attempt >= MAX_ATTEMPTS || res.status === 402 || res.status === 400) {
      throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    await sleep(2000 * attempt);
  }
}
