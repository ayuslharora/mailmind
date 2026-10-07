import { test } from "node:test";
import assert from "node:assert/strict";
import { chunksOf, headerOf } from "../utils/indexMessages.js";

const message = {
  from: '"Prof Rao" <rao@college.example.edu>',
  fromMe: false,
  subject: "DBMS Assignment 3",
  date: new Date("2026-10-05T10:00:00+05:30"),
  body: "Assignment 3 is due Friday 11:59pm.",
};

test("the header names the sender, subject and date, never the address", () => {
  assert.equal(headerOf(message), "From: Prof Rao | Subject: DBMS Assignment 3 | Date: 2026-10-05");
  assert.equal(headerOf({ ...message, fromMe: true }).startsWith("From: me |"), true);
});

test("a short email is one chunk; a long one is split, each with the header", async () => {
  assert.deepEqual(await chunksOf(message), [`${headerOf(message)}\nAssignment 3 is due Friday 11:59pm.`]);
  const long = await chunksOf({ ...message, body: "word ".repeat(600) });
  assert.ok(long.length > 1);
  assert.ok(long.every((chunk) => chunk.startsWith(headerOf(message))));
});

test("the date is the day in India", () => {
  const lateEvening = { ...message, date: new Date("2026-10-05T23:30:00+05:30") };
  assert.ok(headerOf(lateEvening).endsWith("Date: 2026-10-05"));
});

test("an email with no body is still searchable by its header", async () => {
  assert.deepEqual(await chunksOf({ ...message, body: "  " }), [headerOf(message)]);
});
