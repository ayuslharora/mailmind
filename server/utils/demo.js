// The demo inbox in the database: one shared account that anyone can look at
// without signing in (routes/demo.routes.js). Set up once by
// scripts/seed-demo.js, then moved to today on the first visit of each day.
import Message from "../models/message.model.js";
import Thread from "../models/thread.model.js";
import User from "../models/user.model.js";
import { pickDueAt, SECURITY_P } from "./classify.js";
import { CONTEXT_MESSAGES } from "./classifyThreads.js";
import { dayInIndia, daysBetween, DEMO_GOOGLE_ID, demoEmails } from "./demoInbox.js";
import { indexMessages } from "./indexMessages.js";
import { toStoredMessage } from "./sync.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Stores the inbox as it reads today. Redaction and date finding run again
// (both on this server, no AI); the classifier's answers are kept, since
// only the dates changed. days: how far the inbox moved since it was last
// stored, so the time each thread was classified moves with it ("What the AI
// saw" is rebuilt as of then). Returns the stored message IDs.
export async function storeDemoInbox(userId, now = new Date(), days = 0) {
  const threads = await Thread.find({ userId });
  const strict = new Set(threads.filter((t) => t.classification?.securityP >= SECURITY_P).map((t) => t.threadId));
  const emails = demoEmails(now);

  await Message.bulkWrite(
    emails.map((email) => ({
      updateOne: {
        filter: { userId, gmailId: email.id },
        update: { $set: toStoredMessage(userId, email, { strict: strict.has(email.threadId) }) },
        upsert: true,
      },
    })),
  );

  for (const thread of threads) {
    const messages = await Message.find({ userId, threadId: thread.threadId }).sort({ date: -1 }).limit(CONTEXT_MESSAGES);
    if (messages.length === 0) continue;
    const c = thread.classification;
    const update = { lastMessageAt: messages[0].date };
    if (c?.classifiedAt) {
      Object.assign(update, pickDueAt(messages, c), {
        "classification.classifiedAt": new Date(c.classifiedAt.getTime() + days * DAY_MS),
      });
    }
    await Thread.updateOne({ _id: thread._id }, { $set: update });
  }
  return emails.map((email) => email.id);
}

async function moveToToday(user, now) {
  const today = dayInIndia(now);
  const gmailIds = await storeDemoInbox(user._id, now, daysBetween(user.demoDay, today));
  await User.updateOne({ _id: user._id }, { demoDay: today });
  // Every chunk carries its email's date in its text, so the chunks are made
  // again, with new embeddings. In the background: the inbox works meanwhile.
  indexMessages(user._id, gmailIds).catch((err) => console.error(`Demo re-indexing failed: ${err.message}`));
}

// One move at a time: visitors who arrive during it wait for the same one.
let moving = null;

// The demo account, moved to today first if a new day has started in India.
// null until scripts/seed-demo.js has run.
export async function loadDemoUser(now = new Date()) {
  const user = await User.findOne({ googleId: DEMO_GOOGLE_ID }).select("-encryptedRefreshToken");
  if (!user?.demoDay) return null;
  if (user.demoDay === dayInIndia(now)) return user;
  moving ??= moveToToday(user, now).finally(() => (moving = null));
  await moving;
  return User.findById(user._id).select("-encryptedRefreshToken");
}
