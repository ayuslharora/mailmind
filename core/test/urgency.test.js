import { test } from "node:test";
import assert from "node:assert/strict";
import { urgency } from "../src/urgency.js";

const now = new Date("2026-10-05T10:00:00+05:30");
const inHours = (h) => new Date(now.getTime() + h * 60 * 60 * 1000);

test("urgency rises as the date gets closer", () => {
  assert.equal(urgency({ dueAt: inHours(12) }, now).urgency, 4, "under 1 day");
  assert.equal(urgency({ dueAt: inHours(48) }, now).urgency, 3, "under 3 days");
  assert.equal(urgency({ dueAt: inHours(24 * 5) }, now).urgency, 2, "under 7 days");
  assert.equal(urgency({ dueAt: inHours(24 * 10) }, now).urgency, 0, "a week or more");
});

test("the model's urgency wins when it is higher", () => {
  assert.equal(urgency({ modelUrgency: 3.5, dueAt: inHours(24 * 10) }, now).urgency, 3.5);
  assert.equal(urgency({ modelUrgency: 1, dueAt: inHours(12) }, now).urgency, 4);
  assert.equal(urgency({ modelUrgency: 2.25 }, now).urgency, 2.25, "no date");
});

test("a past date is missed, not urgent", () => {
  assert.deepEqual(urgency({ modelUrgency: 1, dueAt: inHours(-2) }, now), { urgency: 1, missed: true });
  assert.equal(urgency({ dueAt: inHours(2) }, now).missed, false);
});

test("promotions are capped at 1, even with a close date", () => {
  assert.equal(urgency({ modelUrgency: 4, dueAt: inHours(3), promoCap: true }, now).urgency, 1);
});
