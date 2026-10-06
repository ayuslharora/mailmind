import { test } from "node:test";
import assert from "node:assert/strict";
import { redactEmail, redactText } from "../src/redact.js";

const redacted = (text) => redactText(text).text;

// Every code here must disappear. If one survives, a secret could reach an AI provider.
const OTP_CASES = [
  ["Indian bank", "OTP for txn of Rs 500.00 at AMAZON is 482913. Valid for 10 mins. Do not share.", "482913"],
  ["code first", "482913 is your Instagram code. Don't share it.", "482913"],
  ["Google prefix", "G-482913 is your Google verification code.", "482913"],
  ["hyphenated", "Use 482-913 to verify your email address.", "482-913"],
  ["spaced digits", "Enter this code: 4 8 2 9 1 3", "4 8 2 9 1 3"],
  ["4 digits", "Your Microsoft security code is 4829", "4829"],
  ["8 digits", "Your one-time password is 48291375", "48291375"],
  ["alphanumeric", "Your login code: K7P9QX", "K7P9QX"],
  ["spelled out", "Your passcode is four eight two nine one three.", "four eight two nine one three"],
  ["code on next line", "Here is your sign-in code\n\n   551077\n\nIt expires in 10 minutes.", "551077"],
  ["far from keyword in OTP email", "Your OTP is below. We sent it because someone tried to sign in from a new device in Mumbai at 10:42. If that was you, enter the number on the screen to continue: 902211", "902211"],
];

for (const [name, text, secret] of OTP_CASES) {
  test(`OTP removed: ${name}`, () => {
    const out = redacted(text);
    assert.ok(!out.includes(secret), `"${secret}" survived in: ${out}`);
    assert.ok(out.includes("[OTP]"));
  });
}

test("OTP removed when only the subject says it is a code", () => {
  const out = redactEmail({ subject: "Your verification code", body: "Hi Ayush,\n\n638104\n\nThanks" });
  assert.ok(!out.body.includes("638104"), out.body);
});

// Ordinary emails should keep their numbers: these are not secrets.
const KEEP_CASES = [
  ["deadline time", "Assignment 3 is due Friday 11:59pm in room 4021.", ["11:59", "4021"]],
  ["order number", "Your order #4093381 has shipped and will arrive on 12 Oct.", ["4093381"]],
  ["price", "The course costs Rs 2500 and starts on 15 October 2026.", ["2500", "2026"]],
];

for (const [name, text, kept] of KEEP_CASES) {
  test(`numbers kept: ${name}`, () => {
    const out = redacted(text);
    for (const value of kept) assert.ok(out.includes(value), `"${value}" was removed from: ${out}`);
  });
}

// Links that could log someone in or act on their behalf must go.
const RISKY_LINKS = [
  ["password reset", "Reset here: https://accounts.example.com/reset?token=abc123XYZ", "token=abc123XYZ"],
  ["magic link", "Sign in with this link: https://app.example.com/l/x7Kq9Pz", "x7Kq9Pz"],
  ["verify path", "Confirm your email: https://example.com/verify/eyJhbGciOiJIUzI1NiJ9", "eyJhbGciOiJIUzI1NiJ9"],
  ["numeric code in path", "Open https://example.com/c/482913 to continue", "482913"],
  ["unsubscribe", "Unsubscribe: https://news.example.com/unsubscribe/u-1029", "unsubscribe/u-1029"],
  ["credentials in URL", "Server: https://admin:hunter2@internal.example.com/dashboard", "hunter2"],
  ["no scheme", "Go to example.com/reset-password?id=99812 now", "id=99812"],
  ["plain http", "Visit http://example.com/blog/post-title", "http://example.com/blog/post-title"],
];

for (const [name, text, secret] of RISKY_LINKS) {
  test(`risky link removed: ${name}`, () => {
    const out = redacted(text);
    assert.ok(!out.includes(secret), `"${secret}" survived in: ${out}`);
    assert.match(out, /\[LINK:[a-z0-9.-]+\]/);
  });
}

test("risky link keeps its domain for classification", () => {
  assert.equal(
    redacted("Reset: https://www.Accounts.Google.com/reset?t=1."),
    "Reset: [LINK:accounts.google.com].",
  );
});

// Newsletter and blog links stay usable; only their tracking query is dropped.
const SAFE_LINKS = [
  ["blog post", "New post: https://blog.example.com/posts/how-to-build-a-rag-app", "https://blog.example.com/posts/how-to-build-a-rag-app"],
  ["tracking query dropped", "Read it: https://example.substack.com/p/why-jev-matters?utm_source=email&r=2x9k", "https://example.substack.com/p/why-jev-matters"],
  ["dated path", "Story: https://news.example.com/2026/10/campus-placements-open.", "https://news.example.com/2026/10/campus-placements-open"],
  ["in parentheses", "Docs (https://docs.example.com/guide/getting-started) explain it.", "https://docs.example.com/guide/getting-started"],
];

for (const [name, text, expected] of SAFE_LINKS) {
  test(`safe link kept: ${name}`, () => {
    const out = redacted(text);
    assert.ok(out.includes(expected), `expected ${expected} in: ${out}`);
    assert.ok(!out.includes("utm_source"), out);
  });
}

test("all links removed in an OTP email, even content links", () => {
  const out = redacted("Your OTP is 482913. Learn more at https://bank.example.com/help/otp-safety");
  assert.ok(!out.includes("https://"), out);
});

test("email addresses are not treated as links", () => {
  assert.equal(redacted("Mail placement@college.edu for details."), "Mail placement@college.edu for details.");
});

test("redaction positions point at the original text", () => {
  const text = "Code: 482913";
  const [span] = redactText(text).redactions;
  assert.equal(text.slice(span.start, span.end), "482913");
});
