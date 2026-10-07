import { urgency } from "@mailmind/core";
import Message from "../models/message.model.js";
import Thread from "../models/thread.model.js";

const URGENT = 3;
const NEEDS_ACTION_P = 0.6;
const COMING_UP_MS = 7 * 24 * 60 * 60 * 1000;
const FIRST_LINE_CHARS = 140;

const senderName = (from = "") => from.replace(/<[^>]*>/, "").replace(/"/g, "").trim() || from;
const firstLine = (body = "") => (body.split("\n").find((line) => line.trim()) ?? "").trim().slice(0, FIRST_LINE_CHARS);

// Opens the thread in the right Gmail account, even when several are signed in.
const gmailLink = (email, threadId) =>
  `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${threadId}`;

// Every thread goes in exactly one section. Urgency is worked out now, so it
// rises as a deadline gets closer without classifying again.
function sectionOf(item, now) {
  if (item.missed) return "missed";
  if (item.urgency >= URGENT) return "urgent";
  if (item.needsAction) return "needsAction";
  if (item.dueAt && item.dueAt - now <= COMING_UP_MS) return "comingUp";
  return "rest";
}

export const getToday = async (req, res) => {
  const now = new Date();
  const userId = req.user._id;

  const threads = await Thread.find({ userId, status: "classified" }).sort({ lastMessageAt: -1 });
  const latest = await Message.find({ userId, gmailId: { $in: threads.map((t) => t.latestMessageId) } });
  const messageById = new Map(latest.map((m) => [m.gmailId, m]));

  const sections = { urgent: [], needsAction: [], comingUp: [], missed: [] };
  const rest = {};

  for (const thread of threads) {
    const message = messageById.get(thread.latestMessageId);
    if (!message) continue;
    const c = thread.classification;
    const live = urgency({ modelUrgency: c.urgency, dueAt: thread.dueAt, promoCap: c.promoCap }, now);

    const item = {
      threadId: thread.threadId,
      subject: message.subject,
      firstLine: firstLine(message.body),
      from: senderName(message.from),
      fromMe: message.fromMe,
      date: message.date,
      category: c.category,
      urgency: Math.round(live.urgency * 10) / 10,
      missed: live.missed,
      needsAction: c.needsActionP >= NEEDS_ACTION_P && !c.promoCap,
      dueAt: thread.dueAt ?? null,
      dueHasTime: thread.dueHasTime ?? null,
      dateKind: c.dateKind,
      gmailUrl: gmailLink(req.user.email, thread.threadId),
    };

    const section = sectionOf(item, now);
    if (section === "rest") rest[c.category] = (rest[c.category] ?? 0) + 1;
    else sections[section].push(item);
  }

  // Most urgent first; dated sections by date.
  sections.urgent.sort((a, b) => b.urgency - a.urgency);
  sections.comingUp.sort((a, b) => a.dueAt - b.dueAt);
  sections.missed.sort((a, b) => b.dueAt - a.dueAt);

  const sorting = await Thread.countDocuments({ userId, status: { $in: ["pending", "failed"] } });
  return res.status(200).json({ ...sections, rest, sorting });
};
