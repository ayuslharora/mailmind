// "Ask your inbox": rewrite a follow-up into a standalone question, find the
// relevant chunks, and answer only from them, with citations checked in code.
import { ChatGroq } from "@langchain/groq";
import { z } from "zod";
import Message from "../models/message.model.js";
import { estimateTokens, withGroqModels } from "./groqLimiter.js";
import { listMatching, retrieve } from "./retrieve.js";
import { senderMatches } from "./senders.js";
import { senderAddress } from "./today.js";

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

// One call both rewrites a follow-up and pulls out the filters.
const understandSchema = z.object({
  question: z.string(),
  sender: z.string().nullable(),
  after: z.string().nullable(),
  before: z.string().nullable(),
  listAll: z.boolean(),
});

const understandPrompt = (today) => `You prepare a question about the user's email for search. Today is ${today} (India).
question: the user's last question, rewritten so it can be understood without the conversation. Words like it, that, this, they, there or "the other one" are replaced with what they refer to. Keep names, dates and numbers. Example: after a conversation about a failed Google One payment, "when did that happen?" becomes "When did my Google One payment fail?"
sender: the person, company or newsletter the emails are from, in the user's words (e.g. "Kaggle", "ayush arora"), or null if no sender is named.
after, before: a date range as YYYY-MM-DD if the question names one ("last week", "in September"), else null.
listAll: true if the user wants every matching email (all, every, list, summarize, how many), not a single fact.`;

// Created on first use, after dotenv has loaded GROQ_API_KEY.
const models = new Map();
const getModel = ({ model: name, apiKey }, schema, reasoningEffort) => {
  const key = `${name}@${apiKey}:${reasoningEffort}:${Object.keys(schema.shape).join(",")}`;
  if (!models.has(key)) {
    const model = new ChatGroq({ model: name, apiKey, temperature: 0, reasoningEffort, maxRetries: 0 });
    models.set(key, model.withStructuredOutput(schema, { method: "jsonSchema", includeRaw: true }));
  }
  return models.get(key);
};

// One model call through the shared Groq budget, falling back to the next
// model when one has used up its day.
function ask(schema, reasoningEffort, messages) {
  return withGroqModels(estimateTokens(...messages.map(([, text]) => text)), async (option) => {
    const { parsed, raw } = await getModel(option, schema, reasoningEffort).invoke(messages);
    return { value: parsed, tokens: raw.usage_metadata?.total_tokens };
  });
}

export const formatSources = (chunks) => chunks.map((chunk, i) => `[${i + 1}] ${chunk.text}`).join("\n\n");

// Only numbers of sources that were actually given count, each once.
export function validCitations(numbers, sourceCount) {
  return [...new Set(numbers)].filter((n) => Number.isInteger(n) && n >= 1 && n <= sourceCount);
}

async function understandQuestion(question, history) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const conversation = history
    .slice(-HISTORY_TURNS)
    .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.text}`)
    .join("\n");
  const understood = await ask(understandSchema, "low", [
    ["system", understandPrompt(today)],
    ["human", `${conversation ? `Conversation:\n${conversation}\n\n` : ""}Last question: ${question}`],
  ]);
  return { ...understood, question: understood.question.trim() || question };
}

// The senders in this user's mailbox that the typed words mean.
async function sendersMatching(userId, typed) {
  const froms = await Message.distinct("from", { userId });
  return [...new Set(froms.filter((from) => senderMatches(typed, from)).map((from) => senderAddress(from)))];
}

const isDay = (text) => /^\d{4}-\d{2}-\d{2}$/.test(text ?? "");

const gmailMessageLink = (email, gmailId) =>
  `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${gmailId}`;

// user: the logged-in user (its _id must be an ObjectId); history: earlier
// turns [{ role: "user" | "assistant", text }].
export async function answerQuestion(user, question, history = []) {
  const understood = await understandQuestion(question, history);
  const standalone = understood.question;
  const notFound = (answer = NOT_FOUND) => ({ found: false, answer, citations: [], question: standalone });

  const filters = {};
  if (understood.sender) {
    const senders = await sendersMatching(user._id, understood.sender);
    if (senders.length === 0) return notFound(`I couldn't find any emails from "${understood.sender}" in your inbox.`);
    filters.senders = senders;
  }
  if (isDay(understood.after)) filters.after = new Date(`${understood.after}T00:00:00+05:30`);
  if (isDay(understood.before)) filters.before = new Date(`${understood.before}T23:59:59+05:30`);

  // "All emails from X" lists them; otherwise the most relevant chunks.
  const listing = understood.listAll && Object.keys(filters).length > 0;
  const chunks = listing ? await listMatching(user._id, filters) : await retrieve(user._id, standalone, { filters });
  if (chunks.length === 0) return notFound();

  const note = listing ? "The sources are all the matching emails, newest first (up to 15).\n" : "";
  const reply = await ask(answerSchema, "medium", [
    ["system", SYSTEM_PROMPT],
    ["human", `${note}Sources:\n${formatSources(chunks)}\n\nQuestion: ${standalone}`],
  ]);

  const cited = validCitations(reply.sources, chunks.length).map((n) => chunks[n - 1]);
  if (!reply.found || cited.length === 0) return notFound();

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
