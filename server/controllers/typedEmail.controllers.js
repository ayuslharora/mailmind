import mongoose from "mongoose";
import { z } from "zod";
import { redactEmail } from "@mailmind/core";
import TypedEmail from "../models/typedEmail.model.js";
import { encrypt } from "../utils/crypto.js";
import { toStoredMessage } from "../utils/sync.js";

const typedSchema = z
  .object({
    subject: z.string().max(300).default(""),
    body: z.string().trim().min(1, "Write an email first").max(5000),
    strict: z.boolean().default(false),
  })
  .strict();

const missSchema = z.object({ note: z.string().trim().max(1000).default("") }).strict();

// Redacts an email the visitor typed, exactly as sync would store a Gmail
// email (toStoredMessage), and saves the original encrypted for review.
// No AI call.
export const redactTyped = async (req, res) => {
  const parsed = typedSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }
  const { subject, body, strict } = parsed.data;
  const now = new Date();
  const stored = toStoredMessage(
    null,
    { id: "", threadId: "", from: "", labelIds: [], date: now, subject, body, bulkSender: false },
    { strict },
  );
  // Where each secret was in the original, to mark it on the page. Only
  // types and positions, never the values.
  const { redactions } = redactEmail({ subject, body }, { strict });

  const saved = await TypedEmail.create({
    original: encrypt(JSON.stringify({ subject, body })),
    subject: stored.subject,
    body: stored.body,
    strict: stored.strict,
    hidden: stored.hidden,
  });

  return res.status(201).json({
    id: saved._id,
    subject: stored.subject,
    body: stored.body,
    strict: stored.strict,
    hidden: stored.hidden,
    redactions: redactions.filter((r) => r.type !== "LINK_TRIMMED"),
    deadlineAt: stored.deadlineAt ?? null,
    deadlineHasTime: stored.deadlineHasTime ?? null,
    eventAt: stored.eventAt ?? null,
    eventHasTime: stored.eventHasTime ?? null,
  });
};

// "It missed something": marks the email for review, with what was missed.
export const reportMiss = async (req, res) => {
  const parsed = missSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Email not found" });
  }
  const { note } = parsed.data;
  const result = await TypedEmail.updateOne(
    { _id: req.params.id },
    { $set: { reportedMiss: true, ...(note && { note: encrypt(note) }) } },
  );
  if (result.matchedCount === 0) {
    return res.status(404).json({ message: "Email not found" });
  }
  return res.status(200).json({ message: "Saved for review" });
};
