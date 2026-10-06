import { test } from "node:test";
import assert from "node:assert/strict";
import { redactEmail } from "../src/redact.js";

// Strict mode hides every code-shaped number and every link. It is used when
// the rules are sure the email holds a secret, or when the classifier says it
// is a security email.

test("an ordinary email is stored light", () => {
  const out = redactEmail({ subject: "Weekly reading", body: "Ref 4093381. Read https://blog.example.com/tips" });
  assert.equal(out.strict, false);
  assert.equal(out.body, "Ref 4093381. Read https://blog.example.com/tips");
});

test("a card anywhere makes the whole email strict", () => {
  const out = redactEmail({
    subject: "Payment received",
    body: "Card 4111 1111 1111 1111 charged. Ref 4093381. Read https://blog.example.com/tips",
  });
  assert.equal(out.strict, true);
  assert.equal(out.secretFound, true);
  assert.equal(out.body, "Card [CARD] charged. Ref [OTP]. Read [LINK:blog.example.com]");
});

test("a secret in the subject makes the body strict", () => {
  const out = redactEmail({ subject: "PAN ABCPE1234F linked", body: "See https://blog.example.com/tips" });
  assert.equal(out.strict, true);
  assert.equal(out.body, "See [LINK:blog.example.com]");
});

test("an OTP email is strict", () => {
  const out = redactEmail({ subject: "Your OTP", body: "482913" });
  assert.equal(out.strict, true);
  assert.equal(out.secretFound, true);
});

test("strict can be requested when the classifier flags a security email", () => {
  const out = redactEmail(
    { subject: "New device", body: "Ref 4093381. Details at https://blog.example.com/tips" },
    { strict: true },
  );
  assert.equal(out.strict, true);
  assert.equal(out.secretFound, false, "the rules themselves found nothing");
  assert.equal(out.body, "Ref [OTP]. Details at [LINK:blog.example.com]");
});
