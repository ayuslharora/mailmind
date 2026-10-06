import { test } from "node:test";
import assert from "node:assert/strict";
import { redactEmail, redactText } from "../src/redact.js";

const redacted = (text) => redactText(text).text;

// Coupon codes are kept so "find my Swiggy coupon" works in Ask your inbox.
const kept = {
  "use code": ["Use code SAVE50 to get 50% off your first order", "SAVE50"],
  "promo code with colon": ["Promo code: WELCOME100 - valid till 15 Oct", "WELCOME100"],
  "off with code": ["Extra ₹300 off with code MYNTRA300", "MYNTRA300"],
  "coupon": ["Apply coupon FLAT200 at checkout", "FLAT200"],
  "voucher code is": ["Your voucher code is NEWUSER25", "NEWUSER25"],
  "discount code on next line": ["Your discount code:\n\n  FEST40\n\nEnds Sunday.", "FEST40"],
  "cashback": ["Get 10% cashback with code PAYTM10 on your first payment", "PAYTM10"],
  "letters only": ["Use code TRYNEW, get 60% off", "TRYNEW"],
};
for (const [name, [text, code]] of Object.entries(kept)) {
  test(`coupon kept: ${name}`, () => assert.ok(redacted(text).includes(code), redacted(text)));
}

// Anything that could be a login code stays hidden, even next to coupon words.
const hidden = {
  "random letters and digits": ["Use code K7P9QX for 10% off", "K7P9QX"],
  "digits only": ["Use promo code 482913 at checkout", "482913"],
  "lowercase": ["use code save50 for 10% off", "save50"],
  "verify nearby": ["Use code SAVE50 to verify your email and get 10% off", "SAVE50"],
  "sign in nearby": ["Discount code ABC123 - enter it to sign in", "ABC123"],
  "no coupon word": ["Your code is SAVE50", "SAVE50"],
  "coupon word too far away": [
    "Big discount this weekend on all shoes, bags and watches across the store. Separately, your code is SAVE50",
    "SAVE50",
  ],
};
for (const [name, [text, code]] of Object.entries(hidden)) {
  test(`code hidden: ${name}`, () => assert.ok(!redacted(text).includes(code), redacted(text)));
}

test("an OTP email hides coupon codes too", () => {
  const out = redactEmail({ subject: "Your OTP", body: "OTP 482913. Use code SAVE50 for 10% off" });
  assert.ok(!out.body.includes("482913"), out.body);
  assert.ok(!out.body.includes("SAVE50"), out.body);
});

test("an OTP word only in the subject still hides the coupon", () => {
  const out = redactEmail({ subject: "Login code inside", body: "Use code SAVE50 for 10% off" });
  assert.ok(!out.body.includes("SAVE50"), out.body);
});
