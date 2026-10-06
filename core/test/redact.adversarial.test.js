// Cases written to break redact.js: real-world formats the first test file
// did not anticipate. Each one must hold before email text can leave the server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { redactEmail, redactText } from "../src/redact.js";

const redacted = (text) => redactText(text).text;

const mustRemove = (name, text, secret) =>
  test(`adversarial OTP: ${name}`, () => {
    const out = redacted(text);
    assert.ok(!out.includes(secret), `"${secret}" survived in: ${out}`);
  });

// Codes with no trigger word at all
mustRemove("no keyword, 'to log in'", "Use 482913 to log in to Slack.", "482913");
mustRemove("no keyword, 'to sign in'", "Use 771204 to sign in. It expires in 5 minutes.", "771204");
mustRemove("'one time pass'", "Your one time pass is 482913", "482913");
mustRemove("'security key'", "Your security key: 4829-1375", "4829-1375");
mustRemove("'O.T.P.' with dots", "Your O.T.P. is 482913, valid for 3 minutes", "482913");
mustRemove("'login password' digits", "Your login password is 90817264", "90817264");

// Unusual code shapes inside an OTP email
mustRemove("dotted code", "Your OTP is 482.913", "482.913");
mustRemove("double spaces from an HTML table", "Your OTP is 4  8  2  9  1  3", "4  8  2  9  1  3");
mustRemove("lowercase alphanumeric", "Your verification code is k7p9qx", "k7p9qx");
mustRemove("grouped letters and digits", "Your security code: 7XK-2PQ", "7XK-2PQ");
mustRemove("'double' in spelled code", "Your passcode is four eight double two nine", "double two");
mustRemove("full-width digits", "Your OTP is ４８２９１３", "４８２９１３");
mustRemove("Devanagari digits", "आपका OTP ४८२९१३ है। इसे किसी से साझा न करें।", "४८२९१३");
mustRemove("Hindi sentence, ASCII digits", "आपका ओटीपी 482913 है", "482913");
mustRemove("9-digit code", "Your OTP is 482913750", "482913750");

test("adversarial OTP: code only in the subject, empty body", () => {
  const out = redactEmail({ subject: "482913 is your Uber code", body: "" });
  assert.ok(!out.subject.includes("482913"), out.subject);
});

// Links that are dangerous but do not look dangerous
const mustRedactLink = (name, text, secret) =>
  test(`adversarial link: ${name}`, () => {
    const out = redacted(text);
    assert.ok(!out.includes(secret), `"${secret}" survived in: ${out}`);
  });

mustRedactLink("URL shortener", "Log in here: https://bit.ly/3xYzAbC", "3xYzAbC");
mustRedactLink("short shortener path", "Tap https://t.co/aB9 to continue", "t.co/aB9");
mustRedactLink("mixed-case letters-only token", "Open https://app.example.com/s/qWeRtYuIoP", "qWeRtYuIoP");
mustRedactLink("hyphenated short token", "Continue: https://app.example.com/m/a1b2-c3d4-e5f6", "a1b2-c3d4-e5f6");
mustRedactLink("URL broken across lines", "Reset: https://example.com/reset?tok\nen=abc123secret", "abc123secret");
mustRedactLink("percent-encoded URL", "Link: https%3A%2F%2Fexample.com%2Freset%3Ftoken%3Dabc123secret", "abc123secret");
mustRedactLink("Zoom link with meeting ID", "Join https://zoom.us/j/98765432101?pwd=Zx81", "98765432101");
mustRedactLink("Google Doc share link", "Doc: https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit", "1AbCdEfGhIjKlMnOpQrStUvWxYz");
mustRedactLink("markdown link", "[Reset](https://example.com/reset?t=abc123secret)", "abc123secret");
mustRedactLink("uppercase scheme", "HTTPS://EXAMPLE.COM/RESET?T=ABC123SECRET", "ABC123SECRET");
mustRedactLink("login subdomain", "https://login.example.com/start", "login.example.com/start");

// Content links that must survive
const mustKeepLink = (name, text, expected) =>
  test(`adversarial keep: ${name}`, () => {
    const out = redacted(text);
    assert.ok(out.includes(expected), `expected ${expected} in: ${out}`);
  });

mustKeepLink("YouTube video", "Watch: https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube.com");
mustKeepLink("GitHub repo", "Repo: https://github.com/langchain-ai/langchainjs", "https://github.com/langchain-ai/langchainjs");
mustKeepLink("Medium article with ID suffix", "Read https://medium.com/@author/how-rag-works-3f2a1b9c8d7e", "medium.com");
mustKeepLink("anchor to a section", "See https://docs.example.com/guide#install", "https://docs.example.com/guide");

// Ordinary numbers that should survive
const mustKeep = (name, text, value) =>
  test(`adversarial keep number: ${name}`, () => {
    assert.ok(redacted(text).includes(value), `"${value}" removed from: ${redacted(text)}`);
  });

mustKeep("Pincode is not a PIN", "Ship to Pincode: 560001, Bengaluru", "560001");
mustKeep("course code", "Course CS3021 starts Monday", "CS3021");

test("password in plain text", () => {
  assert.ok(!redacted("Your temporary password is Xy7#pQ2!").includes("Xy7#pQ2!"));
});
