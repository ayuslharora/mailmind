// Problems found by running the redaction on a real inbox (7 October 2026).
// Every value here is made up; only the shape matches the real email.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isOtpEmail, redactEmail, redactText } from "../src/redact.js";

const redacted = (text) => redactText(text).text;

test("OTP words inside a tracking link do not make the email an OTP email", () => {
  const body =
    "Keep your streak alive! https://links.example.com/ls/click?upn=u001.x7-otp-Q2fa9mfaK " +
    "Example Inc | PO Box 970000 Springfield, UT 84000 © 2026";
  assert.equal(isOtpEmail(body), false);
  const out = redactEmail({ subject: "You're on a 2 day streak!", body });
  assert.equal(out.strict, false);
  assert.ok(out.body.includes("PO Box 970000"), out.body);
  assert.ok(out.body.includes("© 2026"), out.body);
});

test("recovery and backup codes mark an OTP email", () => {
  assert.equal(isOtpEmail("12345678 is your Instagram recovery code"), true);
  assert.equal(isOtpEmail("Here are your backup codes"), true);
  assert.equal(redactEmail({ subject: "12345678 is your recovery code", body: "Hi" }).strict, true);
});

test("IP addresses are hidden whole", () => {
  assert.equal(redacted("**IP Address:** 203.0.113.44\n\n**Location:** Bengaluru"), "**IP Address:** [IP]\n\n**Location:** Bengaluru");
  assert.equal(redacted("Login from 198.51.100.7."), "Login from [IP].");
});

test("dates and version numbers with dots are not IP addresses", () => {
  assert.equal(redacted("Due 15.10.2026"), "Due 15.10.2026");
  assert.equal(redacted("Released v1.2.3"), "Released v1.2.3");
});

test("CamelCase words in a link path are kept", () => {
  assert.equal(
    redacted("Built by https://github.com/SharkStudios/StarBuddy/tree/main"),
    "Built by https://github.com/SharkStudios/StarBuddy/tree/main",
  );
});
