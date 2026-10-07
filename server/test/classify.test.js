import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPromoRules, buildState, normalizeAnswers, pickDueAt, rulesClassification } from "../utils/classify.js";

const now = new Date("2026-10-05T10:00:00+05:30");
const message = (overrides) => ({
  from: "Prof <prof@college.example.edu>",
  fromMe: false,
  subject: "Assignment 3",
  body: "Please submit by Friday.",
  labelIds: ["INBOX", "CATEGORY_UPDATES"],
  bulkSender: false,
  ...overrides,
});

test("the state has the sender's domain only, and the latest message's start and end", () => {
  const long = `${"a".repeat(2000)}P.S. reply by Friday`;
  const state = buildState([message({ body: long }), message({ fromMe: true, body: "Sure!" })], now);
  assert.equal(state.from_domain, "college.example.edu");
  assert.ok(!JSON.stringify(state).includes("Prof <"), "full sender address sent");
  assert.ok(state.latest.text.endsWith("P.S. reply by Friday"));
  assert.ok(state.latest.text.length < 1600);
  assert.deepEqual(state.earlier, [{ from_me: true, text: "Sure!" }]);
  assert.equal(state.gmail_category, "updates");
});

test("deadline_in_days uses the nearest upcoming date of the latest message", () => {
  const state = buildState([message({ deadlineAt: new Date("2026-10-07T10:00:00+05:30"), eventAt: new Date("2026-10-01") })], now);
  assert.equal(state.deadline_in_days, 2);
  assert.equal(buildState([message({})], now).deadline_in_days, null);
});

const reply = {
  security: { p: 0.02 },
  category: { probs: { academic: 0.9, jobs: 0.05, finance: 0, personal: 0, notifications: 0.05, promos: 0 } },
  needs_action: { p: 0.95 },
  urgency: { probs: { ignore: 0, sometime: 0, this_week: 0.75, today: 0.25, immediately: 0 } },
  date_kind: { probs: { deadline: 0.9, event: 0.05, none: 0.05 } },
};

test("answers are normalised into the stored shape", () => {
  const answers = normalizeAnswers(reply);
  assert.equal(answers.category, "academic");
  assert.equal(answers.needsActionP, 0.95);
  assert.equal(answers.urgency, 2.25);
  assert.equal(answers.dateKind, "deadline");
});

test("probabilities out of range are clamped and choices rescaled to add up to 1", () => {
  const answers = normalizeAnswers({ ...reply, security: { p: 1.7 }, category: { probs: { academic: 2, promos: 2 } } });
  assert.equal(answers.securityP, 1);
  assert.equal(answers.categoryProbs.academic, 0.5);
  assert.equal(answers.categoryProbs.jobs, 0);
});

test("an unusable reply throws so it can be retried", () => {
  assert.throws(() => normalizeAnswers({ ...reply, category: { probs: {} } }));
  assert.throws(() => normalizeAnswers({}));
});

test("a promotion that says URGENT is capped only when the headers agree", () => {
  const promo = { ...normalizeAnswers(reply), urgency: 4, categoryProbs: { promos: 0.9 } };
  assert.deepEqual(
    [applyPromoRules(promo, { gmail_category: "promotions" }).urgency, applyPromoRules(promo, { gmail_category: "promotions" }).promoCap],
    [1, true],
  );
  assert.equal(applyPromoRules(promo, { gmail_category: "primary", bulk_sender: false }).urgency, 3, "model only: lowered by 1");
  const notPromo = { ...promo, categoryProbs: { promos: 0.1 } };
  assert.equal(applyPromoRules(notPromo, { bulk_sender: true }).urgency, 3, "headers only: lowered by 1");
  assert.equal(applyPromoRules(notPromo, { gmail_category: "primary", bulk_sender: false }).urgency, 4);
});

test("the due date comes from the newest message with a date of the chosen kind", () => {
  const messages = [message({}), message({ deadlineAt: new Date("2026-10-09"), deadlineHasTime: false, eventAt: new Date("2026-10-12") })];
  assert.equal(pickDueAt(messages, { dateKind: "deadline", dateKindP: 0.9 }).dueAt.toISOString(), new Date("2026-10-09").toISOString());
  assert.equal(pickDueAt(messages, { dateKind: "event", dateKindP: 0.9 }).dueAt.toISOString(), new Date("2026-10-12").toISOString());
  assert.equal(pickDueAt(messages, { dateKind: "deadline", dateKindP: 0.4 }).dueAt, null, "unsure");
  assert.equal(pickDueAt(messages, { dateKind: "none", dateKindP: 0.9 }).dueAt, null);
});

test("OTP emails are classified by the rules without an AI call", () => {
  const otp = message({ subject: "Your OTP", body: "Your OTP is [OTP]. Valid for 10 minutes.", strict: true });
  assert.equal(rulesClassification(otp).securityP, 1);
  assert.equal(rulesClassification(message({ strict: true, hidden: new Map([["CARD", 1]]) })), null);
});

// Found on a real inbox: a security notice stored strictly has every
// code-shaped number hidden as [OTP] (project IDs, dates), but is not an OTP
// email, so the rule must not decide it.
test("a strictly stored email without OTP words goes to the model", () => {
  const notice = message({
    subject: "[Action Advised] Manage your unused OAuth clients",
    body: "Your project [OTP] has inactive OAuth clients that will be deleted.",
    strict: true,
    hidden: new Map([["OTP", 3]]),
  });
  assert.equal(rulesClassification(notice), null);
});
