import { test } from "node:test";
import assert from "node:assert/strict";
import { digestItems, digestKey, keepValidPoints } from "../utils/digest.js";

const item = (threadId) => ({ threadId, subject: "s", from: "f" });
const today = { urgent: [item("a")], needsAction: [item("b"), item("c")], comingUp: [], missed: [item("d")], other: [] };

test("items come most urgent section first, each marked with its section", () => {
  assert.deepEqual(
    digestItems(today).map((i) => `${i.section}:${i.threadId}`),
    ["urgent:a", "needsAction:b", "needsAction:c", "missed:d"],
  );
});

test("the key changes when the items change, so the briefing is made again", () => {
  const before = digestKey(digestItems(today));
  const after = digestKey(digestItems({ ...today, needsAction: [item("b")] }));
  assert.notEqual(before, after);
  assert.equal(before, digestKey(digestItems(today)));
});

test("points about unknown items are dropped, and each item is mentioned once", () => {
  const items = digestItems(today);
  const points = [
    { threadId: "b", text: "Pay the bill" },
    { threadId: "zzz", text: "Made up" },
    { threadId: "b", text: "Again" },
    { threadId: "a", text: "Check the login alert" },
  ];
  assert.deepEqual(keepValidPoints(points, items).map((p) => p.threadId), ["b", "a"]);
});
