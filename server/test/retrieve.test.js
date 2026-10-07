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
