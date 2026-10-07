// The daily digest: a short briefing written from the Today view's items,
// shown as a tab on the welcome screen. One model call a day, at most, unless
// the items change.
import { ChatGroq } from "@langchain/groq";
import { z } from "zod";
import User from "../models/user.model.js";
import { estimateTokens, withGroqModels } from "./groqLimiter.js";
import { buildToday } from "./todayView.js";

const SECTIONS = ["urgent", "needsAction", "comingUp", "missed"];
const SECTION_LABELS = { urgent: "Urgent", needsAction: "Needs action", comingUp: "Coming up", missed: "Missed" };
const MAX_ITEMS = 12;
const MAX_POINTS = 6;

const SYSTEM_PROMPT = `You write a short morning briefing of the user's email, from the items given.
Use only those items. Most urgent first, at most ${MAX_POINTS} points, one plain sentence each saying what to do and by when.
headline: one sentence overview, such as "Two things need you today, and your JioFiber bill is overdue." Only call something urgent if its section is Urgent.
Secrets were replaced with placeholders such as [OTP] or [LINK:domain]; never guess what they hid.
Each point gives the threadId of the item it is about.`;

const digestSchema = z.object({
  headline: z.string(),
  points: z.array(z.object({ threadId: z.string(), text: z.string() })),
});

// Created on first use, after dotenv has loaded GROQ_API_KEY.
const models = new Map();
const getModel = ({ model: name, apiKey }) => {
  const key = `${name}@${apiKey}`;
  if (!models.has(key)) {
    const model = new ChatGroq({ model: name, apiKey, temperature: 0, reasoningEffort: "low", maxRetries: 0 });
    models.set(key, model.withStructuredOutput(digestSchema, { method: "jsonSchema", includeRaw: true }));
  }
  return models.get(key);
};

const dayInIndia = (date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const dueText = (item) =>
  item.dueAt
    ? `${item.missed ? "was due" : item.dateKind === "event" ? "event on" : "due"} ${new Date(item.dueAt).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        day: "numeric",
        month: "short",
        ...(item.dueHasTime && { hour: "numeric", minute: "2-digit" }),
      })}`
    : "";

// The items worth a briefing, most urgent section first.
export function digestItems(today) {
  return SECTIONS.flatMap((section) => (today[section] ?? []).map((item) => ({ ...item, section }))).slice(0, MAX_ITEMS);
}

// Changes when the items change, so the cached briefing is made again.
export const digestKey = (items) => items.map((item) => `${item.section}:${item.threadId}`).join("|");

// Points about items that were not given are dropped, and each item once.
export function keepValidPoints(points, items) {
  const known = new Set(items.map((item) => item.threadId));
  const seen = new Set();
  return points
    .filter((point) => known.has(point.threadId) && !seen.has(point.threadId) && seen.add(point.threadId))
    .slice(0, MAX_POINTS);
}

const describe = (items) =>
  items
    .map((item) =>
      [
        `threadId: ${item.threadId}`,
        `section: ${SECTION_LABELS[item.section]}`,
        `from: ${item.from}`,
        `subject: ${item.subject}`,
        dueText(item) && `date: ${dueText(item)}`,
        item.firstLine && `first line: ${item.firstLine}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

async function writeBriefing(items) {
  const input = describe(items);
  return withGroqModels(estimateTokens(SYSTEM_PROMPT, input), async (option) => {
    const { parsed, raw } = await getModel(option).invoke([
      ["system", SYSTEM_PROMPT],
      ["human", `Items:\n${input}`],
    ]);
    return { value: parsed, tokens: raw.usage_metadata?.total_tokens };
  });
}

// Each point comes back with what the page needs to link to the email.
function withLinks(digest, items) {
  const byId = new Map(items.map((item) => [item.threadId, item]));
  return {
    day: digest.day,
    headline: digest.headline,
    generatedAt: digest.generatedAt,
    points: digest.points
      .filter((point) => byId.has(point.threadId))
      .map((point) => {
        const item = byId.get(point.threadId);
        // Named fields, not a spread: a cached point is a Mongoose sub-document.
        return {
          threadId: point.threadId,
          text: point.text,
          section: item.section,
          subject: item.subject,
          from: item.from,
          gmailUrl: item.gmailUrl,
        };
      }),
  };
}

export async function digestFor(user, now = new Date()) {
  const today = await buildToday(user, now);
  const items = digestItems(today);
  const day = dayInIndia(now);

  if (items.length === 0) {
    return { day, headline: "Nothing needs you today.", points: [], generatedAt: now, sorting: today.sorting };
  }

  const key = digestKey(items);
  const cached = user.digest;
  if (cached?.day === day && cached?.key === key) {
    return { ...withLinks(cached, items), sorting: today.sorting };
  }

  const written = await writeBriefing(items);
  const digest = { day, key, headline: written.headline, points: keepValidPoints(written.points, items), generatedAt: now };
  await User.updateOne({ _id: user._id }, { $set: { digest } });
  return { ...withLinks(digest, items), sorting: today.sorting };
}
