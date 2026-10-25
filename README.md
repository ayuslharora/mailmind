# Mailmind

A privacy-first Gmail assistant. It removes secrets (OTPs, card numbers, Aadhaar/PAN, password-reset links) on the server before any AI model sees the mail, then shows what is urgent, collects deadlines, and answers questions about the inbox with links to the exact Gmail messages.

The design is in [`docs/PRD.md`](docs/PRD.md).

## Demo mode

Sign-in is invite-only, so [mailmind.ayuslh.in/demo](https://mailmind.ayuslh.in/demo) opens a demo inbox with no sign-in: a week of fake emails of a student, Aarav (the 63 threads of `eval/classifier/cases.json`). Everything else is the real app:

- The emails went through the real pipeline once (redaction, the Jev classifier, embeddings), so Today, "What the AI saw", the Digest and Ask show real results, not hard-coded ones.
- Every visitor sees the same inbox. Done, snooze and "Not right?" corrections are saved in the visitor's browser and sent with each request; the server applies them without saving, so nobody changes the inbox for the next visitor. "Reset my changes" clears them.
- On the first visit of each day the inbox moves to today: every date moves by whole days, including the dates written in the emails ("submit by Wednesday, 14 October" becomes the matching day), so deadlines stay current. Redaction and date finding run again; the classifier is not called again.
- "Redact" lets a visitor write an email with made-up secrets and see what Mailmind would store, with what was caught marked in the original. No AI sees it. Unlike Gmail mail, the original is saved (encrypted, deleted after 90 days) so misses can be studied, and the visitor can report one. `npm run export-typed --workspace server` decrypts them into `eval/typed/export.json` (not committed), redacted again with the current rules.

Set it up once (about 60 Jev calls; run again with `--fresh` to start over):

```sh
npm run seed-demo --workspace server
```

## Repository layout

| Folder | What it is |
| --- | --- |
| `core/` | Pure functions with no I/O: redaction, dates, urgency. Fully unit-tested |
| `server/` | Express API (Render): Gmail sync, classification, RAG |
| `client/` | React + Vite front end (Vercel); `/api` is rewritten to the server |
| `pinger/` | Cloudflare Worker that keeps the Render server awake |
| `docs/` | PRD, decision log, classification case study |

## Running locally

Requires Node 22.12 or later.

```sh
npm install
cp server/.env.example server/.env   # then fill in the values
npm run dev                          # API on :4000, client on :5180
npm test                             # all workspaces
```
