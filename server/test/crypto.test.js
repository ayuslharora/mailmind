import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
const { decrypt, encrypt } = await import("../utils/crypto.js");

test("decrypt reverses encrypt", () => {
  assert.equal(decrypt(encrypt("1//0g-refresh-token")), "1//0g-refresh-token");
});

test("the same text encrypts differently each time", () => {
  assert.notEqual(encrypt("same"), encrypt("same"));
});

test("tampered ciphertext fails instead of returning garbage", () => {
  const [iv, tag, data] = encrypt("secret").split(".");
  const flipped = Buffer.from(data, "base64url");
  flipped[0] ^= 1;
  assert.throws(() => decrypt([iv, tag, flipped.toString("base64url")].join(".")));
});

test("a different key cannot decrypt", () => {
  const payload = encrypt("secret");
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  assert.throws(() => decrypt(payload));
});
