// Which section of the Today view a thread belongs to. Worked out on every
// request, so urgency rises as a deadline gets closer and fades as an email
// gets older, without classifying again.
import { urgency } from "@mailmind/core";
import { NEEDS_ACTION_P, SECURITY_P } from "./classify.js";

export const URGENT = 3;
const COMING_UP_MS = 7 * 24 * 60 * 60 * 1000;

// The sender's email address, lowercased: "Prof <p@x.edu>" → "p@x.edu".
export const senderAddress = (from = "") => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();

// classification: the stored result; receivedAt: when the latest message came;
// label: the user's own correction; senderCategory: from a sender rule. The
// user's choices win over the model.
export function signals(
  { classification: c, dueAt = null, receivedAt = null, label = null, senderCategory = null },
  now = new Date(),
) {
  const category = label?.category ?? senderCategory ?? c.category;
  // A new-login or security alert deserves a look the day it arrives, even
  // if it was you. OTP emails (source "rules") are excluded: a code is
  // useless minutes later.
  const securityAlert = c.securityP >= SECURITY_P && c.source !== "rules";
  const modelUrgency = securityAlert ? Math.max(c.urgency, URGENT) : c.urgency;
  const live = urgency({ modelUrgency, dueAt, promoCap: c.promoCap, receivedAt }, now);
  return {
    urgency: Math.round(live.urgency * 10) / 10,
    missed: live.missed,
    category,
    // A promotion never needs action, even when Gmail's headers did not
    // confirm it.
    needsAction: label?.needsAction ?? (c.needsActionP >= NEEDS_ACTION_P && !c.promoCap && category !== "promos"),
  };
}

// item: { urgency, missed, needsAction, dateKind, category, dueAt }.
// Every thread goes in exactly one section.
export function sectionOf(item, now = new Date()) {
  if (item.missed) {
    // A past event, a promotion or a date that was only information goes to
    // the summary.
    if (item.dateKind !== "deadline" || !item.needsAction) return "rest";
    // An overdue bill can still be paid; other passed deadlines cannot be met.
    return item.category === "finance" ? "needsAction" : "missed";
  }
  if (item.urgency >= URGENT) return "urgent";
  if (item.needsAction) return "needsAction";
  if (item.dueAt && item.dueAt - now <= COMING_UP_MS) return "comingUp";
  return "rest";
}
