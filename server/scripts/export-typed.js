// Exports the emails demo visitors typed into "Try the redaction", to study
// what the rules miss. Each original is decrypted and redacted again with
// the current rules, so a fix shows up as "changed" against what the
// visitor saw. Prints only counts; the file holds the originals and is not
// committed (see .gitignore).
//
//   npm run export-typed --workspace server
//   npm run export-typed --workspace server -- --misses   (only reported misses)

import dotenv from "dotenv";
import fs from "fs";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "util";
import { redactEmail } from "@mailmind/core";
import TypedEmail from "../models/typedEmail.model.js";
import { decrypt } from "../utils/crypto.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, "../.env"),
  quiet: true,
});

const OUT_FILE = path.join(__dirname, "../../eval/typed/export.json");

const { values: args } = parseArgs({ options: { misses: { type: "boolean", default: false } } });

await mongoose.connect(process.env.MONGODB_URI, { dbName: "mailmind" });
const emails = await TypedEmail.find(args.misses ? { reportedMiss: true } : {}).sort({ createdAt: -1 });
await mongoose.disconnect();

const rows = emails.map((email) => {
  const original = JSON.parse(decrypt(email.original));
  const now = redactEmail(original, { strict: email.strict });
  return {
    id: String(email._id),
    typedAt: email.createdAt,
    reportedMiss: email.reportedMiss,
    note: email.note ? decrypt(email.note) : null,
    original,
    seen: { subject: email.subject, body: email.body, strict: email.strict, hidden: Object.fromEntries(email.hidden ?? []) },
    now: { subject: now.subject, body: now.body, strict: now.strict },
    changed: now.subject !== email.subject || now.body !== email.body,
  };
});

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, `${JSON.stringify(rows, null, 2)}\n`);

const count = (test) => rows.filter(test).length;
console.log(`${rows.length} typed emails, ${count((r) => r.reportedMiss)} reported as a miss`);
console.log(`${count((r) => r.changed)} redact differently with the current rules`);
console.log(`Written to ${path.relative(process.cwd(), OUT_FILE)}`);
