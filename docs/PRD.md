# Mailmind — Product Requirements Document

**Author:** Ayush · **October 2026** · Live at [mailmind.ayuslh.in](https://mailmind.ayuslh.in)

## 1. Summary

Mailmind is a web app that reads a user's Gmail, removes secrets such as OTPs, card numbers and password-reset links before any AI model sees the mail, and then shows what needs attention today, collects deadlines and events, and answers questions about the inbox with links to the exact Gmail messages.

## 2. Problem

- Most of an inbox is promotions, newsletters and automated notifications. The few emails that matter (an assignment deadline, a payment problem, a recruiter reply) get buried.
- Finding an old email means guessing the exact keywords Gmail search needs.
- AI tools could help, but giving them an inbox exposes OTPs, card numbers, Aadhaar/PAN and login links.

## 3. Target users

Indian college students and early-career professionals whose Gmail mixes college, placement, finance and promotional mail, and who want AI help without handing their secrets to an AI provider.

## 4. Core workflows

| # | Workflow | What the user does | What the system does |
| --- | --- | --- | --- |
| 1 | **Connect & sync** | Signs in with Google | Asks for read-only Gmail access on the same screen; fetches the last 30 days; then fetches only new or changed mail every 15 minutes and on "Sync now" |
| 2 | **Protect & classify** | Nothing | Redacts each email on the server, classifies each conversation with an AI model, finds deadlines and events, stores only the redacted copy |
| 3 | **Triage** | Opens the Today view; marks items done, snoozes, corrects mistakes, adds dates to Google Calendar | Ranks conversations by urgency, recomputed every time the page loads |
| 4 | **Ask your inbox** | Asks questions in a chat, including follow-ups and "summarise all emails from…" | Searches only that user's emails by meaning and by keywords; answers cite the exact Gmail messages; says so when the inbox does not contain the answer |

Also: a daily **Digest**, a **"What the AI saw"** page for every email, **Delete all my data**, and a **demo mode** with a fake inbox for visitors who do not want to connect Gmail.

## 5. Scope

**In scope**

- One-step Google sign-in with read-only Gmail access
- 30-day backfill, incremental sync every 15 minutes, "Sync now", removal of emails deleted in Gmail
- Redaction on the server before any AI call, with a count of what was hidden in each email
- Conversation classification (category, security, needs action, urgency, deadline/event) with probabilities
- Deadline and event extraction; urgency that rises as a date approaches and fades as an email gets older
- Today view: done, snooze, corrections (optionally for every email from a sender), Add to Calendar, open in Gmail
- Ask your inbox: follow-up questions, sender and date filters, hybrid search, citations linking to Gmail
- "Delete all my data", which also stops any sync in progress and revokes Gmail access
- Demo mode: one shared fake inbox, processed by the real pipeline, with no sign-in

**Out of scope:** sending, deleting or changing email; writing to Google Calendar (a pre-filled link is used instead); other email providers; attachments.

## 6. Architecture

```
React client (Vercel) ── /api/* rewritten to Render (same origin, first-party cookie)
      │
Express API (Render) ─────────────────────────► MongoDB Atlas (data + vector index + text index)
      │  no AI models run on this server
      ├─ Gmail API (read-only)                    sync, history, labels
      ├─ Redaction (own code, tested)             raw text only in memory
      ├─ chrono-node + own rules                  deadline and event dates, in memory
      ├─ OpenRouter ── Jev                        classification (main)
      ├─ Groq ── gpt-oss-20b / gpt-oss-120b       classification fallback, chat answers
      └─ Cloudflare Workers AI ── bge-m3          embeddings for search

Cloudflare Worker (cron) ──► /health every 10 minutes (keeps Render awake) and the 15-minute sync
```

**Key design principles**

- **Redact before every AI call.** Every model only receives redacted text; secrets never leave the API server.
- **Original emails are never stored.** Only the redacted copy is kept; opening an email goes to Gmail.
- **Rules first, AI second.** Rules decide when they are sure (an OTP email needs no AI call); the AI can only make redaction stricter, never looser.
- **Fail safe.** Any failure leaves a conversation "sorting…" to be retried; nothing is ever stored with less redaction.
- **Every model behind one interface.** Classifiers answer in the same shape, so one can replace another by changing one adapter.
- **One database.** Messages, conversations and search vectors live in MongoDB Atlas, so every search is filtered to the signed-in user inside the database, and deleting an email deletes it everywhere.

The reasons behind these choices, and the alternatives that lost, are in the [decision log](decision-log.md).

## 7. Classification

1. **Context:** the latest message of the conversation (its start and end), the two messages before it, the sender's domain only, Gmail's own tab, whether it came from a mailing tool, and how many days until a date found in it.
2. **Rules first:** an email that says it contains a one-time code is a security notice and needs no AI call.
3. **Model:** Jev (TypeSafe's decision model, via OpenRouter) answers five questions with probabilities: security email?, category (Academic, Jobs, Finance, Personal, Notifications, Promos), needs action?, urgency (0–4), date kind (deadline / event / none). If Jev is unavailable, gpt-oss-20b on Groq answers in the same shape.
4. **After the model:** a promotion that claims to be urgent is capped when Gmail's headers agree it is a promotion, and never appears under "Needs action". A conversation the model thinks is a security email is read again from Gmail and stored with stricter redaction.

Jev is the main classifier because it gives real probabilities, while gpt-oss-20b answered almost every yes/no question with exactly 0 or 1. Details: [classification case study](classification-case-study.md).

## 8. Storage, dates and urgency

- **Stored copy:** "light" (only secrets hidden; amounts, dates, coupon codes and safe links kept) or "strict" (every code-shaped number and every link hidden) when a secret was found or the model flags a security email.
- **Dates:** read from the original text while it is in memory, in Indian time, day first (10/11 is 10 November), relative to when the email was sent. Phrases like "EOD" and "by the 15th" are handled; dates inside links and casual phrases such as "Today's best…" are ignored.
- **Urgency is never stored.** On every page load, the model's urgency fades by one point a day after the email arrived, and a deadline raises it as it approaches (4 under one day, 3 under three days, 2 under a week); the higher of the two counts. A new-login or security alert is urgent on the day it arrives.

## 9. Today view

- Sections: **Urgent**, **Needs action**, **Coming up this week**, a summary line counting everything else by category, and **Missed** at the bottom (deadlines that needed action and can no longer be met; an overdue bill stays under Needs action, because it can still be paid).
- Each item: subject, first line, sender, date, category, and "Due Fri, 11:59 pm" or "Event Fri".
- Actions: Done (with Undo), Snooze (tomorrow, next Monday, or a chosen day), "Not right?" (change the category, optionally for all email from that sender), Add to Calendar, Open in Gmail. A new reply reopens a done or snoozed conversation. Gmail itself is never changed.
- Every correction overrides the model.

## 10. Ask your inbox (RAG)

**Indexing:** each stored (redacted) email is split into chunks of about 800 characters, each starting with a line naming the sender, subject and date, and embedded with bge-m3 on Cloudflare Workers AI. New mail is indexed after every sync; mail deleted in Gmail is removed from the index.

**Answering:**

1. **Understand:** a follow-up is rewritten into a standalone question ("when did that happen?" → "When did my Google One payment fail?"), and any sender, date range or "list every email" request is picked out.
2. **Filter:** sender words are matched to real senders in that mailbox, allowing typos.
3. **Retrieve:** a meaning search and a keyword search, both filtered to the user (and sender and dates) inside Atlas, merged into one ranking; the top 6 chunks are kept. "Summarise / list / how many" questions read one chunk from every matching email instead, and "what's due" questions use the stored deadlines.
4. **Answer:** gpt-oss-20b answers only from the numbered sources and lists the ones it used.
5. **Check:** citations of sources that were not given are dropped; with no valid citation the answer is "I couldn't find this in your inbox". Hidden values (such as an OTP) are never guessed; the answer links to the email instead.

## 11. Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Front end | React (Vite) + Tailwind on Vercel | Simple pages; Vercel rewrites keep the login cookie first-party |
| API | Node.js + Express on Render | One language end to end; follows the course repository's structure |
| Database | MongoDB Atlas | Documents, vector search and keyword search in one place |
| Gmail | Gmail API, `gmail.readonly` | 30 days of mail, labels, and change history for incremental sync |
| Classification | Jev via OpenRouter; fallback gpt-oss-20b on Groq | Real probabilities; the fallback is free |
| Chat answers | gpt-oss-20b on Groq, then gpt-oss-120b | Free; when one model's daily limit is reached the next takes over |
| Embeddings | bge-m3 on Cloudflare Workers AI | Free, multilingual, and Cloudflare does not train on or keep the text |
| AI framework | LangChain.js | Structured output, embeddings, text splitting |
| Dates | chrono-node plus own rules | Predictable, tested date reading |
| Scheduler | Cloudflare Worker cron | Free; keeps the API awake and triggers sync |

## 12. Data model

| Collection | Key fields |
| --- | --- |
| `users` | googleId, email, name, encryptedRefreshToken, sync state |
| `messages` | userId, gmailId, threadId, from, date, redacted subject and body, strict, hidden (count per type, never the values), deadlineAt, eventAt |
| `threads` | userId, threadId, status, classification (category, probabilities, urgency, date kind), dueAt, state (open/done/snoozed), snoozeUntil, userLabel |
| `senderrules` | userId, sender, category |
| `chunks` | userId, gmailId, threadId, date, sender, text, embedding |

## 13. Security and privacy

- **Read-only Gmail access:** Mailmind cannot send, delete or change mail.
- **Secrets never leave the server:** raw email text exists only in memory while an email is processed; only the redacted copy is stored.
- **Only redacted text reaches any AI service** (Jev, Groq, Cloudflare). The classifier sees only the sender's domain.
- **Encrypted credentials:** the Gmail refresh token is stored with AES-256-GCM. Email text is stored redacted but not encrypted, so it can be searched.
- **Login:** a signed token in an httpOnly cookie. Every query is scoped to the signed-in user; tested across two accounts.
- **Delete all my data:** removes every message, conversation, search chunk and rule, revokes Mailmind's Gmail access at Google, and deletes the account.
- **Rate limits and headers:** AI features and Sync now are limited per user, sign-in and the whole API per IP address; `helmet` sets security headers.
- **Who can sign in:** controlled by `ALLOWED_EMAILS` (`*` for anyone, or a list of addresses). Anyone not allowed is turned away before anything is saved, and the Gmail access they just granted is given back.
- **Known limit:** the words of an email (names, personal content) can reach the AI services. Mailmind protects secrets, not every private detail, and says so.

## 14. Error handling

| Failure | Behaviour |
| --- | --- |
| Gmail access unticked at sign-in | Message asking the user to sign in again and allow Gmail |
| Gmail login expired or revoked | Sync stops; a link asks the user to sign in again |
| Server restarts during the first sync | Carries on from the last saved page |
| Jev unavailable or out of credit | gpt-oss-20b classifies instead |
| A Groq model reaches its daily limit | The next model takes over; if all are used up, conversations wait as "sorting…" and the chat says so |
| Groq's per-minute limit | Requests wait their turn instead of failing |
| Embedding service unavailable | Sync still completes; the emails are indexed on the next sync |
| No relevant email for a question | "I couldn't find this in your inbox" |
| A new message arrives during classification | The older result is discarded |

## 15. Testing

| What | How |
| --- | --- |
| Redaction, dates, urgency, server | 247 automated tests, run on every push with GitHub Actions, including tests written specifically to break redaction |
| Redaction on real mail | The author's real inbox checked by hand and by a leak scanner; every bug found became a test |
| Privacy | A blind test set written without seeing the code: redaction hid about 85% of planted secrets, and no hidden secret leaked through Ask your inbox under attack ([evaluation report](evaluation-report.md)) |
| Classification | Jev and gpt-oss-20b compared on the author's real inbox ([case study](classification-case-study.md)) |
| Authorisation | Automated and live tests across two accounts: no cross-user access |

## 16. Deployment

Front end on Vercel (rewrites `/api/*` to Render), API on Render's free tier, MongoDB Atlas free tier, and a Cloudflare Worker for the keep-alive and sync schedule. The Google app is published but not verified: users see a warning screen first, and at most 100 accounts can sign in.

## 17. Risks

| Risk | Mitigation |
| --- | --- |
| A secret slips through redaction | Rules-first design, stricter storage for security emails, adversarial tests, checks on real mail |
| Free tiers change or run out (Render, Atlas, Groq, OpenRouter, Cloudflare) | Every model sits behind an interface and can be swapped; Groq models fall back to each other and Jev falls back to gpt-oss-20b |
| A college Google Workspace may block the app | Personal Gmail is fully supported; Workspace is best effort |

## 18. Future work

- Google verification, to remove the warning screen and the 100-account limit.
- Better redaction of Indian phone formats and Hindi/Hinglish labels, the main gaps found in the evaluation.
- A browser extension as a second front end on the same backend.
