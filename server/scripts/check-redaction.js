// Runs the redaction on your own recent Gmail and prints the result in this
// terminal, so you can check it on real email.
//
//   npm run check-redaction --workspace server -- --max 20 --query "newer_than:30d"
//
// Nothing is saved and nothing is sent anywhere except Google. Run it in your
// own terminal, not through an AI assistant: the output contains your email.

import dotenv from "dotenv";
import http from "http";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { parseArgs } from "util";
import { redactEmail } from "@mailmind/core";
import { createOAuthClient, getMessage, GMAIL_SCOPES, listMessageIds } from "../utils/gmail.js";

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
  },
});

const BODY_PREVIEW = 1500;

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

function printEmail(index, total, email, result) {
  const original = { subject: email.subject, body: email.body };
  const hidden = result.redactions
    .filter((r) => r.type !== "LINK_TRIMMED")
    .map((r) => `${r.type} ${shorten(original[r.field].slice(r.start, r.end), 60)}`);

  console.log(`\n━━━ ${index}/${total}  ${domainOf(email.from)}  ·  ${email.date.toISOString().slice(0, 10)}  ·  ${result.strict ? "STRICT" : "light"}`);
  console.log(`Subject: ${result.subject}`);
  console.log(`Hidden:  ${hidden.length ? hidden.join("  ·  ") : "nothing"}`);
  console.log(indent(shorten(result.body.trim(), BODY_PREVIEW)));
}

const auth = createOAuthClient();
const code = await signInWithBrowser(auth);
const { tokens } = await auth.getToken(code);
auth.setCredentials(tokens);

const ids = await listMessageIds(auth, { query: args.query, max: Number(args.max) });
const counts = {};
let strictCount = 0;

for (const [i, id] of ids.entries()) {
  const email = await getMessage(auth, id);
  const result = redactEmail(email);
  printEmail(i + 1, ids.length, email, result);
  if (result.strict) strictCount += 1;
  for (const r of result.redactions) counts[r.type] = (counts[r.type] ?? 0) + 1;
}

console.log(`\n━━━ ${ids.length} emails, ${strictCount} stored strict`);
console.log(Object.entries(counts).map(([type, n]) => `${type}: ${n}`).join("  ·  ") || "Nothing hidden");
console.log("\nLook for: a code, card, Aadhaar, PAN or login link left visible (a leak),");
console.log("and amounts, dates or coupon codes hidden for no reason (over-redaction).");
