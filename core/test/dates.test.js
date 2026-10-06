import { test } from "node:test";
import assert from "node:assert/strict";
import { findDate } from "../src/dates.js";

// Monday 5 October 2026, 10:00 in India.
const sentAt = new Date("2026-10-05T10:00:00+05:30");
const ist = (iso) => new Date(`${iso}+05:30`).toISOString();
const due = (text, kind = "deadline") => findDate(text, { sentAt, kind })?.dueAt.toISOString();

test("month name first, American style", () => {
  // Sent in October, so the next July 21.
  assert.equal(due("Submissions close July 21 at 5 PM"), ist("2027-07-21T17:00:00"));
});

test("weekday with a time", () => {
  assert.equal(due("Assignment 3 is due this Friday 11:59pm"), ist("2026-10-09T23:59:00"));
});

test("a date without a time means the end of that day", () => {
  assert.equal(due("Last date to apply: 20 Oct"), ist("2026-10-20T23:59:59"));
  assert.deepEqual(findDate("Last date to apply: 20 Oct", { sentAt }).hasTime, false);
});

test("numeric dates are read day first", () => {
  assert.equal(due("Submit by 15/10/2026"), ist("2026-10-15T23:59:59"));
  assert.equal(due("Fee deadline: 10/11"), ist("2026-11-10T23:59:59"));
});

test("relative dates use the email's sent date, not today", () => {
  assert.equal(due("Please reply by tomorrow"), ist("2026-10-06T23:59:59"));
  assert.equal(due("Submit within 3 days"), ist("2026-10-08T23:59:59"));
});

test("a date without a year in the past becomes next year", () => {
  const sentInDecember = new Date("2026-12-28T10:00:00+05:30");
  assert.equal(findDate("Fees due 3 Jan", { sentAt: sentInDecember }).dueAt.toISOString(), ist("2027-01-03T23:59:59"));
});

test("dates before the email was sent are ignored", () => {
  assert.equal(due("The class on 2 Oct 2026 was cancelled. Submit by tomorrow."), ist("2026-10-06T23:59:59"));
  assert.equal(due("Thanks for attending on 1 Oct 2026."), undefined);
});

test("the date next to a deadline word wins", () => {
  const text = "Webinar on 8 Oct at 6 PM. Register by 7 Oct.";
  assert.equal(due(text, "deadline"), ist("2026-10-07T23:59:59"));
});

test("the date next to an event word wins for events", () => {
  const text = "Register by 7 Oct. The webinar is on 8 Oct at 6 PM.";
  assert.equal(due(text, "event"), ist("2026-10-08T18:00:00"));
  assert.equal(findDate(text, { sentAt, kind: "event" }).hasTime, true);
});

test("no date gives null", () => {
  assert.equal(findDate("Thanks for your order! Rs 2500 paid. Order 4093381.", { sentAt }), null);
});

// Found by trying realistic phrases after the first tests passed.
test("EOD means the end of the day the email was sent", () => {
  assert.equal(due("Please submit before EOD"), ist("2026-10-05T23:59:59"));
  assert.equal(due("Send it by end of day"), ist("2026-10-05T23:59:59"));
  assert.equal(due("Reply by EOD Friday"), ist("2026-10-09T23:59:59"));
});

test("a bare day like 'the 15th' is in this month, or next month if it has passed", () => {
  assert.equal(due("Fees must be paid by the 15th of this month"), ist("2026-10-15T23:59:59"));
  assert.equal(due("Offer valid till 31st"), ist("2026-10-31T23:59:59"));
  assert.equal(due("Rent due on the 3rd"), ist("2026-11-03T23:59:59"));
  assert.equal(due("Exam on Wednesday, 2nd slot", "event"), ist("2026-10-07T23:59:59"), "'2nd slot' is not a date");
});

test("a time written just after a date belongs to it", () => {
  assert.equal(due("Interview: 7th Oct (Wed) 2:30-3:00 PM", "event"), ist("2026-10-07T14:30:00"));
  assert.equal(due("Viva on 9 Oct, 11 AM", "event"), ist("2026-10-09T11:00:00"));
});

test("a day/month pair with no year needs a date word nearby", () => {
  assert.equal(due("You scored 10/11 in the quiz"), undefined);
  assert.equal(due("Fee deadline: 10/11"), ist("2026-11-10T23:59:59"));
});

// Found on a real inbox (7 October 2026); wording changed, shapes kept.
test("'now' and durations are not dates", () => {
  const text = "Our AI newsletter (4 min daily) is here. Voice commands are now live. 24/7 support. See you all next week.";
  assert.equal(due(text, "deadline"), undefined);
  assert.equal(due(text, "event"), undefined);
  assert.equal(due("The webinar is LIVE now! Refresh the page after a few minutes.", "event"), undefined);
});

test("'today' inside a sentence is not a date", () => {
  const text = "Today's best coding agents rely on huge models. Entry Deadline: November 25, 2026";
  assert.equal(due(text, "event"), ist("2026-11-25T23:59:59"));
  assert.equal(due(text, "deadline"), ist("2026-11-25T23:59:59"));
});

test("'now' next to the word deadline does not beat the real date", () => {
  const sentInJuly = new Date("2026-07-17T21:00:00+05:30");
  const text = "Submissions are open until July 21 at 5 PM PT. That idea in your backlog now has a deadline.";
  assert.equal(findDate(text, { sentAt: sentInJuly }).dueAt.toISOString(), ist("2026-07-22T05:30:00"));
});

test("'end of day' right after a date belongs to that date", () => {
  const sentInAugust = new Date("2026-08-31T22:00:00+05:30");
  const text = "Apply to organize before Sept 7. Deadline: Sept 7 (end of day Eastern Time)";
  assert.equal(findDate(text, { sentAt: sentInAugust }).dueAt.toISOString(), ist("2026-09-07T23:59:59"));
});

test("casual dates still count next to a deadline or event word", () => {
  assert.equal(due("Starts in 2 hours", "event"), ist("2026-10-05T12:00:00"));
  assert.equal(due("Assignment due tomorrow"), ist("2026-10-06T23:59:59"));
  assert.equal(due("Happy Friday! Here are this week's deals."), undefined);
});

test("dates inside links are ignored", () => {
  assert.equal(due("Read more: https://news.example.com/2026/10/09/big-launch and www.example.com/2026/10/12/x"), undefined);
  assert.equal(due("Register by 9 Oct: https://events.example.com/2026/10/20/info"), ist("2026-10-09T23:59:59"));
});
