import { findDate, redactEmail } from "@mailmind/core";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import { decrypt } from "./crypto.js";
import { createOAuthClient, getMessage, getProfile, listMessagePage } from "./gmail.js";
import { classifyPending, updateThreads } from "./classifyThreads.js";

// Last 30 days, without spam and trash. Sent mail is included for context.
const BACKFILL_QUERY = "newer_than:30d -in:spam -in:trash";
const PAGE_SIZE = 100;
// Emails read from Gmail at once; Gmail allows about 50 reads a second per user.
const BATCH_SIZE = 10;

// Users whose sync is running in this process, so a second click does not
// start a second sync. Render runs one instance, so memory is enough.
const running = new Set();

export const isSyncing = (userId) => running.has(String(userId));

export function gmailAuthFor(user) {
  const auth = createOAuthClient();
  auth.setCredentials({ refresh_token: decrypt(user.encryptedRefreshToken) });
  return auth;
}

// Redacts one email and finds its dates. The original text exists only
// inside this function; what it returns is what gets stored. strict: the
// classifier said it is a security email.
export function toStoredMessage(userId, email, { strict = false } = {}) {
  const result = redactEmail(email, { strict });
  const raw = `${email.subject}\n${email.body}`;
  const deadline = findDate(raw, { sentAt: email.date, kind: "deadline" });
  const event = findDate(raw, { sentAt: email.date, kind: "event" });

  const hidden = {};
  for (const r of result.redactions) {
    if (r.type !== "LINK_TRIMMED") hidden[r.type] = (hidden[r.type] ?? 0) + 1;
  }

  return {
    userId,
    gmailId: email.id,
    threadId: email.threadId,
    from: email.from,
    fromMe: email.labelIds.includes("SENT"),
    date: email.date,
    subject: result.subject,
    body: result.body,
    strict: result.strict,
    hidden,
    labelIds: email.labelIds,
    bulkSender: email.bulkSender,
    deadlineAt: deadline?.dueAt,
    deadlineHasTime: deadline?.hasTime,
    eventAt: event?.dueAt,
    eventHasTime: event?.hasTime,
  };
}

// Reads and stores the emails not stored yet. Returns their thread IDs.
async function saveMessages(auth, userId, ids) {
  const stored = await Message.find({ userId, gmailId: { $in: ids } }, "gmailId");
  const storedIds = new Set(stored.map((m) => m.gmailId));
  const newIds = ids.filter((id) => !storedIds.has(id));

  const threadIds = [];
  for (let i = 0; i < newIds.length; i += BATCH_SIZE) {
    const emails = await Promise.all(newIds.slice(i, i + BATCH_SIZE).map((id) => getMessage(auth, id)));
    threadIds.push(...emails.map((email) => email.threadId));
    await Message.bulkWrite(
      emails.map((email) => ({
        updateOne: {
          filter: { userId, gmailId: email.id },
          update: { $set: toStoredMessage(userId, email) },
          upsert: true,
        },
      })),
    );
  }
  return threadIds;
}

// Fetches the last 30 days page by page. Progress is saved after every page,
// so if the server restarts, the next run carries on from the same page.
export async function backfill(userId) {
  const key = String(userId);
  if (running.has(key)) return;
  running.add(key);

  try {
    const user = await User.findById(userId);
    const auth = gmailAuthFor(user);

    // Gmail's bookmark from before the backfill: incremental sync starts here,
    // so mail that arrives during the backfill is not missed.
    if (!user.sync?.historyId) {
      const { historyId } = await getProfile(auth);
      await User.updateOne({ _id: userId }, { "sync.historyId": historyId });
    }

    let pageToken = user.sync?.backfillPageToken ?? undefined;
    do {
      const page = await listMessagePage(auth, { query: BACKFILL_QUERY, pageToken, pageSize: PAGE_SIZE });
      await updateThreads(userId, await saveMessages(auth, userId, page.ids));
      // Not awaited: classification starts on the newest threads while
      // older pages are still being fetched.
      classifyPending(userId);
      pageToken = page.nextPageToken;
      await User.updateOne({ _id: userId }, { "sync.backfillPageToken": pageToken ?? null, "sync.lastError": null });
    } while (pageToken);

    await User.updateOne({ _id: userId }, { "sync.backfillDone": true, "sync.lastSyncedAt": new Date() });
  } catch (err) {
    // invalid_grant: access was revoked, or Google's 7-day limit for apps in
    // testing ran out. The user has to sign in again.
    const reconnect = err.response?.data?.error === "invalid_grant" || /invalid_grant/.test(err.message);
    await User.updateOne({ _id: userId }, { "sync.lastError": reconnect ? "reconnect" : err.message });
    console.error(`Sync failed for user ${key}: ${reconnect ? "reconnect needed" : err.message}`);
  } finally {
    running.delete(key);
  }
}
