// Finds the deadline or event date in an email. Runs on the raw text in
// memory; only the resulting date is stored.
import * as chrono from "chrono-node";

// Indian Standard Time is UTC+5:30.
const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;

// Words that sit next to the date that matters for each kind.
const KEYWORDS = {
  deadline:
    /\b(?:due|by|before|deadline|last\s+date|submit|submission|closes?|ends?|expires?|until|till|within|no\s+later\s+than)\b/gi,
  event: /\b(?:on|at|scheduled|exam|interview|meeting|webinar|class|session|event|starts?|begins?|held)\b/gi,
};
const ANY_KEYWORD = new RegExp(`${KEYWORDS.deadline.source}|${KEYWORDS.event.source}`, "gi");
// A keyword further than this from a date is not about that date.
const KEYWORD_REACH = 40;
// A time this close after a date belongs to it: "7th Oct (Wed) 2:30 PM".
const TIME_REACH = 20;

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const DAY_WORDS = "mon|tue|wed|thu|fri|sat|sun|today|tomorrow|tonight";

function istParts(date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1, day: ist.getUTCDate() };
}

function istDate({ year, month, day }, hours, minutes, seconds) {
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds) - IST_OFFSET_MS);
}

const startOfDayIst = (date) => istDate(istParts(date), 0, 0, 0);
const endOfDayIst = (date) => istDate(istParts(date), 23, 59, 59);

// "EOD", "end of day", "COB": the day the email was sent. Skipped when a day
// follows ("EOD Friday"), so chrono reads that day instead.
const endOfDayParser = {
  pattern: () =>
    new RegExp(
      `\\b(?:eod|cob|end\\s+of\\s+(?:the\\s+)?day|close\\s+of\\s+business)\\b(?!\\s*,?\\s*(?:on\\s+)?(?:${DAY_WORDS}|${MONTHS}|\\d))`,
      "i",
    ),
  extract: (context) => istParts(context.reference.instant),
};

// "by the 15th", "till 31st": that day this month, or next month if it has
// passed. Needs a deadline word first, so "2nd slot" is not read as a date.
const bareDayParser = {
  pattern: () =>
    new RegExp(
      `\\b(?:by|till|until|before|on|due(?:\\s+on)?)\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)\\b(?!\\s*(?:of\\s+)?(?:${MONTHS}))`,
      "i",
    ),
  extract: (context, match) => {
    const today = istParts(context.reference.instant);
    const day = Number(match[1]);
    const nextMonth = day < today.day;
    const month = nextMonth ? (today.month % 12) + 1 : today.month;
    const year = nextMonth && today.month === 12 ? today.year + 1 : today.year;
    return { day, month, year };
  },
};

const parser = chrono.en.GB.clone();
parser.parsers.push(endOfDayParser, bareDayParser);

// Characters between a keyword and a date; 0 if they overlap.
function distance(keyword, candidate) {
  if (keyword.end <= candidate.start) return candidate.start - keyword.end;
  if (keyword.start >= candidate.end) return keyword.start - candidate.end;
  return 0;
}

const keywordSpans = (text, pattern) =>
  [...text.matchAll(pattern)].map((m) => ({ start: m.index, end: m.index + m[0].length }));

const nearestKeyword = (keywords, candidate) =>
  Math.min(Infinity, ...keywords.map((keyword) => distance(keyword, candidate)));

function toCandidates(results) {
  const candidates = [];
  for (const result of results) {
    const candidate = {
      start: result.index,
      end: result.index + result.text.length,
      text: result.text,
      hasDay: result.start.isCertain("day") || result.start.isCertain("weekday"),
      hasTime: result.start.isCertain("hour"),
      date: result.start.date(),
    };
    const previous = candidates.at(-1);
    // A weekday next to a date only repeats it: "7th Oct (Wed) 2:30 PM".
    const timeForPrevious =
      previous && previous.hasDay && !previous.hasTime && candidate.hasTime && !result.start.isCertain("day") &&
      candidate.start - previous.end <= TIME_REACH;
    if (timeForPrevious) {
      previous.date = istDate(istParts(previous.date), result.start.get("hour"), result.start.get("minute"), 0);
      previous.hasTime = true;
      previous.end = candidate.end;
    } else {
      candidates.push(candidate);
    }
  }
  return candidates;
}

// Returns { dueAt, hasTime } or null. Dates are read day first (15/10 is 15
// October), relative to when the email was sent, in Indian time. A date
// without a time means the end of that day. Dates before the email was sent
// are ignored. When there are several, the one nearest a deadline or event
// word wins; otherwise the first one in the text.
export function findDate(text, { sentAt, kind = "deadline" }) {
  const sentDay = startOfDayIst(sentAt);
  const anyKeywords = keywordSpans(text, ANY_KEYWORD);
  const candidates = toCandidates(
    parser.parse(text, { instant: sentAt, timezone: IST_OFFSET_MINUTES }, { forwardDate: true }),
  )
    .map((candidate) => ({ ...candidate, dueAt: candidate.hasTime ? candidate.date : endOfDayIst(candidate.date) }))
    .filter((candidate) => candidate.dueAt >= sentDay)
    // "10/11" with no year and no date word nearby is more likely a score.
    .filter(
      (candidate) =>
        !/^\d{1,2}[/.-]\d{1,2}$/.test(candidate.text) || nearestKeyword(anyKeywords, candidate) <= KEYWORD_REACH,
    );

  if (candidates.length === 0) return null;

  const keywords = keywordSpans(text, KEYWORDS[kind]);
  const best = candidates.reduce((a, b) => (nearestKeyword(keywords, b) < nearestKeyword(keywords, a) ? b : a));
  const chosen = nearestKeyword(keywords, best) <= KEYWORD_REACH ? best : candidates[0];

  return { dueAt: chosen.dueAt, hasTime: chosen.hasTime };
}
