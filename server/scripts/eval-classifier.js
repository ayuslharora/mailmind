// Measures the classifier against labels written by people, not by the model.
//
//   Synthetic threads (written blind, run through the classifier now):
//   npm run eval-classifier --workspace server -- --cases ../eval/classifier/cases.json --out ../eval/classifier/results-synthetic.json
//
//   Your real threads (labelled with label-threads, compared with what the
//   classifier stored when they arrived; no new AI calls):
//   npm run eval-classifier --workspace server -- --labels ../eval/classifier/real-labels.json --email you@gmail.com --out ../eval/classifier/results-real.json
//
// Every decision is made the way the app makes it: the same rules, the same
// model fallback, the same promo rule and the same thresholds as the Today view.

import dotenv from "dotenv";
import fs from "fs";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "util";
import Thread from "../models/thread.model.js";
import User from "../models/user.model.js";
import { applyPromoRules, buildState, CATEGORIES, rulesClassification, SECURITY_P, URGENCY_LEVELS } from "../utils/classify.js";
import { classifyWithBestModel } from "../utils/classifyThreads.js";
import { toStoredMessage } from "../utils/sync.js";
import { signals } from "../utils/today.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, "../.env"),
  quiet: true,
});

const { values: args } = parseArgs({
  options: { cases: { type: "string" }, labels: { type: "string" }, email: { type: "string" }, out: { type: "string" } },
});

if (!args.cases && !(args.labels && args.email)) {
  console.error("Usage: --cases cases.json, or --labels real-labels.json --email you@gmail.com");
  process.exit(1);
}

const CONTEXT_MESSAGES = 3;
const GMAIL_TAB_LABELS = {
  primary: "CATEGORY_PERSONAL",
  promotions: "CATEGORY_PROMOTIONS",
  updates: "CATEGORY_UPDATES",
  social: "CATEGORY_SOCIAL",
  forums: "CATEGORY_FORUMS",
};
const FIELDS = ["security", "category", "needs_action", "urgency", "date_kind"];

// What the app shows for a stored classification.
function decisions(c, now) {
  return {
    security: c.securityP >= SECURITY_P,
    category: c.category,
    needs_action: signals({ classification: c }, now).needsAction,
    urgency: URGENCY_LEVELS[Math.round(c.urgency)],
    date_kind: c.dateKind,
  };
}

// A test thread as the classifier would see it after sync stored it.
function storedMessages(thread) {
  return thread.messages
    .map((m, i) =>
      toStoredMessage("eval", {
        id: `${thread.id}-${i}`,
        threadId: thread.id,
        from: m.from,
        subject: m.subject,
        body: m.body,
        date: new Date(m.date),
        labelIds: ["INBOX", GMAIL_TAB_LABELS[m.gmail_tab] ?? "CATEGORY_PERSONAL", ...(m.from_me ? ["SENT"] : [])],
        bulkSender: Boolean(m.bulk),
      }),
    )
    .reverse()
    .slice(0, CONTEXT_MESSAGES);
}

async function classifySynthetic(file) {
  const { now, threads } = JSON.parse(fs.readFileSync(file, "utf8"));
  const at = new Date(now);
  const rows = [];
  for (const [i, thread] of threads.entries()) {
    const messages = storedMessages(thread);
    let answers = rulesClassification(messages[0]);
    let source = "rules";
    try {
      if (!answers) {
        const state = buildState(messages, at);
        const result = await classifyWithBestModel(state);
        answers = applyPromoRules(result.answers, state);
        source = result.source;
      }
      rows.push({ id: thread.id, hard: Boolean(thread.hard), note: thread.note, source, truth: thread.labels, predicted: decisions({ ...answers, source }, at) });
    } catch (err) {
      rows.push({ id: thread.id, error: err.message });
    }
    process.stdout.write(`\rClassified ${i + 1}/${threads.length}`);
  }
  console.log();
  return rows;
}

async function compareReal(file, email) {
  const { labels } = JSON.parse(fs.readFileSync(file, "utf8"));
  await mongoose.connect(process.env.MONGODB_URI, { dbName: "mailmind" });
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) throw new Error("No such user");
  const threads = await Thread.find({ userId: user._id, threadId: { $in: labels.map((l) => l.threadId) } });
  const byId = new Map(threads.map((t) => [t.threadId, t]));
  await mongoose.disconnect();
  return labels
    .filter((l) => byId.get(l.threadId)?.classification)
    .map((l) => {
      const c = byId.get(l.threadId).classification;
      return { id: l.threadId, source: c.source, truth: l.labels, predicted: decisions(c, new Date()) };
    });
}

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");
const share = (n, d) => `${n}/${d} (${pct(n, d)})`;

