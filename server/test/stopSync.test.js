import { test } from "node:test";
import assert from "node:assert/strict";
import { clearStop, requestStop, stopRequested, SyncStopped, throwIfStopped } from "../utils/stopSync.js";

test("a stop request is seen until it is cleared", () => {
  requestStop("u1");
  assert.equal(stopRequested("u1"), true);
  assert.equal(stopRequested("u2"), false, "only that user");
  assert.throws(() => throwIfStopped("u1"), SyncStopped);
  clearStop("u1");
  assert.doesNotThrow(() => throwIfStopped("u1"));
});

test("a sync asked to stop does not start, so it never touches the database", async () => {
  const { syncUser, isSyncing } = await import("../utils/sync.js");
  requestStop("u3");
  // Not connected to MongoDB: if syncUser tried to read the user, this would hang.
  await syncUser("u3");
  assert.equal(isSyncing("u3"), false);
  clearStop("u3");
});
