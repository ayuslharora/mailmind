// Removes links, one-time codes and identifiers (cards, Aadhaar, PAN, account
// numbers, PINs, passwords) before email text leaves the API server.
//
// It errs on the side of over-redaction: a number removed by mistake only
// lowers classification quality, while a missed code can leak a secret.

import { findIdentifiers, SECRET_TYPES } from "./identifiers.js";

// Words that only appear in emails that carry a one-time code. If any of them
// is in the subject or body, every code-shaped token in the email is redacted.
// Hindi words are matched without \b, which only understands ASCII letters.
const STRONG_OTP_WORDS =
  /\bo\.?t\.?p\b|\bone[\s-]?time\s+(?:password|passcode|pass|pin|code)\b|\bpasscode\b|\b(?:verification|security|log[\s-]?in|sign[\s-]?in|auth(?:entication)?|access|confirmation)\s+(?:code|key|number)\b|\b2fa\b|\btwo[\s-]?(?:factor|step)\b|\bmfa\b|ओटीपी|पासकोड/i;

// Words that sometimes sit next to a code. Only tokens near them are redacted.
// "PIN code" is the Indian postal code, so neither word counts there.
const WEAK_OTP_WORDS =
  /\b(?:(?<!\bpin\s*-?\s*)codes?|pins?(?!\s*-?\s*code)|verify|verification|token|passwords?|log[\s-]?in|sign[\s-]?in|key)\b|पासवर्ड|कोड/gi;
const WINDOW_BEFORE = 80;
const WINDOW_AFTER = 120;

const NUMBER_WORD = "(?:(?:double|triple)[\\s-]+)?(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)";
const DIGIT_SEPARATOR = "(?:[.-]| {1,3}|\\t)?";

// A number written after a currency is money, never a code. Without this,
// "Never share your OTP" in a bank alert would hide every amount.
const NOT_AFTER_CURRENCY = "(?<!(?:\\b(?:rs|inr|usd)|₹|\\$)\\.?\\s*)";

