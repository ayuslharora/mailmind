# Mailmind

A privacy-first Gmail assistant. It removes secrets (OTPs, card numbers, Aadhaar/PAN, password-reset links) on the server before any AI model sees the mail, then shows what is urgent, collects deadlines, and answers questions about the inbox with links to the exact Gmail messages.

The design is in [`docs/PRD.md`](docs/PRD.md).

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
