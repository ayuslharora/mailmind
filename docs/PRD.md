# Mailmind — Product Requirements Document

**Author:** Ayush · **Updated:** 7 October 2026 · **Status:** Design approved in principle; core built and tested on a real inbox · **Submission deadline:** 27 October 2026

## 1. Summary

Mailmind is a web app that reads a user's Gmail, removes secrets such as OTPs, card numbers and password-reset links before any AI model sees the mail, and then shows what needs attention today, collects deadlines and events, and answers questions about the inbox in a chat, with links to the exact Gmail messages.

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
| 4 | **Ask your inbox** | Asks questions in a chat, including follow-ups and "summarize all emails from…" | Searches only that user's emails by meaning and by keywords; answers cite the exact Gmail messages; says so when the inbox does not contain the answer |

## 5. Progress so far (7 October)

| Area | Status |
| --- | --- |
| Google sign-in with read-only Gmail access; encrypted refresh token | Built, tested live |
| 30-day backfill (resumable), incremental sync, removal of mail deleted in Gmail, 15-minute schedule | Built, tested live (deletion tested with simulated Gmail history) |
| Redaction: OTPs, cards, Aadhaar, PAN, account numbers, PINs, passwords, phone numbers, IP addresses, risky links; coupon codes kept | Built; 141 tests; checked on 70 real emails: **no leaks found**, 8 bugs found and fixed |
| Deadline and event dates | Built; 25 tests; checked on 17 real emails with dates, 5 bugs found and fixed |
| Classification with Jev, fallback gpt-oss-20b | Built; compared live on 76 real conversations (section 8) |
| Today view with done, snooze, corrections, sender rules, Add to Calendar | Built (plain interface; to be redesigned) |
| Ask your inbox (RAG) with citations | Built; correct on every question tried on the author's inbox, including follow-ups, "summarize all emails from…" and questions the inbox cannot answer |
| Automated tests | 211 passing (167 for redaction, dates and urgency; 44 for the server) |
| Still to do | Deployment, front-end redesign, labelled evaluation report, README, demo video, "Delete all my data", bring your own key |

## 6. Scope

**In scope for 27 October**

- One-step Google sign-in with read-only Gmail access
- 30-day backfill, incremental sync every 15 minutes, "Sync now", removal of emails deleted in Gmail
- Redaction on the server before any AI call, with a count of what was hidden in each email
- Conversation classification (category, security, needs action, urgency, deadline/event) with probabilities
- Deadline and event extraction; urgency that rises as a date approaches and fades as an email gets older
- Today view: done, snooze, corrections (optionally for every email from a sender), Add to Calendar, open in Gmail
- Ask your inbox: follow-up questions, sender and date filters, hybrid search, citations linking to Gmail
- "Delete all my data"; bring your own Groq key

**Out of scope:** sending, deleting or changing email; writing to Google Calendar (a pre-filled link is used instead); other email providers; attachments; a browser extension (a possible future front end on the same backend).

**Dropped:** a demo mode with a synthetic inbox (decided on 7 October, to spend the time on the core workflows). How evaluators get in is question 2 in section 19.

**Stretch goal:** fine-tuning Laya, an open-weight decision model, on hand-labelled emails and hosting it for free, as a third classifier in the comparison.

## 7. Architecture

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

**Key design decisions**

- **Redact before every AI call.** Every model only receives redacted text; secrets never leave the API server.
- **Original emails are never stored.** Only the redacted copy is kept; opening an email goes to Gmail.
- **Rules first, AI second.** Rules decide when they are sure (an OTP email needs no AI call); the AI can only make redaction stricter, never looser.
- **Fail safe.** Any failure leaves a conversation "sorting…" to be retried; nothing is ever stored with less redaction.
- **Every model behind one interface.** Classifiers answer in the same shape, so Jev, gpt-oss-20b or a fine-tuned Laya can be swapped by changing one adapter.
- **One database.** Messages, conversations and search vectors live in the same MongoDB Atlas database, so every search is filtered to the logged-in user inside the database, and deleting an email deletes it everywhere.

## 8. Classification

