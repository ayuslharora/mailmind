// Urgency is never stored: it is worked out each time the Today view loads,
// so it rises as a deadline gets closer without classifying the email again.

const HOUR_MS = 60 * 60 * 1000;

// Time left before the date, and the urgency it gives (0–4).
const DATE_URGENCY = [
  { under: 24 * HOUR_MS, urgency: 4 },
  { under: 3 * 24 * HOUR_MS, urgency: 3 },
  { under: 7 * 24 * HOUR_MS, urgency: 2 },
];
const PROMO_MAX_URGENCY = 1;
const DAY_MS = 24 * HOUR_MS;

// modelUrgency is the classifier's score (0–4), judged when the email
// arrived (receivedAt); it fades by one point a day, so a login alert is
// urgent on the day it comes and not three days later. dueAt is the deadline
// or event date, if any, and keeps an old email urgent as it gets close.
// promoCap is set when the classifier and Gmail's headers both say the email
// is a promotion. A past date is "missed": it adds no urgency.
export function urgency({ modelUrgency = 0, dueAt = null, promoCap = false, receivedAt = null }, now = new Date()) {
  const timeLeft = dueAt ? dueAt.getTime() - now.getTime() : Infinity;
  const missed = timeLeft < 0;
  const dateUrgency = missed ? 0 : (DATE_URGENCY.find((step) => timeLeft < step.under)?.urgency ?? 0);
  const daysOld = receivedAt ? Math.max(0, Math.floor((now.getTime() - receivedAt.getTime()) / DAY_MS)) : 0;
  const fadedModelUrgency = Math.max(0, Math.round((modelUrgency - daysOld) * 100) / 100);
  const value = Math.max(fadedModelUrgency, dateUrgency);
  return { urgency: promoCap ? Math.min(value, PROMO_MAX_URGENCY) : value, missed };
}
