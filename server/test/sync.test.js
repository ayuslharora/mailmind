import { test } from "node:test";
import assert from "node:assert/strict";
import { toStoredMessage } from "../utils/sync.js";

const email = {
  id: "m1",
  threadId: "t1",
  from: "DBMS Course <noreply@college.example.edu>",
  labelIds: ["INBOX", "CATEGORY_UPDATES"],
  date: new Date("2026-10-05T10:00:00+05:30"),
  subject: "Assignment 3 portal login",
  body:
    "Assignment 3 is due this Friday 11:59pm. Your portal OTP is 482913. " +
    "Reset here: https://portal.example.edu/reset?token=abc123XYZ",
  bulkSender: false,
};

test("only the redacted text is stored", () => {
  const stored = toStoredMessage("u1", email);
  const everything = JSON.stringify(stored);
  assert.ok(!everything.includes("482913"), "OTP stored");
  assert.ok(!everything.includes("abc123XYZ"), "reset token stored");
  assert.equal(stored.strict, true);
  assert.deepEqual(stored.hidden, { OTP: 1, LINK: 1 });
});

test("dates are found from the original text before it is thrown away", () => {
  const stored = toStoredMessage("u1", email);
  assert.equal(stored.deadlineAt.toISOString(), new Date("2026-10-09T23:59:00+05:30").toISOString());
  assert.equal(stored.deadlineHasTime, true);
});

test("sent mail is marked as from me", () => {
  assert.equal(toStoredMessage("u1", email).fromMe, false);
  assert.equal(toStoredMessage("u1", { ...email, labelIds: ["SENT"] }).fromMe, true);
});
