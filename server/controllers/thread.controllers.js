import { z } from "zod";
import Message from "../models/message.model.js";
import SenderRule from "../models/senderRule.model.js";
import Thread from "../models/thread.model.js";
import { CATEGORIES } from "../utils/classify.js";
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
