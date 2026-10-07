// Runs Jev on the same redacted state gpt-oss-20b classified, for every
// thread of one user, and compares the two. Nothing in the app changes.
//
//   npm run compare-classifiers --workspace server -- --email you@gmail.com
//
// Writes compare-results.json (thread IDs and answers only, no email text;
// ignored by git) and prints a summary. Disagreements are the threads worth
// labelling by hand first.

import dotenv from "dotenv";
import fs from "fs";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "util";
import Message from "../models/message.model.js";
import Thread from "../models/thread.model.js";
import User from "../models/user.model.js";
import { buildState, NEEDS_ACTION_P, SECURITY_P } from "../utils/classify.js";
import { classifyState as classifyWithJev, SOURCE as JEV } from "../utils/classifierJev.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, "../.env"),
  quiet: true,
});

const { values: args } = parseArgs({ options: { email: { type: "string" } } });

const requiredEnvVars = ["MONGODB_URI", "OPENROUTER_API_KEY"];
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0 || !args.email) {
  console.error(missingEnvVars.length ? `Missing: ${missingEnvVars.join(", ")}` : "Usage: --email you@gmail.com");
  process.exit(1);
}

const CONTEXT_MESSAGES = 3;

const summary = (a) => ({
  category: a.category,
  needsAction: a.needsActionP >= NEEDS_ACTION_P,
  needsActionP: a.needsActionP,
  security: a.securityP >= SECURITY_P,
  securityP: a.securityP,
  dateKind: a.dateKind,
  urgency: Math.round(a.urgency * 100) / 100,
});

const pct = (n, total) => `${n}/${total} (${Math.round((100 * n) / total)}%)`;

await mongoose.connect(process.env.MONGODB_URI, { dbName: "mailmind" });
const user = await User.findOne({ email: args.email.toLowerCase() });
if (!user) {
  console.error("No such user");
  process.exit(1);
}

// Threads the rules classified (OTP emails) never reach a model.
const threads = await Thread.find({ userId: user._id, status: "classified", "classification.source": { $ne: "rules" } });
const results = [];

for (const [i, thread] of threads.entries()) {
  const messages = await Message.find({ userId: user._id, threadId: thread.threadId })
    .sort({ date: -1 })
    .limit(CONTEXT_MESSAGES);
  const gpt = summary(thread.classification);
  let jev = null;
  try {
    jev = summary(await classifyWithJev(buildState(messages, thread.lastMessageAt)));
  } catch (err) {
    console.error(`Jev failed on one thread: ${err.message}`);
  }
  results.push({ threadId: thread.threadId, [thread.classification.source]: gpt, [JEV]: jev });
  process.stdout.write(`\rCompared ${i + 1}/${threads.length}`);
}
console.log();

fs.writeFileSync(path.join(__dirname, "../compare-results.json"), JSON.stringify(results, null, 2));

const both = results.filter((r) => r[JEV]);
const gptKey = Object.keys(both[0] ?? {}).find((k) => k !== "threadId" && k !== JEV);
const agree = (field) => both.filter((r) => r[gptKey][field] === r[JEV][field]).length;
const extreme = (source) =>
  both.flatMap((r) => [r[source].needsActionP, r[source].securityP]).filter((p) => p === 0 || p === 1).length;

console.log(`\nThreads compared: ${both.length} (${gptKey} vs ${JEV})`);
for (const field of ["category", "needsAction", "security", "dateKind"]) {
  console.log(`  agree on ${field.padEnd(11)} ${pct(agree(field), both.length)}`);
}
console.log(`\nYes/no answers that are exactly 0 or 1 (no uncertainty):`);
console.log(`  ${gptKey.padEnd(12)} ${pct(extreme(gptKey), both.length * 2)}`);
console.log(`  ${JEV.padEnd(12)} ${pct(extreme(JEV), both.length * 2)}`);
console.log(`\nSay "needs action": ${gptKey} ${both.filter((r) => r[gptKey].needsAction).length}, ${JEV} ${both.filter((r) => r[JEV].needsAction).length}`);
console.log(`Disagree on category or needs action: ${both.filter((r) => r[gptKey].category !== r[JEV].category || r[gptKey].needsAction !== r[JEV].needsAction).length} threads — label these first.`);
console.log("Details: server/compare-results.json");

await mongoose.disconnect();
