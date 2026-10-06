import { test } from "node:test";
import assert from "node:assert/strict";
import { luhnValid, verhoeffValid } from "../src/identifiers.js";
import { redactEmail, redactText } from "../src/redact.js";

const redacted = (text) => redactText(text).text;

test("checksums match published examples", () => {
  assert.equal(verhoeffValid("2363"), true);
  assert.equal(verhoeffValid("2364"), false);
  assert.equal(luhnValid("79927398713"), true);
  assert.equal(luhnValid("4111111111111112"), false);
});

const cards = {
  "Visa with spaces": ["Card 4111 1111 1111 1111 was charged", "Card [CARD] was charged"],
  "Visa with hyphens": ["Card 4111-1111-1111-1111 was charged", "Card [CARD] was charged"],
  "Visa unbroken": ["Card 4111111111111111 was charged", "Card [CARD] was charged"],
  "Amex 4-6-5": ["Amex 3782 822463 10005 saved", "Amex [CARD] saved"],
  "Mastercard": ["Use 5500 0000 0000 0004.", "Use [CARD]."],
  "Devanagari digits": ["कार्ड ४१११ ११११ ११११ ११११", "कार्ड [CARD]"],
};
for (const [name, [input, expected]] of Object.entries(cards)) {
  test(`card hidden: ${name}`, () => assert.equal(redacted(input), expected));
}

test("masked cards and last four digits are kept", () => {
  assert.equal(redacted("Card XXXX XXXX XXXX 1234 was charged"), "Card XXXX XXXX XXXX 1234 was charged");
  assert.equal(redacted("Your card ending 1234 was charged"), "Your card ending 1234 was charged");
});

test("a 16-digit number that fails Luhn is not called a card", () => {
  assert.ok(!redacted("Tracking 4111 1111 1111 1112").includes("[CARD]"));
});

const aadhaars = {
  "4-4-4 with spaces": ["Aadhaar: 2341 2341 2346", "Aadhaar: [AADHAAR]"],
  "unbroken": ["UID 234123412346 linked", "UID [AADHAAR] linked"],
  "with hyphens": ["Aadhaar 9876-5432-1096.", "Aadhaar [AADHAAR]."],
  "Devanagari digits": ["आधार २३४१ २३४१ २३४६", "आधार [AADHAAR]"],
};
for (const [name, [input, expected]] of Object.entries(aadhaars)) {
  test(`Aadhaar hidden: ${name}`, () => assert.equal(redacted(input), expected));
}

test("masked Aadhaar is kept", () => {
  assert.equal(redacted("Aadhaar XXXX XXXX 2346 verified"), "Aadhaar XXXX XXXX 2346 verified");
});

test("12-digit numbers that are not valid Aadhaar are not called Aadhaar", () => {
  assert.ok(!redacted("Ref 2341 2341 2340").includes("[AADHAAR]"), "fails Verhoeff");
  assert.ok(!redacted("Ref 1341 2341 2346").includes("[AADHAAR]"), "starts with 1");
});

const pans = {
  "uppercase": ["PAN: ABCPE1234F.", "PAN: [PAN]."],
  "lowercase": ["pan abcpe1234f", "pan [PAN]"],
  "company PAN": ["Company PAN AAACR5055K on file", "Company PAN [PAN] on file"],
};
for (const [name, [input, expected]] of Object.entries(pans)) {
  test(`PAN hidden: ${name}`, () => assert.equal(redacted(input), expected));
}

test("PAN-shaped codes with an impossible holder letter are kept", () => {
  assert.equal(redacted("Model ABCDE1234F in stock"), "Model ABCDE1234F in stock");
});

test("IFSC codes are public branch codes and are kept", () => {
  assert.equal(redacted("IFSC: SBIN0001234"), "IFSC: SBIN0001234");
});

