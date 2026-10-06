// Runs the redaction on your own recent Gmail and prints the result in this
// terminal, so you can check it on real email.
//
//   npm run check-redaction --workspace server -- --max 20 --query "newer_than:30d"
//   npm run check-redaction --workspace server -- --max 50 --out redaction-check.txt
//   npm run check-redaction --workspace server -- --max 20 --original --out redaction-check.txt
//
// --original also prints each email before redaction, for comparing. That
// output contains real secrets (codes, card numbers, login links): keep it on
// your machine and delete it when done.
//
// With --out, the results go to that file (in server/, ignored by git) with
// full email bodies, and only the sign-in steps and progress are shown here.
// Nothing else is saved and nothing is sent anywhere except Google. Run it in your
// own terminal, not through an AI assistant: the output contains your email
// (redacted, but still your names, subjects and messages).

import dotenv from "dotenv";
import fs from "fs";
import http from "http";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { parseArgs } from "util";
import { findDate, redactEmail } from "@mailmind/core";
import { createOAuthClient, getMessage, getProfile, GMAIL_SCOPES, listMessageIds } from "../utils/gmail.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, "../.env"),
  quiet: true,
});

const requiredEnvVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"];
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

const { values: args } = parseArgs({
  options: {
    max: { type: "string", default: "20" },
    query: { type: "string", default: "newer_than:30d -in:spam -in:trash" },
    out: { type: "string" },
    original: { type: "boolean", default: false },
  },
});

// Long bodies are cut in the terminal, but written in full to a file.
const BODY_PREVIEW = 1500;
const outFile = args.out ? fs.createWriteStream(args.out) : null;
const print = (line = "") => (outFile ? outFile.write(`${line}\n`) : console.log(line));

// Opens a one-off local server on the redirect URI and waits for Google to
// send the user back with a sign-in code.
function signInWithBrowser(auth) {
  const redirect = new URL(process.env.GOOGLE_REDIRECT_URI);
  const state = crypto.randomBytes(16).toString("hex");
  const url = auth.generateAuthUrl({ scope: GMAIL_SCOPES, state, prompt: "consent" });

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const params = new URL(req.url, redirect).searchParams;
      if (!req.url.startsWith(redirect.pathname)) {
        res.writeHead(404).end();
        return;
      }
      server.close();
      if (params.get("state") !== state || !params.get("code")) {
        res.end("Sign-in failed. Go back to the terminal.");
        reject(new Error(params.get("error") || "Sign-in failed"));
        return;
      }
      res.end("Signed in. You can close this tab and go back to the terminal.");
      resolve(params.get("code"));
    });
    server.listen(Number(redirect.port), () => {
      console.log(`\nOpen this link and sign in with the Gmail account to check:\n\n${url}\n`);
    });
  });
}

const domainOf = (from) => from.match(/@([^>\s]+)/)?.[1] ?? from;
const indent = (text) => text.replace(/^/gm, "    ");
const shorten = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);

// Shows only what kind of thing was hidden and how many, never the value, so
// the output can be shared without sharing the secrets.
// The classifier will say whether an email has a deadline or an event; until
// it exists, both readings are shown. Dates are found on the raw text, as in
// the real pipeline, but only the date is printed.
function datesOf(email) {
  const text = `${email.subject}\n${email.body}`;
  const format = (found) =>
    found
      ? found.dueAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) +
        (found.hasTime ? "" : " (end of day)")
      : "none";
  return {
    deadline: format(findDate(text, { sentAt: email.date, kind: "deadline" })),
    event: format(findDate(text, { sentAt: email.date, kind: "event" })),
  };
}

function printEmail(index, total, email, result) {
  const counts = {};
  for (const r of result.redactions) {
    if (r.type !== "LINK_TRIMMED") counts[r.type] = (counts[r.type] ?? 0) + 1;
  }
  const hidden = Object.entries(counts).map(([type, n]) => `${type} ×${n}`);

  const body = result.body.trim();
  const fit = (text) => indent(outFile ? text : shorten(text, BODY_PREVIEW));

  print(`\n━━━ ${index}/${total}  ${domainOf(email.from)}  ·  ${email.date.toISOString().slice(0, 10)}  ·  ${result.strict ? "STRICT" : "light"}`);
  print(`Subject: ${result.subject}`);
  print(`Hidden:  ${hidden.length ? hidden.join("  ·  ") : "nothing"}`);
  const dates = datesOf(email);
  print(`Dates:   deadline → ${dates.deadline}  ·  event → ${dates.event}`);
  if (dates.deadline !== "none" || dates.event !== "none") datedCount += 1;
  if (args.original) {
    print(`\n  ── ORIGINAL ──  Subject: ${email.subject}`);
    print(fit(email.body.trim()));
    print("\n  ── REDACTED ──");
  }
  print(fit(body));
}

const auth = createOAuthClient();
const code = await signInWithBrowser(auth);
const { tokens } = await auth.getToken(code);
auth.setCredentials(tokens);

const profile = await getProfile(auth);
console.log(`Signed in as ${profile.email} (${profile.messagesTotal} messages in the mailbox)`);
console.log(`Search: "${args.query}", up to ${args.max} emails`);

const ids = await listMessageIds(auth, { query: args.query, max: Number(args.max) });
if (ids.length === 0) {
  console.log('\nNo emails matched. Try a wider search, for example --query "newer_than:1y" or --query ""');
}
const counts = {};
let strictCount = 0;
let datedCount = 0;

for (const [i, id] of ids.entries()) {
  const email = await getMessage(auth, id);
  const result = redactEmail(email);
  printEmail(i + 1, ids.length, email, result);
  if (outFile) process.stdout.write(`\rRead ${i + 1}/${ids.length} emails`);
  if (result.strict) strictCount += 1;
  for (const r of result.redactions) counts[r.type] = (counts[r.type] ?? 0) + 1;
}

print(`\n━━━ ${ids.length} emails, ${strictCount} stored strict, ${datedCount} with a date found`);
print(Object.entries(counts).map(([type, n]) => `${type}: ${n}`).join("  ·  ") || "Nothing hidden");
print("\nLook for: a code, card, Aadhaar, PAN or login link left visible (a leak),");
print("and amounts, dates or coupon codes hidden for no reason (over-redaction).");
print("For dates: a real deadline or event missed, a wrong date, or a date found in an email that has none.");

if (outFile) {
  outFile.end();
  console.log(`\nSaved to ${path.resolve(args.out)}`);
}
