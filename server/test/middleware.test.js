import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "test-secret";
process.env.ALLOWED_EMAILS = "me@example.com, Friend@Example.com";
const { default: User } = await import("../models/user.model.js");
const { default: isAuthenticated } = await import("../middlewares/auth.middleware.js");
const { default: errorMiddleware } = await import("../middlewares/error.middleware.js");

// A tiny stand-in for Express's response.
function fakeResponse() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => ((res.body = body), res);
  return res;
}

async function check(token, findById = async () => ({ _id: "u1", email: "me@example.com" })) {
  User.findById = () => ({ select: findById });
  const res = fakeResponse();
  let passedOn = null;
  await isAuthenticated({ cookies: token ? { token } : {} }, res, (err) => (passedOn = err ?? "ok"));
  return { res, passedOn };
}

test("a valid login goes through", async () => {
  const { passedOn } = await check(jwt.sign({ userId: "u1" }, "test-secret"));
  assert.equal(passedOn, "ok");
});

test("no login, an expired login and a foreign token each say so", async () => {
  assert.equal((await check(null)).res.body.message, "Login required");
  const expired = jwt.sign({ userId: "u1", exp: Math.floor(Date.now() / 1000) - 10 }, "test-secret");
  assert.equal((await check(expired)).res.body.message, "Your login has expired. Please sign in again.");
  const foreign = jwt.sign({ userId: "u1" }, "another-apps-secret");
  assert.equal((await check(foreign)).res.body.message, "Please sign in again.");
  assert.equal((await check(foreign)).res.statusCode, 401);
});

test("an account taken off the allowed list is cut off", async () => {
  const token = jwt.sign({ userId: "u1" }, "test-secret");
  const { res, passedOn } = await check(token, async () => ({ _id: "u1", email: "stranger@example.com" }));
  assert.equal(res.statusCode, 403);
  assert.equal(passedOn, null);
  assert.equal((await check(token, async () => ({ _id: "u2", email: "friend@example.com" }))).passedOn, "ok", "case does not matter");
});

// Seen live: a database outage was reported as "Invalid or expired token".
test("a database error is not reported as a bad login", async () => {
  const dbDown = Object.assign(new Error("connection refused"), { name: "MongooseServerSelectionError" });
  const { res, passedOn } = await check(jwt.sign({ userId: "u1" }, "test-secret"), async () => {
    throw dbDown;
  });
  assert.equal(passedOn, dbDown, "handed to the error middleware");
  assert.equal(res.body, null, "no 401 sent");

  const errorRes = fakeResponse();
  const quiet = console.error;
  console.error = () => {};
  errorMiddleware(dbDown, {}, errorRes, () => {});
  console.error = quiet;
  assert.equal(errorRes.statusCode, 503);
  assert.equal(errorRes.body.message, "Mailmind can't reach its database right now. Please try again in a minute.");
});

test("other errors stay generic, never showing internal details", () => {
  const res = fakeResponse();
  const quiet = console.error;
  console.error = () => {};
  errorMiddleware(new Error("secret internal detail"), {}, res, () => {});
  console.error = quiet;
  assert.equal(res.statusCode, 500);
  assert.ok(!JSON.stringify(res.body).includes("secret internal detail"));
});
