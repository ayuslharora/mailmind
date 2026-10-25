import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { findDate } from "@mailmind/core";
import { demoEmails, demoNow, shiftDays, shiftText } from "../utils/demoInbox.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const sentAt = new Date("2026-10-09T18:30:00+05:30");

test("written dates move with their weekday, in the style they were written", () => {
  assert.equal(shiftText("Submit by Wednesday, 14 October 2026, 11:59 PM.", 15, sentAt), "Submit by Thursday, 29 October 2026, 11:59 PM.");
  assert.equal(shiftText("Mon, 12 Oct and Sat 10 Oct 2026", 15, sentAt), "Tue, 27 Oct and Sun 25 Oct 2026");
  assert.equal(shiftText("since September 20", 15, sentAt), "since October 5");
  assert.equal(shiftText("the 1st October", 1, sentAt), "the 2nd October");
  assert.equal(shiftText("31 Dec 2026", 15, sentAt), "15 Jan 2027");
});

test("day-first numeric dates move, and a lone weekday moves with them", () => {
  assert.equal(shiftText("debited on 09-10-26", 15, sentAt), "debited on 24-10-26");
  assert.equal(shiftText("01-09-2026 to 30-09-2026", 15, sentAt), "16-09-2026 to 15-10-2026");
  assert.equal(shiftText("by Friday or Sunday, 11 Oct", 15, sentAt), "by Saturday or Monday, 26 Oct");
});

test("text that only looks like a date is left alone", () => {
  assert.equal(shiftText("the Nova 14 phone", 15, sentAt), "the Nova 14 phone");
  assert.equal(shiftText("October 2026 results", 15, sentAt), "October 2026 results");
  assert.equal(shiftText("anything", 0, sentAt), "anything");
});

// Dates that are rightly not moved: t24's internship is "May–July 2027" (no
// day is written, so it stays), and t62's "this week" depends on the weekday
// the email was sent. Neither is a deadline or event the classifier uses.
const NOT_MOVED = new Set(["t24 event", "t62 event"]);

// The real test of the rewriting: Mailmind finds exactly the same deadline
// and event in every demo email, moved by the same number of days.
test("every deadline and event found in the inbox moves exactly with the text", () => {
  const { threads } = JSON.parse(fs.readFileSync(new URL("../../eval/classifier/cases.json", import.meta.url), "utf8"));
  for (const days of [1, 3, 6, 7, 15, 40, 83]) {
    for (const thread of threads) {
      for (const m of thread.messages) {
        const sent = new Date(m.date);
        const movedSent = new Date(sent.getTime() + days * DAY_MS);
        const raw = `${m.subject}\n${m.body}`;
        const movedRaw = `${shiftText(m.subject, days, sent)}\n${shiftText(m.body, days, sent)}`;
        for (const kind of ["deadline", "event"]) {
          if (NOT_MOVED.has(`${thread.id} ${kind}`)) continue;
          const before = findDate(raw, { sentAt: sent, kind });
          const after = findDate(movedRaw, { sentAt: movedSent, kind });
          assert.equal(after?.dueAt?.getTime() ?? null, before ? before.dueAt.getTime() + days * DAY_MS : null, `${thread.id} ${kind} +${days}`);
          assert.equal(after?.hasTime ?? null, before?.hasTime ?? null, `${thread.id} ${kind} +${days}`);
        }
      }
    }
  }
});

test("the inbox's now is 10 am today in India, and every email arrived before it", () => {
  const now = new Date("2026-10-25T15:00:00+05:30");
  assert.equal(shiftDays(now), 15);
  assert.equal(demoNow(now).toISOString(), "2026-10-25T04:30:00.000Z");
  const emails = demoEmails(now);
  assert.equal(emails.length, 74);
  assert.ok(emails.every((email) => email.date <= demoNow(now)));
  assert.equal(new Set(emails.map((email) => email.id)).size, emails.length);
});
