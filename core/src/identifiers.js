// Finds Indian and payment identifiers: card numbers, Aadhaar, PAN, bank
// account numbers, PINs/CVVs and passwords written in plain text.
//
// Checksums (Luhn for cards, Verhoeff for Aadhaar) separate real identifiers
// from order and tracking numbers of the same length. About one random number
// in ten still passes a checksum; that over-redaction is accepted.

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function verhoeffValid(digits) {
  let check = 0;
  [...digits].reverse().forEach((digit, i) => {
    check = VERHOEFF_D[check][VERHOEFF_P[i % 8][Number(digit)]];
  });
  return check === 0;
}

export function luhnValid(digits) {
  let sum = 0;
  [...digits].reverse().forEach((digit, i) => {
    let value = Number(digit);
    if (i % 2 === 1) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
  });
  return sum % 10 === 0;
}

const onlyDigits = (s) => s.replace(/\D/g, "");

// Digits split by single spaces or hyphens, standing alone.
const CARD = /(?<![\w-])\d(?:[ -]?\d){12,18}(?![\w-])/g;
// Aadhaar never starts with 0 or 1, and is usually written 4-4-4.
const AADHAAR = /(?<![\w-])[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}(?![\w-])/g;
// Fourth letter is the holder type: P person, C company, H family, and so on.
const PAN = /\b[a-z]{3}[abcfghjlpt][a-z]\d{4}[a-z]\b/gi;
// A long number written after an account label: "A/c no. 123456789012".
const ACCOUNT = /\b(?:a\/c|acct|account)(?:\s*(?:no|num|number)\b\.?)?\s*[:#-]?\s*(\d(?:[ -]?\d){8,17})(?![\w-])/gid;
// "PIN code" is the Indian postal code, so it is not a secret.
const PIN = /\b(?:cvv2?|cvc|m-?pin|t-?pin|pin)\b(?!\s*-?\s*code)\s*(?:is\b|[:=-])?\s*(\d{2,8})(?![\w-])/gid;
// A password after "is", ":" or "=". \b only understands ASCII, so the Hindi
// word is matched on its own.
const PASSWORD =
  /(?:\b(?:password|passwd|pwd|passcode)\b|पासवर्ड)(?:\s+is\b\s*:?|\s*[:=-])\s*(\S{4,64})/gid;

// Words that can follow "password is" without being a password.
const NOT_A_PASSWORD = new Set([
  "about", "above", "below", "being", "case-sensitive", "changed", "correct", "different",
  "expired", "expiring", "incorrect", "invalid", "missing", "never", "required", "reset",
  "same", "still", "strong", "successfully", "temporary", "updated", "valid", "weak", "wrong",
  "your",
]);

function spansFromMatches(text, pattern, type, accept = () => true, group = 0) {
  const spans = [];
  for (const match of text.matchAll(pattern)) {
    if (!accept(match[group])) continue;
    const [start, end] = group === 0 ? [match.index, match.index + match[0].length] : match.indices[group];
    spans.push({ type, start, end, replacement: `[${type}]` });
  }
  return spans;
}

function looksLikePassword(token) {
  const word = token.replace(/[.,;:!?]+$/, "");
  return !(/^[a-z-]+$/.test(word) && NOT_A_PASSWORD.has(word));
}

export function findIdentifiers(text) {
  return [
    // First, so a labelled account number that happens to pass Luhn is still
    // called an account.
    ...spansFromMatches(text, ACCOUNT, "ACCOUNT", () => true, 1),
    ...spansFromMatches(text, CARD, "CARD", (m) => luhnValid(onlyDigits(m))),
    ...spansFromMatches(text, AADHAAR, "AADHAAR", (m) => verhoeffValid(onlyDigits(m))),
    ...spansFromMatches(text, PAN, "PAN"),
    ...spansFromMatches(text, PIN, "PIN", () => true, 1),
    ...spansFromMatches(text, PASSWORD, "PASSWORD", looksLikePassword, 1),
  ];
}

export const SECRET_TYPES = new Set(["CARD", "AADHAAR", "PAN", "ACCOUNT", "PIN", "PASSWORD"]);
