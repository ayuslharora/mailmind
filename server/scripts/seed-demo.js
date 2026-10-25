// Sets up the demo inbox (utils/demo.js): one account anyone can look at
// without signing in, holding the fake emails of eval/classifier/cases.json,
// put through the real pipeline: redaction, the classifier (Jev, one call
// per thread that the rules do not settle) and embeddings for Ask.
//
//   npm run seed-demo --workspace server
//   npm run seed-demo --workspace server -- --fresh   (start again from nothing)
//
// Without --fresh, a second run only classifies the threads that are not done
// yet, so a run cut short by an AI limit can carry on without paying again.

import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "util";
import Chunk from "../models/chunk.model.js";
import Thread from "../models/thread.model.js";
import User from "../models/user.model.js";
import { classifyPending, updateThreads } from "../utils/classifyThreads.js";
import { deleteAccount } from "../utils/deleteAccount.js";
import { storeDemoInbox } from "../utils/demo.js";
import { dayInIndia, daysBetween, DEMO_EMAIL, DEMO_GOOGLE_ID, demoEmails } from "../utils/demoInbox.js";
import { indexMessages } from "../utils/indexMessages.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, "../.env"),
  quiet: true,
});

const { values: args } = parseArgs({ options: { fresh: { type: "boolean", default: false } } });

await mongoose.connect(process.env.MONGODB_URI, { dbName: "mailmind" });

const existing = await User.findOne({ googleId: DEMO_GOOGLE_ID });
if (existing && args.fresh) {
  await deleteAccount(existing._id);
  console.log("Deleted the old demo inbox");
}

const now = new Date();
// No Gmail token: the scheduled sync and "Sync now" never touch it.
const user =
  (!args.fresh && existing) ||
  (await User.create({
    googleId: DEMO_GOOGLE_ID,
    email: DEMO_EMAIL,
    name: "Aarav Sharma",
    sync: { backfillDone: true, lastSyncedAt: now },
  }));

// A run on a later day moves the inbox, as the first visit of a day would.
const gmailIds = await storeDemoInbox(user._id, now, daysBetween(user.demoDay ?? dayInIndia(now), dayInIndia(now)));
await updateThreads(user._id, [...new Set(demoEmails(now).map((email) => email.threadId))]);
console.log(`Stored ${gmailIds.length} emails`);

await classifyPending(user._id);
const statuses = await Thread.aggregate([{ $match: { userId: user._id } }, { $group: { _id: "$status", n: { $sum: 1 } } }]);
const sources = await Thread.aggregate([
  { $match: { userId: user._id, status: "classified" } },
  { $group: { _id: "$classification.source", n: { $sum: 1 } } },
]);
console.log("Threads:", Object.fromEntries(statuses.map((s) => [s._id, s.n])));
console.log("Classified by:", Object.fromEntries(sources.map((s) => [s._id, s.n])));

const chunks = await indexMessages(user._id, gmailIds);
console.log(`Indexed ${chunks} chunks for Ask (${await Chunk.countDocuments({ userId: user._id })} stored)`);

await User.updateOne({ _id: user._id }, { demoDay: dayInIndia(now) });
console.log(`Demo inbox ready for ${dayInIndia(now)}`);

await mongoose.disconnect();
