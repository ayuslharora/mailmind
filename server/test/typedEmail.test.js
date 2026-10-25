import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
const { default: TypedEmail } = await import("../models/typedEmail.model.js");
const { redactTyped, reportMiss } = await import("../controllers/typedEmail.controllers.js");
const { decrypt } = await import("../utils/crypto.js");

function fakeResponse() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => ((res.body = body), res);
  return res;
}

const CARD = "4111 1111 1111 1111";

test("a typed email comes back redacted, and only its encrypted original is saved", async () => {
  let saved = null;
  TypedEmail.create = async (doc) => ((saved = doc), { _id: "e1", ...doc });

  const res = fakeResponse();
  await redactTyped({ body: { subject: "Card details", body: `Your card ${CARD} is blocked. OTP 482913.` } }, res);

  assert.equal(res.statusCode, 201);
  assert.ok(!res.body.body.includes(CARD) && res.body.body.includes("[CARD]"));
  assert.equal(res.body.hidden.CARD, 1);
  assert.ok(res.body.redactions.every((r) => Object.keys(r).sort().join() === "end,field,start,type"), "positions only, never values");

  assert.ok(!saved.original.includes(CARD), "the original is not stored in plain text");
  assert.equal(JSON.parse(decrypt(saved.original)).body, `Your card ${CARD} is blocked. OTP 482913.`);
  assert.ok(!saved.body.includes(CARD));
});

test("an empty or oversized email is turned away", async () => {
  const empty = fakeResponse();
  await redactTyped({ body: { body: "   " } }, empty);
  assert.equal(empty.statusCode, 400);
  const huge = fakeResponse();
  await redactTyped({ body: { body: "x".repeat(5001) } }, huge);
  assert.equal(huge.statusCode, 400);
});

test("a reported miss is saved with its note encrypted", async () => {
  let update = null;
  TypedEmail.updateOne = async (filter, change) => ((update = change), { matchedCount: 1 });
  const res = fakeResponse();
  await reportMiss({ params: { id: "64b7f0c2a1b2c3d4e5f60718" }, body: { note: "missed 98765 43210" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(update.$set.reportedMiss, true);
  assert.equal(decrypt(update.$set.note), "missed 98765 43210");

  const bad = fakeResponse();
  await reportMiss({ params: { id: "not-an-id" }, body: {} }, bad);
  assert.equal(bad.statusCode, 404);
});
