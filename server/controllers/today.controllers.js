import Message from "../models/message.model.js";
import Thread from "../models/thread.model.js";
import { sectionOf, signals } from "../utils/today.js";

const FIRST_LINE_CHARS = 140;

const senderName = (from = "") => from.replace(/<[^>]*>/, "").replace(/"/g, "").trim() || from;
const firstLine = (body = "") => (body.split("\n").find((line) => line.trim()) ?? "").trim().slice(0, FIRST_LINE_CHARS);

// Opens the thread in the right Gmail account, even when several are signed in.
const gmailLink = (email, threadId) =>
  `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${threadId}`;

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
    const live = signals({ classification: c, dueAt: thread.dueAt, receivedAt: message.date }, now);

    const item = {
      threadId: thread.threadId,
      subject: message.subject,
      firstLine: firstLine(message.body),
      from: senderName(message.from),
      fromMe: message.fromMe,
      date: message.date,
      category: c.category,
      ...live,
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