const accounts = {
  "A/c no.": ["A/c no. 123456789012 credited", "A/c no. [ACCOUNT] credited"],
  "Account Number:": ["Account Number: 50100123456789", "Account Number: [ACCOUNT]"],
  "acct with spaces": ["acct 1234 5678 9012 debited", "acct [ACCOUNT] debited"],
};
for (const [name, [input, expected]] of Object.entries(accounts)) {
  test(`account number hidden: ${name}`, () => assert.equal(redacted(input), expected));
}

test("masked and short account references are kept", () => {
  assert.equal(redacted("A/c XX1234 debited"), "A/c XX1234 debited");
  assert.equal(redacted("Your account 4021 room booking"), "Your account 4021 room booking");
});

const pins = {
  "CVV": ["CVV 123", "CVV [PIN]"],
  "CVV with colon": ["CVV: 123", "CVV: [PIN]"],
  "UPI PIN is": ["Your UPI PIN is 4321", "Your UPI PIN is [PIN]"],
  "MPIN": ["MPIN 123456 set", "MPIN [PIN] set"],
  "ATM PIN": ["ATM PIN: 8642", "ATM PIN: [PIN]"],
  "two-digit PIN": ["Pin 42", "Pin [PIN]"],
  "temporary PIN (moved from the OTP tests)": [
    "Your temporary PIN is 7319, change it after first use.",
    "Your temporary PIN is [PIN], change it after first use.",
  ],
};
for (const [name, [input, expected]] of Object.entries(pins)) {
  test(`PIN hidden: ${name}`, () => assert.equal(redacted(input), expected));
}

test("postal PIN codes are kept", () => {
  for (const text of ["PIN code: 560001", "Pincode 560001", "PIN-code 560001", "PIN Code 110001, Delhi"]) {
    assert.equal(redacted(text), text);
  }
});

const passwords = {
  "temporary password is": ["Your temporary password is Xy7#pQ2!", "Your temporary password is [PASSWORD]"],
  "Password:": ["Password: hunter22", "Password: [PASSWORD]"],
  "pwd=": ["pwd=Secret@123", "pwd=[PASSWORD]"],
  "Password -": ["Password - Welcome@123 (change it)", "Password - [PASSWORD] (change it)"],
  "is:": ["Your new password is: tR0ub4dor", "Your new password is: [PASSWORD]"],
  "Hindi": ["पासवर्ड: Xy7pQ2zz", "पासवर्ड: [PASSWORD]"],
};
for (const [name, [input, expected]] of Object.entries(passwords)) {
  test(`password hidden: ${name}`, () => assert.equal(redacted(input), expected));
}

test("sentences about passwords are kept", () => {
  for (const text of [
    "Your password is changed.",
    "Your password has been reset",
    "Password is case-sensitive",
    "Your password is incorrect",
  ]) {
    assert.equal(redacted(text), text);
  }
});

test("secretFound is true for identifiers and OTP emails", () => {
  assert.equal(redactText("Card 4111 1111 1111 1111").secretFound, true);
  assert.equal(redactText("PAN ABCPE1234F").secretFound, true);
  assert.equal(redactText("Your OTP is 482913").secretFound, true);
  assert.equal(redactEmail({ subject: "Password: hunter22", body: "hi" }).secretFound, true);
});

test("secretFound is false for ordinary email", () => {
  assert.equal(redactText("Assignment 3 is due Friday 11:59pm").secretFound, false);
  assert.equal(redactEmail({ subject: "Hi", body: "See you at 5" }).secretFound, false);
});

test("several identifiers in one bank email", () => {
  const text =
    "Dear customer, Rs 2500 debited from A/c no. 123456789012 using card 4111 1111 1111 1111. " +
    "Beneficiary IFSC SBIN0001234. Never share your CVV 123 or OTP.";
  assert.equal(
    redacted(text),
    "Dear customer, Rs 2500 debited from A/c no. [ACCOUNT] using card [CARD]. " +
      "Beneficiary IFSC SBIN0001234. Never share your CVV [PIN] or OTP.",
  );
});