const CODE_PATTERNS = [
  // 4–10 digits, optionally split: 482913, 482 913, 482.913, 4  8  2  9
  new RegExp(`${NOT_AFTER_CURRENCY}(?<![\\w-])\\d(?:${DIGIT_SEPARATOR}\\d){3,9}(?![\\w-])`, "gi"),
  // Letter prefix: G-482913
  /\b[A-Z]{1,3}-\d{4,10}\b/gi,
  // Letters and digits mixed, 6–10 characters: K7P9QX, k7p9qx
  /\b(?=[a-z0-9]{6,10}\b)(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{6,10}\b/gi,
  // Groups with at least one digit and one letter: 7XK-2PQ
  /\b(?=[a-z0-9-]*\d)(?=[a-z0-9-]*[a-z])[a-z0-9]{2,5}(?:-[a-z0-9]{2,5}){1,3}\b/gi,
  // Spelled out: four eight double two nine
  new RegExp(`\\b${NUMBER_WORD}(?:[\\s,-]+${NUMBER_WORD}){3,9}\\b`, "gi"),
];

// Digit characters from other scripts, each mapped to ASCII one-to-one so
// redaction positions still match the original text.
const DIGIT_ZEROS = [
  0xff10, // full-width
  0x0660, 0x06f0, // Arabic-Indic
  0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, // Indic scripts
];

function normaliseDigits(text) {
  return text.replace(/\p{Nd}/gu, (char) => {
    const code = char.charCodeAt(0);
    const zero = DIGIT_ZEROS.find((z) => code >= z && code <= z + 9);
    return zero === undefined ? char : String(code - zero);
  });
}

const URL_CHARS = "[^\\s<>\"'`()\\[\\]{}]";
const LINK_PATTERNS = [
  // With a scheme or www.
  new RegExp(`\\b(?:https?:\\/\\/|www\\.)${URL_CHARS}+`, "gi"),
  // Bare domain followed by a path: example.com/reset?token=abc
  new RegExp(`(?<![@\\w.\\/-])(?:[a-z0-9-]+\\.)+[a-z]{2,}\\/${URL_CHARS}*`, "gi"),
  // Percent-encoded: https%3A%2F%2Fexample.com%2Freset
  new RegExp(`\\bhttps?%3A%2F%2F${URL_CHARS}+`, "gi"),
];
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;
// The rest of a URL that an email client wrapped onto the next line.
const WRAPPED_URL_TAIL = /^\r?\n[^\s<>"'`]*[=&%?#/][^\s<>"'`]*/;

// Links containing these words can log someone in, change an account or act
// on the user's behalf, so they are never kept.
const SENSITIVE_LINK_WORDS =
  /reset|passw|verif|confirm|activat|log-?in|sign-?in|auth|token|magic|otp|session|unsubscribe|opt-?out|account|invite|pay|invoice|billing|secure|key=/i;

// Shortened links hide where they go, so they are never kept.
const URL_SHORTENERS = new Set([
  "bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "buff.ly", "is.gd", "rb.gy", "cutt.ly",
  "shorturl.at", "lnkd.in", "amzn.to", "amzn.in", "tiny.cc", "rebrand.ly", "s.id", "t.ly",
  "bl.ink", "fb.me", "surl.li", "shorte.st", "v.gd",
]);

function parseLink(url) {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // Malformed encoding: parse the raw text instead.
  }
  const withoutScheme = decoded.replace(/^https?:\/\//i, "");
  const authority = withoutScheme.split(/[/?#]/)[0];
  const host = authority.slice(authority.lastIndexOf("@") + 1).split(":")[0];
  const rest = withoutScheme.slice(authority.length);
  return {
    domain: host.toLowerCase().replace(/^www\./, ""),
    host: host.toLowerCase(),
    path: rest.split(/[?#]/)[0],
    hasUserInfo: authority.includes("@"),
    encoded: decoded !== url,
  };
}

const hasLetterAndDigit = (s) => /\d/.test(s) && /[a-z]/i.test(s);

// A path segment that looks generated rather than written: long, all digits,
// mixed letters and digits, or randomly mixed case (x7Kq9Pz, a1b2-c3d4, qWeRtYuIoP).
function looksLikeToken(segment) {
  if (segment.length >= 24) return true;
  if (/^\d{5,}$/.test(segment)) return true; // could be a code; years (/2026/) are kept
  const parts = segment.split(/[-_.]/);
  if (parts.filter((part) => part.length >= 3 && hasLetterAndDigit(part)).length >= 2) return true;
  if (parts.some((part) => part.length >= 6 && hasLetterAndDigit(part))) return true;
  return segment.length >= 8 && !/[-_.]/.test(segment) && /[a-z]/.test(segment) && /[A-Z]/.test(segment);
}

// Kept: plain content links such as a blog post. Query strings and fragments
// are always dropped, because tracking IDs and tokens usually live there.
function safeContentLink(url) {
  const { host, path, hasUserInfo, encoded } = parseLink(url);
  if (encoded || hasUserInfo || !/^https:\/\//i.test(url)) return null;
  if (URL_SHORTENERS.has(host.replace(/^www\./, ""))) return null;
  if (SENSITIVE_LINK_WORDS.test(host) || SENSITIVE_LINK_WORDS.test(path)) return null;
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some(looksLikeToken)) return null;
  return `https://${host}${path}`;
}

function findLinks(text, otpEmail) {
  const spans = [];
  for (const pattern of LINK_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const url = match[0].replace(TRAILING_PUNCTUATION, "");
      const kept = otpEmail ? null : safeContentLink(url);
      let end = match.index + url.length;
      if (!kept && url === match[0]) {
        const tail = text.slice(end).match(WRAPPED_URL_TAIL);
        if (tail) end += tail[0].length;
      }
      spans.push({
        type: kept ? "LINK_TRIMMED" : "LINK",
        start: match.index,
        end,
        replacement: kept ?? `[LINK:${parseLink(url).domain}]`,
      });
    }
  }
  return spans;
}

function findCodes(text, from = 0, to = text.length) {
  const region = text.slice(from, to);
  const spans = [];
  for (const pattern of CODE_PATTERNS) {
    for (const match of region.matchAll(pattern)) {
      spans.push({
        type: "OTP",
        start: from + match.index,
        end: from + match.index + match[0].length,
        replacement: "[OTP]",
      });
    }
  }
  return spans;
}

// Coupon codes are kept so they can be found later ("my Swiggy coupon"), but
// only when nothing suggests a login code: never in an OTP email, only in
// capitals starting with three letters (SAVE50, not K7P9QX or 482913), next to
// a coupon word, and with no login or verification words nearby.
const COUPON_SHAPE = /^[A-Z]{3,}[A-Z0-9]*$/;
const COUPON_MAX_DIGITS = 4;
const COUPON_WORDS = /\b(?:coupons?|promo|discount|vouchers?|offers?|cashback|off)\b/i;
const NOT_NEAR_COUPON =
  /\b(?:o\.?t\.?p|verify|verification|log[\s-]?in|sign[\s-]?in|passwords?|passcode|pins?|token|key|auth\w*)\b/i;
const COUPON_WINDOW = 60;

function isCoupon(text, span) {
  const code = text.slice(span.start, span.end);
  const digits = code.replace(/\D/g, "").length;
  if (!COUPON_SHAPE.test(code) || digits > COUPON_MAX_DIGITS) return false;
  const nearby = text.slice(Math.max(0, span.start - COUPON_WINDOW), span.end + COUPON_WINDOW);
  return COUPON_WORDS.test(nearby) && !NOT_NEAR_COUPON.test(nearby);
}

function findOtps(text, otpEmail) {
  if (otpEmail) return findCodes(text);
  const spans = [];
  for (const match of text.matchAll(WEAK_OTP_WORDS)) {
    const from = Math.max(0, match.index - WINDOW_BEFORE);
    const to = Math.min(text.length, match.index + match[0].length + WINDOW_AFTER);
    spans.push(...findCodes(text, from, to));
  }
  return spans.filter((span) => !isCoupon(text, span));
}

// Keeps the earliest span, and the longest when two start together, so a
// code inside a link is covered by the link. On a tie the earlier span in the
// list wins.
function removeOverlaps(spans) {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  for (const span of sorted) {
    if (kept.length === 0 || span.start >= kept[kept.length - 1].end) kept.push(span);
  }
  return kept;
}

export function isOtpEmail(text) {
  return STRONG_OTP_WORDS.test(normaliseDigits(text));
}

export function redactText(text, { otpEmail = isOtpEmail(text) } = {}) {
  const normalised = normaliseDigits(text);
  const identifiers = findIdentifiers(normalised);
  const otps = findOtps(normalised, otpEmail);
  // In an OTP email, "one-time password is 48291375" is an OTP, not a password.
  const ordered = otpEmail ? [...otps, ...identifiers] : [...identifiers, ...otps];
  const spans = removeOverlaps([...findLinks(normalised, otpEmail), ...ordered]);
  let output = "";
  let cursor = 0;
  for (const span of spans) {
    output += normalised.slice(cursor, span.start) + span.replacement;
    cursor = span.end;
  }
  output += normalised.slice(cursor);
  return {
    text: output,
    redactions: spans.map(({ type, start, end }) => ({ type, start, end })),
    // The rules are sure this text held a secret, so it is stored in strict mode.
    secretFound: otpEmail || spans.some((span) => SECRET_TYPES.has(span.type)),
  };
}

// A strong OTP word in either the subject or the body marks the whole email.
export function redactEmail({ subject = "", body = "" }) {
  const otpEmail = isOtpEmail(subject) || isOtpEmail(body);
  const redactedSubject = redactText(subject, { otpEmail });
  const redactedBody = redactText(body, { otpEmail });
  return {
    subject: redactedSubject.text,
    body: redactedBody.text,
    secretFound: redactedSubject.secretFound || redactedBody.secretFound,
    redactions: [
      ...redactedSubject.redactions.map((r) => ({ ...r, field: "subject" })),
      ...redactedBody.redactions.map((r) => ({ ...r, field: "body" })),
    ],
  };
}
