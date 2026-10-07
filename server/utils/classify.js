// What the classifier is asked, what it is shown, and how its answers are
// checked. No network calls here; the model call is in utils/classifier.js.
// Design: docs/classification-case-study.md.

// Raised whenever the questions change; older results are classified again.
export const QUESTIONS_VERSION = 3;

// Thresholds on the classifier's probabilities. Security is deliberately low:
// a false alarm only stores a more strictly redacted copy.
export const SECURITY_P = 0.3;
export const NEEDS_ACTION_P = 0.6;

export const CATEGORIES = ["academic", "jobs", "finance", "personal", "notifications", "promos"];
export const URGENCY_LEVELS = ["ignore", "sometime", "this_week", "today", "immediately"];
export const DATE_KINDS = ["deadline", "event", "none"];

// In the request format of a decision model such as Jev, so the same request
// can be sent to Jev or Laya in the evaluation.
export const QUESTIONS = {
  security: {
    type: "boolean",
    instructions: "Is this a login code, password, security alert or account-access email?",
  },
  category: {
    type: "choice",
    instructions: "Which category best fits this email thread?",
    criteria: {
      academic: "College courses, assignments, exams, classes.",
      jobs: "Jobs, internships, recruiters, interviews, hackathons and competitions.",
      finance: "Banks, bills, payments, receipts.",
      personal: "Messages from friends or family.",
      notifications: "Automated alerts, account notices, deliveries.",
      promos: "Marketing, sales, newsletters, and brand messages written to sound personal.",
    },
  },
  needs_action: {
    type: "boolean",
    instructions:
      "Is there a specific thing the recipient must do, such as reply to a person, pay, submit, register before a deadline, or fix a problem with their account? Launches, newsletters, invitations, receipts, invoices and confirmations of something already done do not need action. If the latest message is from the recipient (from_me), nothing is needed from them.",
  },
  urgency: {
    type: "score",
    instructions: "How urgent is this thread for the recipient?",
    criteria: {
      ignore: "Can be ignored",
      sometime: "Read sometime",
      this_week: "Handle this week",
      today: "Handle today",
      immediately: "Handle immediately",
    },
  },
  date_kind: {
    type: "choice",
    instructions: "Does the thread mention a date the recipient must act by, or attend?",
    criteria: {
      deadline: "Something must be done by a date.",
      event: "Something happens on a date (exam, interview, meeting, webinar).",
      none: "No such date.",
    },
  },
};

export const SYSTEM_PROMPT = `You sort one email thread for the person who received it.
Secrets in the text were replaced before you saw it: [OTP] a one-time code, [CARD], [AADHAAR], [PAN], [ACCOUNT], [PIN], [PASSWORD], [PHONE], [IP], and [LINK:domain] for a removed link.
Facts worked out by the server: deadline_in_days is the days until the nearest upcoming date found in the latest message (null if none); gmail_category is Gmail's own tab; bulk_sender means it was sent by a mailing tool.
Answer every question with honest probabilities between 0 and 1. Use 0 or 1 only when certain. For a choice, give every option a probability, adding up to 1.`;

const LATEST_HEAD = 1200;
const LATEST_TAIL = 300;
const EARLIER_COUNT = 2;
const EARLIER_CHARS = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

const GMAIL_CATEGORIES = {
  CATEGORY_PROMOTIONS: "promotions",
  CATEGORY_UPDATES: "updates",
  CATEGORY_SOCIAL: "social",
  CATEGORY_FORUMS: "forums",
  CATEGORY_PERSONAL: "primary",
};

const domainOf = (from = "") => from.match(/@([^>\s]+)/)?.[1]?.toLowerCase() ?? "";

// The start and the end of a long email: a closing "P.S. reply by Friday" matters.
function headAndTail(text, head, tail) {
  const trimmed = text.trim();
  return trimmed.length <= head + tail ? trimmed : `${trimmed.slice(0, head)} … ${trimmed.slice(-tail)}`;
}

function gmailCategory(labelIds = []) {
  const label = labelIds.find((id) => GMAIL_CATEGORIES[id]);
  return label ? GMAIL_CATEGORIES[label] : null;
}

