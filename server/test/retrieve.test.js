import { test } from "node:test";
import assert from "node:assert/strict";
import { fuseRankings } from "../utils/retrieve.js";

const chunk = (id) => ({ _id: id });

test("a chunk found by both searches beats one found by a single search", () => {
  const byMeaning = [chunk("a"), chunk("b"), chunk("c")];
  const byWords = [chunk("c"), chunk("d")];
  const ids = fuseRankings([byMeaning, byWords]).map((c) => c._id);
  assert.deepEqual(ids.slice(0, 2), ["c", "a"]);
  // b and d are both second in one list: they tie.
  assert.deepEqual(ids.slice(2).sort(), ["b", "d"]);
});

test("one empty search leaves the other's order", () => {
  assert.deepEqual(fuseRankings([[chunk("x"), chunk("y")], []]).map((c) => c._id), ["x", "y"]);
});

test("a due date reads the way the Today view shows it", async () => {
  const { dueLine } = await import("../utils/retrieve.js");
  const dueAt = new Date("2026-10-27T17:00:00+05:30");
  assert.equal(dueLine({ dueAt, dueHasTime: true, dateKind: "deadline" }), "Due: Tue, 27 Oct, 5:00 pm");
  assert.equal(dueLine({ dueAt, dueHasTime: false, dateKind: "event" }), "Event: Tue, 27 Oct");
});

test("'what's due' lists every email with a date in the range, soonest first, each with its date", async () => {
  const { default: Thread } = await import("../models/thread.model.js");
  const { default: Chunk } = await import("../models/chunk.model.js");
  const { listDue } = await import("../utils/retrieve.js");
  const now = new Date("2026-10-25T12:00:00+05:30");
  let query = null;
  const threads = [
    { latestMessageId: "m2", dueAt: new Date("2026-10-26T23:59:59+05:30"), dueHasTime: false, classification: { dateKind: "deadline" } },
    { latestMessageId: "m1", dueAt: new Date("2026-10-27T17:00:00+05:30"), dueHasTime: true, classification: { dateKind: "event" } },
  ];
  Thread.find = (q) => ((query = q), { sort: () => ({ limit: async () => threads }) });
  Chunk.find = () => ({ lean: async () => [{ gmailId: "m1", text: "From: B" }, { gmailId: "m2", text: "From: A" }] });

  const chunks = await listDue("u1", {}, now);
  assert.deepEqual(chunks.map((c) => c.text), ["Due: Mon, 26 Oct\nFrom: A", "Event: Tue, 27 Oct, 5:00 pm\nFrom: B"]);
  assert.equal(query.dueAt.$gte, now, "from now when no start is given");
  assert.equal(query.dueAt.$lte.getTime() - now.getTime(), 14 * 24 * 60 * 60 * 1000, "the next two weeks");
  assert.deepEqual(query.state, { $ne: "done" });
  assert.deepEqual(query["classification.category"], { $ne: "promos" }, "a sale ending tonight is not due");
});