function yesNo(rows, field) {
  const tp = rows.filter((r) => r.truth[field] && r.predicted[field]).length;
  const fp = rows.filter((r) => !r.truth[field] && r.predicted[field]).length;
  const fn = rows.filter((r) => r.truth[field] && !r.predicted[field]).length;
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 = precision && recall ? (2 * precision * recall) / (precision + recall) : null;
  return { tp, fp, fn, precision, recall, f1 };
}

function summarise(rows) {
  const ok = rows.filter((r) => !r.error);
  const n = ok.length;
  const correct = (field) => ok.filter((r) => r.truth[field] === r.predicted[field]).length;
  const level = (u) => URGENCY_LEVELS.indexOf(u);
  const majority = (field) => {
    const counts = {};
    for (const r of ok) counts[r.truth[field]] = (counts[r.truth[field]] ?? 0) + 1;
    const [value, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    return { value, count };
  };
  const confusion = Object.fromEntries(
    CATEGORIES.map((t) => [t, Object.fromEntries(CATEGORIES.map((p) => [p, ok.filter((r) => r.truth.category === t && r.predicted.category === p).length]))]),
  );
  return {
    threads: rows.length,
    errors: rows.filter((r) => r.error).length,
    sources: ok.reduce((s, r) => ({ ...s, [r.source]: (s[r.source] ?? 0) + 1 }), {}),
    accuracy: Object.fromEntries(FIELDS.map((f) => [f, correct(f) / n])),
    urgencyWithinOne: ok.filter((r) => Math.abs(level(r.truth.urgency) - level(r.predicted.urgency)) <= 1).length / n,
    needsAction: yesNo(ok, "needs_action"),
    security: yesNo(ok, "security"),
    baseline: Object.fromEntries(FIELDS.map((f) => [f, { ...majority(f), accuracy: majority(f).count / n }])),
    confusion,
    hard: ok.some((r) => "hard" in r)
      ? {
          threads: ok.filter((r) => r.hard).length,
          allFieldsRight: ok.filter((r) => r.hard && FIELDS.every((f) => r.truth[f] === r.predicted[f])).length,
        }
      : undefined,
  };
}

function print(title, rows, s) {
  const n = rows.length - s.errors;
  console.log(`\n${title}: ${n} threads${s.errors ? ` (${s.errors} failed)` : ""}, answered by ${JSON.stringify(s.sources)}`);
  console.log(`  field          accuracy   always-guess-the-commonest`);
  for (const f of FIELDS) {
    const b = s.baseline[f];
    console.log(`  ${f.padEnd(13)}  ${pct(s.accuracy[f] * n, n).padStart(8)}   ${pct(b.count, n)} ("${b.value}")`);
  }
  console.log(`  urgency within one level: ${pct(s.urgencyWithinOne * n, n)}`);
  for (const f of ["needs_action", "security"]) {
    const m = s[f === "needs_action" ? "needsAction" : "security"];
    console.log(
      `  ${f}: precision ${m.precision === null ? "n/a" : pct(m.precision * 100, 100)}, recall ${m.recall === null ? "n/a" : pct(m.recall * 100, 100)}` +
        ` (${m.tp} right, ${m.fp} false alarms, ${m.fn} missed)`,
    );
  }
  if (s.hard) console.log(`  hard cases with every field right: ${share(s.hard.allFieldsRight, s.hard.threads)}`);
  console.log(`  category confusion (rows: truth, columns: predicted ${CATEGORIES.map((c) => c.slice(0, 5)).join(" ")}):`);
  for (const t of CATEGORIES) console.log(`    ${t.padEnd(13)} ${CATEGORIES.map((p) => String(s.confusion[t][p]).padStart(5)).join(" ")}`);
  const wrong = rows.filter((r) => !r.error && FIELDS.some((f) => r.truth[f] !== r.predicted[f]));
  console.log(`  threads with any field wrong: ${share(wrong.length, n)}`);
}

const report = {};
if (args.cases) {
  const rows = await classifySynthetic(path.resolve(args.cases));
  report.synthetic = { summary: summarise(rows), rows };
  print("Synthetic threads (written blind)", rows, report.synthetic.summary);
}
if (args.labels) {
  const rows = await compareReal(path.resolve(args.labels), args.email);
  report.real = { summary: summarise(rows), rows };
  print("Your real threads (labelled by you)", rows, report.real.summary);
}
if (args.out) {
  fs.writeFileSync(path.resolve(args.out), JSON.stringify(report, null, 2));
  console.log(`\nDetails: ${args.out}`);
}