// messages: the thread's stored (redacted) messages, newest first.
export function buildState(messages, now = new Date()) {
  const [latest, ...earlier] = messages;
  const upcoming = [latest.deadlineAt, latest.eventAt].filter((date) => date && date >= now).sort((a, b) => a - b)[0];

  return {
    from_domain: domainOf(latest.from),
    subject: latest.subject,
    latest: { from_me: latest.fromMe, text: headAndTail(latest.body, LATEST_HEAD, LATEST_TAIL) },
    earlier: earlier.slice(0, EARLIER_COUNT).map((m) => ({ from_me: m.fromMe, text: m.body.trim().slice(0, EARLIER_CHARS) })),
    deadline_in_days: upcoming ? Math.round(((upcoming - now) / DAY_MS) * 10) / 10 : null,
    gmail_category: gmailCategory(latest.labelIds),
    bulk_sender: latest.bulkSender,
  };
}

const clamp = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

// Every option gets a probability between 0 and 1, scaled to add up to 1.
function normalizeChoice(probs, options) {
  const values = options.map((option) => clamp(probs?.[option]));
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum === 0) throw new Error("The classifier gave no probability to any option");
  return Object.fromEntries(options.map((option, i) => [option, values[i] / sum]));
}

const best = (probs) => Object.entries(probs).reduce((a, b) => (b[1] > a[1] ? b : a));

// Turns the model's reply into the stored shape. Throws if it is unusable, so
// the caller can retry.
export function normalizeAnswers(raw) {
  const categoryProbs = normalizeChoice(raw.category?.probs, CATEGORIES);
  const urgencyProbs = normalizeChoice(raw.urgency?.probs, URGENCY_LEVELS);
  const dateKindProbs = normalizeChoice(raw.date_kind?.probs, DATE_KINDS);
  const [dateKind, dateKindP] = best(dateKindProbs);

  return {
    category: best(categoryProbs)[0],
    categoryProbs,
    securityP: clamp(raw.security?.p),
    needsActionP: clamp(raw.needs_action?.p),
    // Expected value: 0 for "ignore" up to 4 for "immediately".
    urgency: URGENCY_LEVELS.reduce((sum, level, i) => sum + i * urgencyProbs[level], 0),
    dateKind,
    dateKindP,
  };
}

const PROMO_P = 0.7;
const PROMO_MAX_URGENCY = 1;

// Email text is untrusted: a promotion can say "URGENT". Gmail's tab and the
// bulk-mail header cannot be faked by the text, so they decide.
export function applyPromoRules(answers, state) {
  const modelSaysPromo = answers.categoryProbs.promos >= PROMO_P;
  const headersSayPromo = state.gmail_category === "promotions" || state.bulk_sender;

  if (modelSaysPromo && headersSayPromo) {
    return { ...answers, urgency: Math.min(answers.urgency, PROMO_MAX_URGENCY), promoCap: true };
  }
  if (modelSaysPromo || headersSayPromo) {
    return { ...answers, urgency: Math.max(0, answers.urgency - 1), promoCap: false };
  }
  return { ...answers, promoCap: false };
}

const DATE_KIND_P = 0.5;

// The date of the kind the classifier chose, from the newest message that has one.
export function pickDueAt(messages, { dateKind, dateKindP }) {
  if (dateKind === "none" || dateKindP < DATE_KIND_P) return { dueAt: null, dueHasTime: null };
  const field = dateKind === "deadline" ? "deadline" : "event";
  const message = messages.find((m) => m[`${field}At`]);
  return message ? { dueAt: message[`${field}At`], dueHasTime: message[`${field}HasTime`] } : { dueAt: null, dueHasTime: null };
}

// When the rules are sure, no AI call is needed: an email whose one-time code
// was hidden is a security email that is useless a few minutes later.
export function rulesClassification(latest) {
  if (!latest.strict || !(latest.hidden?.get?.("OTP") ?? latest.hidden?.OTP)) return null;
  return {
    category: "notifications",
    categoryProbs: Object.fromEntries(CATEGORIES.map((c) => [c, c === "notifications" ? 1 : 0])),
    securityP: 1,
    needsActionP: 0,
    urgency: 0,
    dateKind: "none",
    dateKindP: 1,
    promoCap: false,
  };
}
