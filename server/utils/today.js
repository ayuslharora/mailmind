// Which section of the Today view a thread belongs to. Worked out on every
// request, so urgency rises as a deadline gets closer and fades as an email
// gets older, without classifying again.
import { urgency } from "@mailmind/core";
import { NEEDS_ACTION_P, SECURITY_P } from "./classify.js";

export const URGENT = 3;
const COMING_UP_MS = 7 * 24 * 60 * 60 * 1000;

// classification: the stored result; receivedAt: when the latest message came.
export function signals({ classification: c, dueAt = null, receivedAt = null }, now = new Date()) {
  // A new-login or security alert deserves a look the day it arrives, even
  // if it was you. OTP emails (source "rules") are excluded: a code is
  // useless minutes later.
  const securityAlert = c.securityP >= SECURITY_P && c.source !== "rules";
  const modelUrgency = securityAlert ? Math.max(c.urgency, URGENT) : c.urgency;
  const live = urgency({ modelUrgency, dueAt, promoCap: c.promoCap, receivedAt }, now);
  return {
    urgency: Math.round(live.urgency * 10) / 10,
    missed: live.missed,
    // A promotion never needs action, even when Gmail's headers did not
    // confirm it.
    needsAction: c.needsActionP >= NEEDS_ACTION_P && !c.promoCap && c.category !== "promos",
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
