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

// A demo visitor's own change hides a thread they marked done, or snoozed
// until later.
const hiddenByVisitor = (own, now) => own?.state === "done" || (own?.state === "snoozed" && own.snoozeUntil > now);

// The visitor's correction wins over the stored one, field by field.
const labelWith = (label, own) =>
  own ? { category: own.category ?? label?.category, needsAction: own.needsAction ?? label?.needsAction } : label;

// The Today view for one user: every open, classified thread in one section.
// Threads that need nothing go in "other", newest first, so the latest email
// can always be found. changes: a demo visitor's own changes, kept in their
// browser and applied here without being saved:
// { threads: { [threadId]: { state, snoozeUntil, category, needsAction } },
//   senders: { [address]: category } }.
export async function buildToday(user, now = new Date(), changes = {}) {
  const userId = user._id;

  // Done threads are hidden; snoozed ones come back when the snooze ends.
  const threads = await Thread.find({
    userId,
    status: "classified",
    $or: [{ state: { $in: ["open", null] } }, { state: "snoozed", snoozeUntil: { $lte: now } }],
  }).sort({ lastMessageAt: -1 });
  const senderRules = new Map([
    ...(await SenderRule.find({ userId })).map((r) => [r.sender, r.category]),
    ...Object.entries(changes.senders ?? {}),
  ]);
  const latest = await Message.find({ userId, gmailId: { $in: threads.map((t) => t.latestMessageId) } });
  const messageById = new Map(latest.map((m) => [m.gmailId, m]));

  const sections = { urgent: [], needsAction: [], comingUp: [], missed: [], other: [] };

  for (const thread of threads) {
    const message = messageById.get(thread.latestMessageId);
    const own = changes.threads?.[thread.threadId];
    if (!message || hiddenByVisitor(own, now)) continue;
    const c = thread.classification;
    const sender = senderAddress(message.from);
    const live = signals(
      {
        classification: c,
        dueAt: thread.dueAt,
        receivedAt: message.date,
        label: labelWith(thread.userLabel, own),
        senderCategory: senderRules.get(sender),
      },
      now,
    );

    const item = {
      threadId: thread.threadId,
      subject: message.subject,
      firstLine: firstLine(message.body),
      from: senderName(message.from),
      // For "apply to everyone from this sender" in the demo, which is
      // saved in the visitor's browser.
      sender,
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
