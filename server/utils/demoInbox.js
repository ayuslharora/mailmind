// The demo inbox: the fake emails of eval/classifier/cases.json (a student's
// week, written for the classifier evaluation), moved by whole days so the
// inbox's "now" is always today. The dates written in the emails move with
// them, so an email that says "submit by Wednesday, 14 October" still agrees
// with the deadline Mailmind finds in it. No network calls here; the
// database side is in utils/demo.js.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CASES_FILE = path.join(__dirname, "../../eval/classifier/cases.json");

// The demo account's googleId. Google's IDs are numbers, so no Google account
// can sign in as it.
export const DEMO_GOOGLE_ID = "demo";
export const DEMO_EMAIL = "aarav.sharma@example.com";

export const isDemo = (user) => user?.googleId === DEMO_GOOGLE_ID;

const DAY_MS = 24 * 60 * 60 * 1000;

export const dayInIndia = (date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// Whole days from one day ("2026-10-10") to another.
export const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY = "(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tues|Tue|Wed|Thurs|Thu|Fri|Sat|Sun)";
const MONTH = "(January|February|March|April|May|June|July|August|September|October|November|December|Sept|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
const SUFFIX = "(st|nd|rd|th)?";

// "Wednesday, 14 October 2026", "Sat 10 Oct", "15th October".
const DAY_MONTH = new RegExp(`\\b(?:${WEEKDAY}(,?\\s+))?(\\d{1,2})${SUFFIX}\\s+${MONTH}\\b(?:(,?\\s+)(\\d{4})\\b)?`, "g");
// "September 20", "Oct 14, 2026".
const MONTH_DAY = new RegExp(`\\b(?:${WEEKDAY}(,?\\s+))?${MONTH}\\s+(\\d{1,2})${SUFFIX}\\b(?:(,?\\s+)(\\d{4})\\b)?`, "g");
// "09-10-26", "30-09-2026": day first, as in India.
const NUMERIC = /\b(\d{2})-(\d{2})-(\d{4}|\d{2})\b/g;
// A weekday on its own: "by Friday".
const BARE_WEEKDAY = new RegExp(`\\b${WEEKDAY}\\b`, "g");

const weekdayIndex = (name) => WEEKDAYS.findIndex((day) => day.startsWith(name.slice(0, 3)));
const monthIndex = (name) => MONTHS.findIndex((month) => month.startsWith(name.slice(0, 3)));
// A name in the style it was written in: in full, or its first three letters.
const styled = (names, i, like) => (names.includes(like) ? names[i] : names[i].slice(0, 3));
const ordinal = (n) => {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
};

// A date written without a year is in the year that puts it nearest the
// day the email was sent.
function nearestYear(month, day, sentAt) {
  const year = sentAt.getUTCFullYear();
  return [year - 1, year, year + 1].reduce((best, y) =>
    Math.abs(Date.UTC(y, month, day) - sentAt) < Math.abs(Date.UTC(best, month, day) - sentAt) ? y : best,
  );
}

// The date `days` after the given one, or null if it is not a real date.
function moved(year, month, day, days) {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return new Date(date.getTime() + days * DAY_MS);
}

// One written date, moved, in the same style: weekday and year only if it
// had them, month in full or short as it was.
function writtenDate(parts, days, sentAt) {
  const { weekday, weekdaySep = "", day, suffix, month, yearSep = "", year } = parts;
  const m = monthIndex(month);
  const d = Number(day);
  const date = moved(year ? Number(year) : nearestYear(m, d, sentAt), m, d, days);
  if (!date) return null;
  const newDay = date.getUTCDate();
  return {
    weekday: weekday ? `${styled(WEEKDAYS, date.getUTCDay(), weekday)}${weekdaySep}` : "",
    day: `${newDay}${suffix ? ordinal(newDay) : ""}`,
    month: styled(MONTHS, date.getUTCMonth(), month),
    year: year ? `${yearSep}${date.getUTCFullYear()}` : "",
  };
}

// Moves every date written in the text by `days`. sentAt: when the email was
// first sent, to place dates written without a year. Each weekday name moves
// too, so "by Friday" still means the same day relative to the email.
export function shiftText(text, days, sentAt) {
  if (!text || days === 0) return text;

  // Rewritten dates are held aside until the end, so the weekday they now
  // contain is not moved a second time.
  const held = [];
  const hold = (replacement, original) => (replacement === null ? original : `\u0000${held.push(replacement) - 1}\u0000`);

  return text
    .replace(DAY_MONTH, (all, weekday, weekdaySep, day, suffix, month, yearSep, year) => {
      const w = writtenDate({ weekday, weekdaySep, day, suffix, month, yearSep, year }, days, sentAt);
      return hold(w && `${w.weekday}${w.day} ${w.month}${w.year}`, all);
    })
    .replace(MONTH_DAY, (all, weekday, weekdaySep, month, day, suffix, yearSep, year) => {
      const w = writtenDate({ weekday, weekdaySep, day, suffix, month, yearSep, year }, days, sentAt);
      return hold(w && `${w.weekday}${w.month} ${w.day}${w.year}`, all);
    })
    .replace(NUMERIC, (all, day, month, year) => {
      const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
      const date = moved(fullYear, Number(month) - 1, Number(day), days);
      if (!date) return all;
      const two = (n) => String(n).padStart(2, "0");
      const newYear = year.length === 2 ? two(date.getUTCFullYear() % 100) : date.getUTCFullYear();
      return hold(`${two(date.getUTCDate())}-${two(date.getUTCMonth() + 1)}-${newYear}`, all);
    })
    .replace(BARE_WEEKDAY, (name) => styled(WEEKDAYS, (((weekdayIndex(name) + days) % 7) + 7) % 7, name))
    .replace(/\u0000(\d+)\u0000/g, (_, i) => held[Number(i)]);
}

// Gmail's tab, as the label Gmail would put on the message.
const GMAIL_TAB_LABELS = {
  primary: "CATEGORY_PERSONAL",
  promotions: "CATEGORY_PROMOTIONS",
  updates: "CATEGORY_UPDATES",
  social: "CATEGORY_SOCIAL",
  forums: "CATEGORY_FORUMS",
};

let cases;
const loadCases = () => (cases ??= JSON.parse(fs.readFileSync(CASES_FILE, "utf8")));

// Days from the inbox's own "now" (10 October 2026, 10 am) to today.
export const shiftDays = (now = new Date()) => daysBetween(dayInIndia(new Date(loadCases().now)), dayInIndia(now));

// The inbox's "now" moved to today: 10 am in India.
export const demoNow = (now = new Date()) => new Date(new Date(loadCases().now).getTime() + shiftDays(now) * DAY_MS);

// Every demo email as it reads today, in the shape utils/gmail.js returns.
export function demoEmails(now = new Date()) {
  const days = shiftDays(now);
  return loadCases().threads.flatMap((thread) =>
    thread.messages.map((m, i) => {
      const sentAt = new Date(m.date);
      return {
        id: `${thread.id}-${i}`,
        threadId: thread.id,
        from: m.from,
        subject: shiftText(m.subject, days, sentAt),
        body: shiftText(m.body, days, sentAt),
        date: new Date(sentAt.getTime() + days * DAY_MS),
        labelIds: ["INBOX", GMAIL_TAB_LABELS[m.gmail_tab] ?? "CATEGORY_PERSONAL", ...(m.from_me ? ["SENT"] : [])],
        bulkSender: Boolean(m.bulk),
      };
    }),
  );
}
