import { test } from "node:test";
import assert from "node:assert/strict";
import { google } from "googleapis";
import { listChanges } from "../utils/gmail.js";

// A fake Gmail that answers history.list with the given pages.
function fakeHistory(pages) {
  let call = 0;
  google.gmail = () => ({ users: { history: { list: async () => ({ data: pages[call++] }) } } });
}

const msg = (id, labelIds = ["INBOX"]) => ({ id, threadId: `t-${id}`, labelIds });

test("new mail is present, deleted mail is gone, and the latest event wins", async () => {
  fakeHistory([
    {
      history: [
        { messagesAdded: [{ message: msg("a") }, { message: msg("b") }, { message: msg("c") }] },
        { messagesDeleted: [{ message: msg("b") }] },
        { labelsAdded: [{ message: msg("c", ["TRASH"]), labelIds: ["TRASH"] }] },
      ],
      nextPageToken: "p2",
    },
    {
      history: [{ labelsRemoved: [{ message: msg("c", ["INBOX"]), labelIds: ["TRASH"] }] }],
      historyId: "999",
    },
  ]);
  const { changes, historyId } = await listChanges(null, "100");
  assert.equal(historyId, "999");
  assert.deepEqual(Object.fromEntries([...changes].map(([id, c]) => [id, c.present])), { a: true, b: false, c: true });
  assert.equal(changes.get("a").threadId, "t-a");
});

test("mail that arrives straight into spam is not stored", async () => {
  fakeHistory([{ history: [{ messagesAdded: [{ message: msg("s", ["SPAM"]) }] }], historyId: "5" }]);
  const { changes } = await listChanges(null, "1");
  assert.equal(changes.get("s").present, false);
});

test("other label changes (read, starred) are ignored", async () => {
  fakeHistory([{ history: [{ labelsAdded: [{ message: msg("r"), labelIds: ["STARRED"] }] }], historyId: "6" }]);
  const { changes, historyId } = await listChanges(null, "1");
  assert.equal(changes.size, 0);
  assert.equal(historyId, "6");
});

test("no changes keeps the old bookmark when Gmail sends none", async () => {
  fakeHistory([{}]);
  assert.equal((await listChanges(null, "42")).historyId, "42");
});
