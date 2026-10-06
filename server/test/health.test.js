import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import app from "../app.js";

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => server.close());

test("GET /health returns ok", async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test("unknown routes return 404 as JSON", async () => {
  const res = await fetch(`${baseUrl}/nope`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { message: "Not found" });
});

test("does not reveal Express in headers", async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.headers.get("x-powered-by"), null);
});
