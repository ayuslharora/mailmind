import { z } from "zod";
import Message from "../models/message.model.js";
import SenderRule from "../models/senderRule.model.js";
import Thread from "../models/thread.model.js";
import { buildState, CATEGORIES } from "../utils/classify.js";
import { CONTEXT_MESSAGES } from "../utils/classifyThreads.js";
import { senderAddress } from "../utils/today.js";

// One request does one thing: done/reopen, snooze, change the category
// (optionally for every email from the sender), or say whether it needs action.
const updateSchema = z
  .object({
    state: z.enum(["open", "done"]).optional(),
    snoozeUntil: z.coerce.date().optional(),
    category: z.enum(CATEGORIES).optional(),
    applyToSender: z.boolean().optional(),
    needsAction: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Nothing to change");

export const updateThread = async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }
  const { state, snoozeUntil, category, applyToSender, needsAction } = parsed.data;

  // Scoped to the logged-in user: nobody can change another user's thread.
  const thread = await Thread.findOne({ userId: req.user._id, threadId: req.params.threadId });
  if (!thread) {
    return res.status(404).json({ message: "Thread not found" });
  }

  if (state) {
    thread.state = state;
    thread.snoozeUntil = undefined;
  }

  if (snoozeUntil) {
    if (snoozeUntil <= new Date()) {
      return res.status(400).json({ message: "Snooze until a time in the future" });
    }
    thread.state = "snoozed";
    thread.snoozeUntil = snoozeUntil;
  }

  if (category || needsAction !== undefined) {
    thread.userLabel = {
      category: category ?? thread.userLabel?.category,
      needsAction: needsAction ?? thread.userLabel?.needsAction,
      labelledAt: new Date(),
    };
  }

  if (category && applyToSender) {
    const latest = await Message.findOne({ userId: req.user._id, gmailId: thread.latestMessageId });
    const sender = senderAddress(latest?.from);
    if (sender) {
      await SenderRule.updateOne({ userId: req.user._id, sender }, { $set: { category } }, { upsert: true });
    }
  }

  await thread.save();
  return res.status(200).json({ message: "Updated" });
};

// "What the AI saw": the exact context the classifier received, its answer,
// and the stored (redacted) copy of every message in the conversation.
export const getThread = async (req, res) => {
  const userId = req.user._id;
  const thread = await Thread.findOne({ userId, threadId: req.params.threadId });
  if (!thread) {
    return res.status(404).json({ message: "Thread not found" });
  }

  const messages = await Message.find({ userId, threadId: thread.threadId }).sort({ date: -1 });
  const c = thread.classification ?? {};
  // Rebuilt from the same messages the classifier used (the latest three),
  // as of when it classified, so the date facts match what it was given.
  const sentToClassifier =
    messages.length > 0 ? buildState(messages.slice(0, CONTEXT_MESSAGES), c.classifiedAt ?? new Date()) : null;

  return res.status(200).json({
    threadId: thread.threadId,
    status: thread.status,
    sentToClassifier,
    answer: c.source
      ? {
          source: c.source,
          category: c.category,
          categoryProbs: Object.fromEntries(c.categoryProbs ?? []),
          securityP: c.securityP,
          needsActionP: c.needsActionP,
          urgency: c.urgency,
          dateKind: c.dateKind,
          dateKindP: c.dateKindP,
          promoCap: c.promoCap,
          classifiedAt: c.classifiedAt,
        }
      : null,
    userLabel: thread.userLabel?.labelledAt ? thread.userLabel : null,
    messages: messages.map((m) => ({
      gmailId: m.gmailId,
      from: m.fromMe ? "You" : m.from.replace(/<[^>]*>/, "").replace(/"/g, "").trim(),
      date: m.date,
      subject: m.subject,
      body: m.body,
      strict: m.strict,
      hidden: Object.fromEntries(m.hidden ?? []),
      gmailUrl: `https://mail.google.com/mail/?authuser=${encodeURIComponent(req.user.email)}#all/${m.gmailId}`,
    })),
  });
};
