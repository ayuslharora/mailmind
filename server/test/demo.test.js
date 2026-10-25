import { test } from "node:test";
import assert from "node:assert/strict";

const { default: Message } = await import("../models/message.model.js");
const { default: SenderRule } = await import("../models/senderRule.model.js");
const { default: Thread } = await import("../models/thread.model.js");
const { buildToday } = await import("../utils/todayView.js");
const { getDemoToday } = await import("../controllers/demo.controllers.js");

const now = new Date("2026-10-25T12:00:00+05:30");
const hoursAgo = (h) => new Date(now.getTime() - h * 60 * 60 * 1000);
const answers = { categoryProbs: {}, securityP: 0, urgency: 2, promoCap: false, source: "jev-1.13", dateKind: "none" };

// Two threads in the stored inbox: a task from a professor, and a newsletter.
const threads = [
  { threadId: "t1", latestMessageId: "m1", classification: { ...answers, category: "academic", needsActionP: 0.9 } },
  { threadId: "t2", latestMessageId: "m2", classification: { ...answers, category: "notifications", needsActionP: 0.1, urgency: 0 } },
];
const messages = [
  { gmailId: "m1", from: "Prof <prof@college.edu>", subject: "Assignment", body: "Submit it", date: hoursAgo(2) },
  { gmailId: "m2", from: "News <news@site.com>", subject: "Weekly", body: "Hello", date: hoursAgo(3) },
];

Thread.find = () => ({ sort: async () => threads });
Thread.countDocuments = async () => 0;
SenderRule.find = async () => [];
Message.find = async () => messages;

const placed = (today) =>
  Object.fromEntries(Object.entries(today).flatMap(([section, items]) => (Array.isArray(items) ? items.map((i) => [i.threadId, section]) : [])));

test("without changes, the stored inbox is shown as it is", async () => {
  assert.deepEqual(placed(await buildToday({ _id: "demo" }, now)), { t1: "needsAction", t2: "other" });
});

test("a visitor's done and snooze hide threads, and an ended snooze shows them again", async () => {
  const done = await buildToday({ _id: "demo" }, now, { threads: { t1: { state: "done" } } });
  assert.deepEqual(placed(done), { t2: "other" });
  const snoozed = await buildToday({ _id: "demo" }, now, { threads: { t1: { state: "snoozed", snoozeUntil: hoursAgo(-5) } } });
  assert.deepEqual(placed(snoozed), { t2: "other" });
  const ended = await buildToday({ _id: "demo" }, now, { threads: { t1: { state: "snoozed", snoozeUntil: hoursAgo(1) } } });
  assert.deepEqual(placed(ended), { t1: "needsAction", t2: "other" });
});

test("a visitor's corrections move threads the way the real app does", async () => {
  const today = await buildToday({ _id: "demo" }, now, {
    threads: { t1: { needsAction: false }, t2: { needsAction: true } },
    senders: { "prof@college.edu": "jobs" },
  });
  assert.deepEqual(placed(today), { t1: "other", t2: "needsAction" });
  assert.equal(today.other[0].category, "jobs", "the sender rule from the visitor's browser applies");
  assert.equal(today.other[0].sender, "prof@college.edu");
});

function fakeResponse() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => ((res.body = body), res);
  return res;
}

test("the demo Today route checks the changes it is sent", async () => {
  const bad = fakeResponse();
  await getDemoToday({ user: { _id: "demo" }, body: { threads: { t1: { category: "made-up" } } } }, bad);
  assert.equal(bad.statusCode, 400);

  const unknownField = fakeResponse();
  await getDemoToday({ user: { _id: "demo" }, body: { threads: { t1: { userId: "someone" } } } }, unknownField);
  assert.equal(unknownField.statusCode, 400);

  const empty = fakeResponse();
  await getDemoToday({ user: { _id: "demo" } }, empty);
  assert.equal(empty.statusCode, 200);
  assert.deepEqual(placed(empty.body), { t1: "needsAction", t2: "other" });
});
