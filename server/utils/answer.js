// "Ask your inbox": rewrite a follow-up into a standalone question, find the
// relevant chunks, and answer only from them, with citations checked in code.
import { ChatGroq } from "@langchain/groq";
import { z } from "zod";
import Message from "../models/message.model.js";
import { estimateTokens, withGroqBudget } from "./groqLimiter.js";
import { retrieve } from "./retrieve.js";

export const NOT_FOUND = "I couldn't find this in your inbox.";
const HISTORY_TURNS = 6;

const SYSTEM_PROMPT = `You answer questions about the user's own email, using only the numbered sources given.
Secrets were replaced before you saw the text: [OTP], [CARD], [AADHAAR], [PAN], [ACCOUNT], [PIN], [PASSWORD], [PHONE], [IP], and [LINK:domain] for a removed link. Never guess what they hid; say the value is hidden and the user can open the email.
Answer only from a source that is about the thing the question asks. If no source answers it, set found to false: a wrong answer is worse than none.
List the numbers of the sources you used. Answer briefly, in plain language. Dates are in India time.`;

const answerSchema = z.object({
  found: z.boolean(),
  answer: z.string(),
  sources: z.array(z.number()),
});
const rewriteSchema = z.object({ question: z.string() });

const REWRITE_PROMPT = `Rewrite the user's last question so it can be understood without the conversation.
Words like it, that, this, they, there or "the other one" must be replaced with what they refer to in the conversation.
Keep names, dates and numbers. If the question already stands alone, return it unchanged.
Example: after a conversation about a failed Google One payment, "when did that happen?" becomes "When did my Google One payment fail?"`;

// Created on first use, after dotenv has loaded GROQ_API_KEY.
let models;
const getModels = () =>
  (models ??= {
    answer: new ChatGroq({ model: "openai/gpt-oss-20b", temperature: 0, reasoningEffort: "medium", maxRetries: 0 })
      .withStructuredOutput(answerSchema, { method: "jsonSchema", includeRaw: true }),
    rewrite: new ChatGroq({ model: "openai/gpt-oss-20b", temperature: 0, reasoningEffort: "low", maxRetries: 0 })
      .withStructuredOutput(rewriteSchema, { method: "jsonSchema", includeRaw: true }),
  });

// One model call through the shared Groq budget.
function ask(model, messages) {
  return withGroqBudget(estimateTokens(...messages.map(([, text]) => text)), async () => {
    const { parsed, raw } = await model.invoke(messages);
    return { value: parsed, tokens: raw.usage_metadata?.total_tokens };
  });
}

export const formatSources = (chunks) => chunks.map((chunk, i) => `[${i + 1}] ${chunk.text}`).join("\n\n");

// Only numbers of sources that were actually given count, each once.
export function validCitations(numbers, sourceCount) {
  return [...new Set(numbers)].filter((n) => Number.isInteger(n) && n >= 1 && n <= sourceCount);
}

// "And the other one?" → "When is the Enveda Kaggle competition deadline?"
async function standaloneQuestion(question, history) {
  if (history.length === 0) return question;
  const conversation = history
    .slice(-HISTORY_TURNS)
    .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.text}`)
    .join("\n");
  const { question: rewritten } = await ask(getModels().rewrite, [
    ["system", REWRITE_PROMPT],
    ["human", `Conversation:\n${conversation}\n\nLast question: ${question}`],
  ]);
  return rewritten.trim() || question;
}

const gmailMessageLink = (email, gmailId) =>
  `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${gmailId}`;

// user: the logged-in user (its _id must be an ObjectId); history: earlier
// turns [{ role: "user" | "assistant", text }].
export async function answerQuestion(user, question, history = []) {
  const standalone = await standaloneQuestion(question, history);
  const chunks = await retrieve(user._id, standalone);
  if (chunks.length === 0) return { found: false, answer: NOT_FOUND, citations: [], question: standalone };

  const reply = await ask(getModels().answer, [
    ["system", SYSTEM_PROMPT],
    ["human", `Sources:\n${formatSources(chunks)}\n\nQuestion: ${standalone}`],
  ]);

  const cited = validCitations(reply.sources, chunks.length).map((n) => chunks[n - 1]);
  if (!reply.found || cited.length === 0) return { found: false, answer: NOT_FOUND, citations: [], question: standalone };

  // One card per email, in the order the answer cited them.
  const gmailIds = [...new Set(cited.map((chunk) => chunk.gmailId))];
  const messages = await Message.find({ userId: user._id, gmailId: { $in: gmailIds } });
  const byId = new Map(messages.map((m) => [m.gmailId, m]));
  const citations = gmailIds
    .filter((id) => byId.has(id))
    .map((id) => {
      const m = byId.get(id);
      return {
        gmailId: id,
        subject: m.subject,
        from: m.fromMe ? "You" : m.from.replace(/<[^>]*>/, "").replace(/"/g, "").trim(),
        date: m.date,
        gmailUrl: gmailMessageLink(user.email, id),
      };
    });

  return { found: true, answer: reply.answer, citations, question: standalone };
}
