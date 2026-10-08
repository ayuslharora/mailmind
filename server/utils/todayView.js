import Message from "../models/message.model.js";
import SenderRule from "../models/senderRule.model.js";
import Thread from "../models/thread.model.js";
import { sectionOf, senderAddress, signals } from "./today.js";

const FIRST_LINE_CHARS = 140;

const senderName = (from = "") => from.replace(/<[^>]*>/, "").replace(/"/g, "").trim() || from;
const firstLine = (body = "") => (body.split("\n").find((line) => line.trim()) ?? "").trim().slice(0, FIRST_LINE_CHARS);

// Opens the thread in the right Gmail account, even when several are signed in.
const gmailLink = (email, threadId) =>
  `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${threadId}`;

// Most urgent first. Old tasks all rest at the same urgency, so ties go to
// how urgent the classifier first judged them, then to the newest.
const byPriority = (a, b) => b.urgency - a.urgency || b.firstUrgency - a.firstUrgency || b.date - a.date;

// The Today view for one user: every open, classified thread in one section.
// Threads that need nothing go in "other", newest first, so the latest email
// can always be found.
export async function buildToday(user, now = new Date()) {
  const userId = user._id;

  // Done threads are hidden; snoozed ones come back when the snooze ends.
  const threads = await Thread.find({
    userId,
    status: "classified",
    $or: [{ state: { $in: ["open", null] } }, { state: "snoozed", snoozeUntil: { $lte: now } }],
  }).sort({ lastMessageAt: -1 });
  const senderRules = new Map((await SenderRule.find({ userId })).map((r) => [r.sender, r.category]));
  const latest = await Message.find({ userId, gmailId: { $in: threads.map((t) => t.latestMessageId) } });
  const messageById = new Map(latest.map((m) => [m.gmailId, m]));

  const sections = { urgent: [], needsAction: [], comingUp: [], missed: [], other: [] };

  for (const thread of threads) {
    const message = messageById.get(thread.latestMessageId);
    if (!message) continue;
    const c = thread.classification;
    const live = signals(
      {
        classification: c,
        dueAt: thread.dueAt,
        receivedAt: message.date,
        label: thread.userLabel,
        senderCategory: senderRules.get(senderAddress(message.from)),
      },
      now,
    );

    const item = {
      threadId: thread.threadId,
      subject: message.subject,
      firstLine: firstLine(message.body),
      from: senderName(message.from),
      fromMe: message.fromMe,
      date: message.date,
      ...live,
      firstUrgency: c.urgency,
      dueAt: thread.dueAt ?? null,
      dueHasTime: thread.dueHasTime ?? null,
      dateKind: c.dateKind,
      gmailUrl: gmailLink(user.email, thread.threadId),
    };

    const section = sectionOf(item, now);
    sections[section === "rest" ? "other" : section].push(item);
  }

  // Urgent and needs action by priority, dated sections by date; "other" keeps
  // the newest-first order of the query.
  sections.urgent.sort(byPriority);
  sections.needsAction.sort(byPriority);
  sections.comingUp.sort((a, b) => a.dueAt - b.dueAt);
  sections.missed.sort((a, b) => b.dueAt - a.dueAt);

  const sorting = await Thread.countDocuments({ userId, status: { $in: ["pending", "failed"] } });
  return { ...sections, sorting };
}