1. **Context:** the latest message of the conversation (its start and end), the two messages before it, who sent each (only the sender's domain is sent to the model), Gmail's own tab, whether it came from a mailing tool, and how many days until a date found in it.
2. **Rules first:** an email that says it contains a one-time code is a security notice and needs no AI call.
3. **Model:** Jev (TypeSafe's decision model, through OpenRouter) answers five questions with probabilities: security email?, category (Academic, Jobs, Finance, Personal, Notifications, Promos), needs action?, urgency (0–4), date kind (deadline / event / none). If Jev is unavailable, gpt-oss-20b on Groq answers in the same shape.
4. **After the model:** a promotion that claims to be urgent is capped when Gmail's headers agree it is a promotion; a promotion never appears under "Needs action". A conversation the model thinks is a security email is read again from Gmail and stored with stricter redaction.

**Why Jev (measured on the author's inbox, 7 October):** gpt-oss-20b answered exactly 0 or 1 for 83% of its yes/no probabilities, so its thresholds meant little; Jev gave real probabilities (0% exactly 0 or 1). On the 17 conversations where the two disagreed, the author judged Jev right on 16. A full classification costs about $0.00004 with Jev. Details: `docs/classification-case-study.md`.

## 9. Storage, dates and urgency

- **Stored copy:** "light" (only secrets hidden; amounts, dates, coupon codes and safe links kept) or "strict" (every code-shaped number and every link hidden) when a secret was found or the model flags a security email.
- **Dates:** read from the original text while it is in memory, in Indian time, day first (10/11 is 10 November), relative to when the email was sent; "EOD", "by the 15th", times after dates and US time zones handled; dates inside links, "now" and casual phrases such as "Today's best…" ignored.
- **Urgency is never stored.** On every page load: the model's urgency fades by one point a day after the email arrived; a deadline raises it as it approaches (4 under one day, 3 under three days, 2 under a week); the higher of the two counts. A new-login or security alert is urgent on the day it arrives.

## 10. Today view

- Sections: **Urgent**, **Needs action**, **Coming up this week**, a summary line counting everything else by category, and **Missed** at the bottom (only deadlines that needed action and can no longer be met; an overdue bill stays under Needs action, because it can still be paid).
- Each item: subject, first line, sender, date, category, "Due Fri, 11:59 pm" or "Event Fri".
- Actions: Done (with Undo), Snooze (tomorrow, next Monday, or a chosen day), "Not right?" (change the category, optionally for all email from that sender; say whether it needs action), Add to Calendar, Open in Gmail. A new reply reopens a done or snoozed conversation. Gmail itself is never changed.
- Every correction overrides the model and is saved as a hand label for the evaluation.

## 11. Ask your inbox (RAG)

**Indexing:** each stored (redacted) email is split into chunks of about 800 characters, each starting with a line naming the sender, subject and date, and embedded with bge-m3 (1,024 dimensions, multilingual) on Cloudflare Workers AI. New mail is indexed after every sync; mail deleted in Gmail is removed from the index.

**Answering:**
1. **Understand:** one model call rewrites a follow-up into a standalone question ("when did that happen?" → "When did my Google One payment fail?") and pulls out a sender, a date range and whether the user wants every matching email.
2. **Filter:** the sender words are matched to real senders in that mailbox, allowing typos ("ayus arora" finds "Ayush Arora").
3. **Retrieve:** a meaning search (vector index) and a keyword search (text index), both filtered to the user, sender and dates inside Atlas, merged with Reciprocal Rank Fusion; the top 6 chunks are kept. "Summarize / list / how many" questions instead read one chunk from every matching email (up to 15).
4. **Answer:** gpt-oss-20b answers only from the numbered sources and lists the ones it used.
5. **Check:** citations of sources that were not given are dropped; with no valid citation the answer is "I couldn't find this in your inbox". Hidden values (such as an OTP) are never guessed; the answer links to the email instead.

## 12. Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Front end | React (Vite) + Tailwind on Vercel | Simple pages; Vercel rewrites keep the login cookie first-party |
| API | Node.js + Express on Render (free) | One language end to end; follows the course repository's structure |
| Database | MongoDB Atlas (free) | Documents, vector search and keyword search in one place |
| Gmail | Gmail API, `gmail.readonly` | 30 days of mail, labels, and change history for incremental sync |
| Classification | Jev via OpenRouter; fallback gpt-oss-20b on Groq | Real probabilities and the best results on the author's inbox; the fallback is free |
| Chat answers | gpt-oss-20b on Groq, then gpt-oss-120b | Free; when one model's daily limit is reached the next takes over |
| Embeddings | bge-m3 on Cloudflare Workers AI | Free with no card; Cloudflare does not train on or keep the text; multilingual |
| AI framework | LangChain.js | Groq chat models with guaranteed structured output, embeddings, text splitting |
| Dates | chrono-node plus own rules | Deterministic, tested date reading |
| Encryption | Node `crypto`, AES-256-GCM | For Gmail refresh tokens (and users' API keys) |
| Schedule and keep-alive | Cloudflare Worker cron | Free; keeps the API awake and triggers sync |

### 12.1 Libraries

**Used now:** `express`, `mongoose`, `dotenv`, `cookie-parser`, `jsonwebtoken`, `googleapis`, `html-to-text`, `zod`, `chrono-node`, `@langchain/core`, `@langchain/groq`, `@langchain/openai`, `@langchain/textsplitters`; `react`, `react-dom`, `react-router-dom`, `axios`, `tailwindcss`; tooling `nodemon`, `eslint`, `wrangler`. Tests use Node's built-in test runner (`node:test`).

**Planned (added when the feature that needs them is built):** `helmet`, `cors`, `express-rate-limit` (deployment); `pino` (logs that never contain email text); `react-markdown`, `date-fns`, `lucide-react`, toast notifications (front-end redesign).

## 13. Data model

| Collection | Key fields |
| --- | --- |
| `users` | googleId, email, name, encryptedRefreshToken, sync {historyId, backfillPageToken, backfillDone, lastSyncedAt, lastError} |
| `messages` | userId, gmailId, threadId, from, fromMe, date, subject and body (redacted), strict, hidden (count per type, never the values), labelIds, bulkSender, deadlineAt, eventAt |
| `threads` | userId, threadId, latestMessageId, status (pending/classified/failed), classification {category, categoryProbs, securityP, needsActionP, urgency, dateKind, promoCap, source, questionsVersion}, dueAt, state (open/done/snoozed), snoozeUntil, userLabel {category, needsAction} |
| `senderrules` | userId, sender (email address), category |
| `chunks` | userId, gmailId, threadId, date, sender, part, text, embedding (1,024), embeddingModel |

## 14. Security and privacy

- **Read-only Gmail access:** Mailmind cannot send, delete or change mail.
- **Secrets never leave the server:** raw email text exists only in memory while an email is processed; only the redacted copy is stored.
- **Only redacted text reaches any AI service** (Jev, Groq, Cloudflare). The classifier sees only the sender's domain.
- **Provider data policies:** Cloudflare does not train on or keep inputs; the README states each provider's policy.
- **Encrypted credentials:** the Gmail refresh token is stored with AES-256-GCM (verified: the database holds only the encrypted form). Email text is stored redacted but not encrypted, so it can be searched.
- **Login:** a signed token in an httpOnly cookie, as in the course repository. Every query is scoped to the logged-in user; tested: one user cannot read or change another user's emails.
- **No secrets in Git:** `.env` is ignored and has never been committed; `.env.example` documents the variables.
- **Known limit:** the words of an email (names, personal content) can reach the AI services. Mailmind protects secrets, not every private detail, and says so.

## 15. Error handling

| Failure | Behaviour |
| --- | --- |
| Gmail access unticked at sign-in | Message asking the user to sign in again and allow Gmail |
| Gmail login expired or revoked | Sync stops; a link asks the user to sign in again |
| Server restarts during the first sync | Carries on from the last saved page |
| Jev unavailable, out of credit or a bad key | gpt-oss-20b classifies instead |
| A Groq model reaches its daily limit | The next model (gpt-oss-120b) takes over; if all are used up, conversations wait as "sorting…" and the chat says the free daily AI limit is used up |
| Groq's per-minute limit | Requests wait their turn instead of failing |
| Embedding service unavailable | Sync still completes; the emails are indexed on the next sync |
| No relevant email for a question | "I couldn't find this in your inbox" |
| A new message arrives during classification | The older result is discarded |

## 16. Testing and evaluation

| What | How | Result so far |
| --- | --- | --- |
| Redaction | 141 unit tests (33 written to break it) + 70 of the author's real emails checked by hand and by an independent leak scanner | No leaks; 8 bugs found and fixed (e.g. postal PIN codes hidden, bank alerts hiding every amount) |
| Dates | 25 unit tests + 17 real emails with dates | 5 bugs found and fixed (e.g. "July 21" read as July 2021) |
| Classification | Jev vs gpt-oss-20b on 76 real conversations; corrections in the app become hand labels | Jev right on 16 of 17 disagreements; full labelled accuracy report to come (target ≥ 85% category accuracy) |
| Ask your inbox | Real questions on the author's inbox, including follow-ups and unanswerable ones | All correct so far; a 20-question test set with known answers is planned (target ≥ 80%, every answer cited) |
| Authorisation | Automated and live tests across two accounts | No cross-user access |

## 17. Deployment

- **Front end:** Vercel (rewrites `/api/*` to Render). **API:** Render free tier. **Database:** MongoDB Atlas free tier (must accept connections from Render, which has no fixed address). **Scheduler:** Cloudflare Worker.
- **Evaluator access:** see question 2 in section 19.

## 18. Timeline

| Dates | Milestone |
| --- | --- |
| 5–7 Oct | Design; redaction, dates, sync, classification, Today view and Ask your inbox built and tested on a real inbox |
| 8–10 Oct | Deployment of all services; evaluator access settled |
| 11–17 Oct | Front-end redesign; "Delete all my data"; bring your own key |
| 18–21 Oct | Hand-labelling and the evaluation report (classification, dates, chat) |
| 22–24 Oct | README, architecture diagram, demo video |
| 25–27 Oct | Buffer, final checks, submission |

## 19. Risks

| Risk | Mitigation |
| --- | --- |
| Groq's free tier: 1,000 requests a day and 8,000 tokens a minute per model | Requests are throttled; when one model's day runs out, the next takes over; Jev now does classification, so Groq is mainly used for chat |
| Jev runs on a small OpenRouter credit ($1.20) shared by a college club member | About $0.00004 per conversation, so it lasts a long time; gpt-oss-20b takes over automatically if it runs out |
| A secret slips through redaction | Rules-first design, stricter storage for security emails, adversarial tests, checks on real email |
| Free tiers change (Render, Atlas, Groq, Cloudflare) | Every model sits behind an interface and can be swapped |
| A college Google Workspace may block the app | Personal Gmail is fully supported; Workspace is best effort |
| Three weeks of scope | Core workflows are already built; remaining work is deployment, design and documentation |

## 20. Questions for you

1. **Scope:** are the four workflows (Connect & sync, Protect & classify, Triage, Ask your inbox) the right depth for the end-term project?

2. **Evaluator access (I need your decision on this):** Mailmind reads Gmail, and Google treats Gmail access as a *restricted* permission. While the app is unverified, Google allows only two setups:
   - **Testing mode (current):** only Google accounts I add to a "test users" list (up to 100) can sign in. You would send me the Gmail address you want to use, I add it, and you sign in normally from any browser, including incognito. Access expires every 7 days and needs a fresh sign-in.
   - **Published but unverified:** anyone can sign in without being added first, but Google shows a warning, "Google hasn't verified this app", and the user clicks "Advanced → Go to Mailmind" to continue. At most 100 people can ever sign in. *(I still need to confirm that Google allows this for Gmail access.)*
   - **Fully verified, with no warning:** needs Google's review and a paid third-party security assessment, so it is not possible before 27 October.

   The guidelines ask for access "from an incognito window without extra permissions". Which would you accept: adding your Gmail as a test user, the published version with Google's warning screen, or relying on the demo video?

3. **AI services:** is it acceptable to rely on free tiers (Groq, Cloudflare) and a small shared OpenRouter credit for Jev, given each sits behind an interface and can be swapped?

4. **Privacy design:** secrets are removed on the server before any AI call, originals are never stored, and credentials are encrypted. Does this meet your expectations for handling personal email?

5. **Anything missing** that you would expect to see?
