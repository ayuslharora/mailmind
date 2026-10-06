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

const phones = {
  "receipt label with +91": ["Mobile Number +919876543210", "Mobile Number [PHONE]"],
  "spaced +91": ["Call us at +91 98765 43210.", "Call us at [PHONE]."],
  "label without country code": ["Phone: 9876543210", "Phone: [PHONE]"],
  "hyphenated international": ["WhatsApp +1-415-555-0100 for help", "WhatsApp [PHONE] for help"],
  "mob. no.": ["Mob. No. 98765-43210", "Mob. No. [PHONE]"],
};
for (const [name, [input, expected]] of Object.entries(phones)) {
  test(`phone hidden: ${name}`, () => assert.equal(redacted(input), expected));
}

test("unlabelled long numbers such as order IDs are kept", () => {
  assert.equal(redacted("Order ID 402123456789 shipped"), "Order ID 402123456789 shipped");
  assert.equal(redacted("Payment pay_Xk81Lm2QpZ captured"), "Payment pay_Xk81Lm2QpZ captured");
});

test("a phone number alone does not make the email strict", () => {
  const out = redactEmail({ subject: "Receipt", body: "Mobile Number +919876543210. Read https://blog.example.com/tips" });
  assert.equal(out.strict, false);
  assert.equal(out.body, "Mobile Number [PHONE]. Read https://blog.example.com/tips");
});
