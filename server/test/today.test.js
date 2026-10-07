import { test } from "node:test";
import assert from "node:assert/strict";
import { sectionOf, signals } from "../utils/today.js";

const now = new Date("2026-10-07T12:00:00+05:30");
const hoursAgo = (h) => new Date(now.getTime() - h * 60 * 60 * 1000);
const base = { category: "notifications", securityP: 0, needsActionP: 0, urgency: 0, promoCap: false, source: "jev-1.13" };
const place = (classification, extra = {}) => {
  const s = signals({ classification: { ...base, ...classification }, receivedAt: hoursAgo(2), ...extra }, now);
  return sectionOf({ ...s, dateKind: classification.dateKind ?? "none", category: classification.category ?? base.category, dueAt: extra.dueAt ?? null }, now);
};

// Labels from the author, 7 October 2026.
test("a new-login alert is urgent the day it arrives, then fades", () => {
  assert.equal(place({ securityP: 0.9, needsActionP: 0.7 }), "urgent");
  assert.equal(place({ securityP: 0.9, needsActionP: 0.7 }, { receivedAt: hoursAgo(30) }), "needsAction");
});

test("an OTP email (classified by the rules) is never urgent", () => {
  assert.equal(place({ securityP: 1, source: "rules" }), "rest");
});

test("an overdue bill stays under Needs action", () => {
  const bill = { category: "finance", needsActionP: 0.9, dateKind: "deadline" };
  assert.equal(place(bill, { dueAt: hoursAgo(48) }), "needsAction");
});

test("other passed deadlines that needed action are missed", () => {
  const application = { category: "jobs", needsActionP: 0.9, dateKind: "deadline" };
  assert.equal(place(application, { dueAt: hoursAgo(48) }), "missed");
});

test("past events, promotions and information go to the summary", () => {
  assert.equal(place({ needsActionP: 0.9, dateKind: "event" }, { dueAt: hoursAgo(48) }), "rest");
  assert.equal(place({ category: "promos", needsActionP: 0.95 }), "rest");
  assert.equal(place({ needsActionP: 0.2 }), "rest");
});

test("a deadline within a week is coming up", () => {
  const due = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
  assert.equal(place({ needsActionP: 0.2, dateKind: "deadline" }, { dueAt: due }), "comingUp");
});
