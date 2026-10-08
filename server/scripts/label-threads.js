// Label a random sample of your own threads by hand, to measure the
// classifier on real mail. Run it in your own terminal (it shows your
// redacted email):
//
//   npm run label-threads --workspace server -- --email you@gmail.com --count 50
//
// The classifier's answers are never shown, so they cannot sway you. Only
// thread IDs and your labels are saved, to eval/classifier/real-labels.json.
// Stop any time with q: it saves, and running it again carries on.

import dotenv from "dotenv";
import fs from "fs";
import mongoose from "mongoose";
import path from "path";
import readline from "readline/promises";
import { fileURLToPath } from "url";
import { parseArgs } from "util";
import Message from "../models/message.model.js";
import Thread from "../models/thread.model.js";
import User from "../models/user.model.js";
import { CATEGORIES, URGENCY_LEVELS } from "../utils/classify.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, "../.env"),
  quiet: true,
});

const { values: args } = parseArgs({
  options: { email: { type: "string" }, count: { type: "string", default: "50" } },
});

if (!process.env.MONGODB_URI || !args.email) {
  console.error(!process.env.MONGODB_URI ? "Missing: MONGODB_URI" : "Usage: --email you@gmail.com [--count 50]");
  process.exit(1);
}

const OUT = path.join(__dirname, "../../eval/classifier/real-labels.json");
const BODY_CHARS = 700;
const DATE_KINDS = { d: "deadline", e: "event", n: "none" };

// The same sample on every run, so stopping and carrying on works.
function seededShuffle(items, seed = 42) {
  const out = [...items];
  let s = seed;
  const random = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

await mongoose.connect(process.env.MONGODB_URI, { dbName: "mailmind" });
const user = await User.findOne({ email: args.email.toLowerCase() });
if (!user) {
  console.error("No such user");
  process.exit(1);
}

const saved = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { labels: [] };
const done = new Set(saved.labels.map((l) => l.threadId));
const save = () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(saved, null, 2));
};

const threads = await Thread.find({ userId: user._id, status: "classified" }, "threadId").sort({ threadId: 1 });
const sample = seededShuffle(threads.map((t) => t.threadId)).slice(0, Number(args.count));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = async (question, valid) => {
  for (;;) {
    const answer = (await rl.question(question)).trim().toLowerCase();
    if (answer === "q" || answer === "s" || valid(answer)) return answer;
  }
};

console.log(`\nLabel each thread as it was when it arrived. s skips a thread, q saves and stops.\n`);

for (const [i, threadId] of sample.entries()) {
  if (done.has(threadId)) continue;
  const messages = await Message.find({ userId: user._id, threadId }).sort({ date: -1 }).limit(3);
  if (!messages.length) continue;

  console.log(`\n${"=".repeat(70)}\nThread ${i + 1}/${sample.length}`);
  for (const [n, m] of messages.entries()) {
    const who = m.fromMe ? "ME" : m.from;
    console.log(`\n${n === 0 ? "LATEST" : "earlier"} · ${who} · ${m.date.toISOString().slice(0, 16)}`);
    console.log(`Subject: ${m.subject}`);
    console.log(m.body.trim().slice(0, n === 0 ? BODY_CHARS : 200));
  }
  console.log("");

  const security = await ask("Security email (login code, password, security alert)? y/n: ", (a) => ["y", "n"].includes(a));
  if (security === "q") break;
  if (security === "s") continue;
  const category = await ask(
    `Category ${CATEGORIES.map((c, k) => `${k + 1}=${c}`).join(" ")}: `,
    (a) => Number(a) >= 1 && Number(a) <= CATEGORIES.length,
  );
  if (category === "q") break;
  if (category === "s") continue;
  const needsAction = await ask("Must you do something (reply, pay, submit, fix)? y/n: ", (a) => ["y", "n"].includes(a));
  if (needsAction === "q") break;
  if (needsAction === "s") continue;
  const urgency = await ask(
    `Urgency ${URGENCY_LEVELS.map((u, k) => `${k}=${u}`).join(" ")}: `,
    (a) => /^[0-4]$/.test(a),
  );
  if (urgency === "q") break;
  if (urgency === "s") continue;
  const dateKind = await ask("Date: d=deadline e=event n=none: ", (a) => a in DATE_KINDS);
  if (dateKind === "q") break;
  if (dateKind === "s") continue;

  saved.labels.push({
    threadId,
    labels: {
      security: security === "y",
      category: CATEGORIES[Number(category) - 1],
      needs_action: needsAction === "y",
      urgency: URGENCY_LEVELS[Number(urgency)],
      date_kind: DATE_KINDS[dateKind],
    },
  });
  save();
}

rl.close();
save();
console.log(`\nSaved ${saved.labels.length} labels to eval/classifier/real-labels.json`);
await mongoose.disconnect();
