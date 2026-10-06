# Mailmind — Product Requirements Document

**Author:** Ayush · **Date:** 7 October 2026 · **Status:** Final design, for approval · **Submission deadline:** 27 October 2026

## 1. Summary

Mailmind is a web app that reads a user's Gmail, removes secrets such as OTPs, card numbers and password-reset links before any AI model sees the mail, and then shows what is urgent, collects deadlines and events, and answers questions about the inbox in a chat, with links to the exact Gmail messages.

## 2. Problem

- Most of an inbox is promotions, newsletters and automated notifications. The few emails that matter (an assignment deadline, a recruiter reply, a bill) get buried.
- Finding an old email means guessing the exact keywords Gmail search needs.
- AI tools could help, but giving them an inbox exposes OTPs, card numbers, Aadhaar/PAN and login links.

## 3. Target users

Indian college students and early-career professionals whose Gmail mixes college, placement, finance and promotional mail, and who want AI help without handing their secrets to an AI provider.

## 4. Core workflows

| # | Workflow | What the user does | What the system does |
| --- | --- | --- | --- |
| 1 | **Connect & sync** | Signs in with Google | Requests Gmail read access on the same screen; backfills 30 days with a progress bar; then syncs new mail every 15 minutes and on "Sync now" |
| 2 | **Protect & classify** | Nothing | Redacts each thread, classifies it with an AI model, finds deadlines, stores a safe copy |
| 3 | **Triage** | Opens the Today view; marks items done, snoozes, corrects categories, adds dates to the calendar | Ranks threads by urgency, recomputed every time the page loads |
| 4 | **Ask your inbox** | Chats with the inbox, including follow-up questions | Hybrid retrieval over the user's emails; answers cite the exact Gmail messages; says so when it cannot find an answer |

## 5. Scope

**In scope for 27 October**

- One-step Google sign-in with read-only Gmail access
- 30-day backfill (resumable), incremental sync every 15 minutes, "Sync now", removal of emails deleted in Gmail
- Redaction on the server before any AI call; redaction log
- Thread classification with gpt-oss-20b (category, security, needs action, urgency, deadline/event), returning a probability for every answer in the same shape as a decision model such as Jev
- Deadline and event extraction; urgency that rises as a date approaches
- Today view: done, snooze, category correction with sender rules, Add to Calendar (pre-filled Google Calendar link), open in Gmail
- Ask your inbox: chat with follow-up questions, hybrid search, citations linking to Gmail
- Coupon and promo codes kept searchable
- Bring your own key for Groq (and optionally Jev); encryption of Gmail tokens and API keys; "Delete all my data"
- Demo mode with a synthetic inbox and a private copy per visitor

**Out of scope**

- Sending, deleting or modifying email; Google Calendar API writes; email providers other than Gmail; attachments; browser extension (future front end on the same backend)

**Stretch goal**

- Fine-tuned Laya: Laya's weights are open (Apache 2.0), so it can be fine-tuned for free on Kaggle with hand-labelled real emails and self-hosted on a free Hugging Face Space. Attempted only once the core is done; compared against gpt-oss-20b in the classification evaluation

**Future idea**

- Placeholder restoration: the AI only sees placeholders such as `[COUPON_1]`, and the server puts the real value back on the user's screen. Not needed now: coupon codes are already kept, and every answer links to the exact Gmail message, so any hidden value (such as an OTP) is one click away

## 6. Architecture

```
React client (Vercel) ── /api/* rewritten to Render (same origin, first-party cookie)
      │
Express API (Render) ─────────────────────────► MongoDB Atlas (vector index + text index)
      │  no AI models run here
      ├─ Gmail API (read-only)                    sync, threads, Sent mail, history, labels
      ├─ Cleaning + redaction                     raw text only in memory
      ├─ chrono-node                              deadlines from raw text, in memory
      ├─ Groq ── gpt-oss-20b                      classification of the redacted copy, RAG answers, question rewriting
      ├─ Vercel AI Gateway ── Qwen3 embeddings    embeddings of the stored (redacted) copy
      │                   └─ Laya                 evaluation only
      └─ OpenRouter ── Jev                        evaluation only (if a key is available)

Cloudflare Worker (cron) ──► /health every 10 min (keeps Render awake) and the 15-minute sync
```

**Key design decisions**

- **Redact before every AI call.** Each model only receives redacted text; secrets never leave the API server.
- **Rules first, AI second.** Deterministic rules decide whenever they are sure; the AI decides only uncertain cases, and can only make redaction stricter.
- **Fail closed.** Any failure leads to a safer state: a thread is retried later rather than processed with less redaction.
- **No local AI models.** All models are called through APIs, so the free 512 MB API server stays small and fast.
- **Classifier behind one interface.** The classifier receives the questions in Jev's format and returns answers in Jev's shape: a probability for yes/no questions, a probability for each option in a choice, and a value for a score. gpt-oss-20b is prompted to answer in exactly this shape, so replacing it with Jev or a fine-tuned Laya only means writing a new adapter.
- **Original emails are never stored.** Opening an email fetches it live from Gmail.

## 7. Pipeline: from email to classification

1. **Fetch:** Gmail API, read-only, last 30 days (spam and trash skipped), including Sent mail for context.
2. **Clean:** HTML to text, quoted replies removed, grouped by thread.
3. **Build the thread context:** the latest message (first ~1,200 and last ~300 characters), the two earlier messages trimmed to ~300 characters, and a `from_me` flag on each.
4. **Redact:** the same redacted copy is classified, stored and later used by RAG (section 8). There is no separate copy for classification.

   | Content | Treatment |
   | --- | --- |
   | One-time codes (near code words, or anywhere in an OTP email) | `[OTP]` |
   | Card (Luhn check), Aadhaar (Verhoeff check), PAN, account number, PIN/CVV, password | `[CARD]`, `[AADHAAR]`, `[PAN]`, `[ACCOUNT]`, `[PIN]`, `[PASSWORD]` |
   | Phone numbers (with a `+` country code or after a phone label), IP addresses | `[PHONE]`, `[IP]` (personal, not secret: they do not make the email strict) |
   | Risky links (reset, login, tokens, shorteners) | `[LINK:domain]` |
   | Safe content links | Kept, tracking removed |
   | Amounts, dates, times, order numbers, coupon codes | Kept |
   | Sender | Domain only |

5. **Add facts computed on the server:** `deadline_in_days` (chrono-node), Gmail's own category label, and whether the email is bulk mail (`List-Unsubscribe` / `Precedence: bulk`).
6. **One gpt-oss-20b call** (Groq, structured output, low reasoning effort) answering five questions: security email? (yes/no), category (Academic, Jobs, Finance, Personal, Notifications, Promos), needs action? (yes/no), urgency (0–4), date kind (deadline / event / none). Every answer comes with a probability, in the same shape Jev returns. These probabilities are the model's own estimates, not calibrated values, so the thresholds are tuned on the hand-labelled evaluation set.
7. **On failure:** invalid output is retried once; if Groq is unavailable or rate-limited, the thread is marked pending and retried later. It is never processed with less redaction.
8. **Post-classification rules:** if the classifier and Gmail's headers both say promotion, urgency is capped and the thread never appears under "Needs action".

The full reasoning is in `docs/classification-case-study.md`.

## 8. Storage, deadlines and urgency

**Stored copy.** Rules first:

| Rules | Security probability | Stored copy |
| --- | --- | --- |
| Sure there is a secret (strong OTP word, card, Aadhaar, PAN) | ignored | **Strict:** every code-shaped number and every link hidden |
| Unsure, or nothing found | ≥ 0.3 | Strict |
| Unsure, or nothing found | < 0.3 | **Light:** only secrets hidden; safe content links (with tracking removed), dates, amounts and coupon codes kept |

**Deadlines and events.** When the classifier reports a deadline or event, chrono-node reads the raw text in memory, using the email's sent date as the reference and Indian Standard Time, and picks the date nearest words such as *due, by, last date* (or *on, at, exam, interview* for events). Dates are read day first (10/11 is 10 November); a date without a time means the end of that day; dates before the email was sent are ignored. Two additions to chrono-node cover "EOD" and "by the 15th". Only the date and its kind are stored.

**Urgency** is never stored. It is computed each time the Today view loads:
`urgency = max(classifier urgency, date urgency)`, where the date urgency is 4 if under 1 day remains, 3 under 3 days, 2 under 7 days. Missed deadlines stay until the user dismisses them.

## 9. Today view

- Sections: **Urgent**, **Needs action**, **Coming up this week** (deadlines and events), a summary line for everything else, and **Missed** shown low on the page.
- Each item: subject, first line, sender, date, kind label ("Due Fri" / "Event Fri").
- Actions: done, snooze (tomorrow / next week / pick a date), change category (optionally for every email from that sender, creating a sender rule), open in Gmail, Add to Calendar.
- "Done" and "snooze" only change state inside Mailmind; Gmail is never modified.

## 10. Ask your inbox (RAG)

**Indexing**
- One chunk per message, starting with a header line (sender, subject, date); long emails split by paragraph (LangChain `RecursiveCharacterTextSplitter`, ~800 characters with overlap).
- Embedded with `alibaba/qwen3-embedding-0.6b` through Vercel AI Gateway (LangChain `OpenAIEmbeddings` pointed at the gateway). The model name is stored with each vector.
- MongoDB Atlas vector index and text index, filterable by user, date, sender and category. The index grows with every synced email.

**Answering**
1. **Rewrite:** a follow-up question is rewritten into a standalone question using recent conversation history (gpt-oss-20b, low reasoning effort).
2. **Parse:** filters such as sender, time range and category are extracted as structured output.
3. **Retrieve:** vector search (top 20) and keyword search (top 20), always filtered by the logged-in user, merged with Reciprocal Rank Fusion (LangChain `EnsembleRetriever`); top 6 kept.
4. **Answer:** gpt-oss-20b returns `{ found, answer, citations }`.
5. **Verify:** citations not among the retrieved emails are removed; with no valid citation the app answers "I couldn't find this in your inbox".
6. **Show:** the answer with citation cards linking to the exact Gmail message, including the account (`authuser`) so the correct Gmail account opens.

## 11. Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Front end | React (Vite) on Vercel | Dashboard and chat UI; Vercel rewrites keep cookies first-party |
| API | Node.js + Express on Render | One language end to end; Gmail and AI SDK support |
| Database | MongoDB Atlas (free tier) | Flexible email documents; vector and text search in one place |
| Gmail | Gmail API (`gmail.readonly`) | A month of mail, threads, labels and incremental history |
| Classification and answers | `openai/gpt-oss-20b` on Groq | Free key, fast, structured output; already used for RAG, so one provider covers both |
| Embeddings | `alibaba/qwen3-embedding-0.6b` via Vercel AI Gateway | Within the free monthly credit; multilingual; provider stores nothing and does not train |
| Evaluation | Laya (Vercel AI Gateway), Jev (OpenRouter, if a key is available), fine-tuned Laya (stretch) | Compared with gpt-oss-20b on the same hand-labelled emails |
| RAG framework | LangChain.js | Retrievers, splitters, chains and structured output |
| Dates | chrono-node | Deterministic date parsing on the server |
| Encryption | Node `crypto`, AES-256-GCM | Standard authenticated encryption |
| Keep-alive and schedule | Cloudflare Worker cron | Free; keeps the API awake and triggers sync |

### 11.1 Libraries

**Front end (`client/`)**

| Library | Purpose |
| --- | --- |
| `react`, `react-dom` | UI |
| `vite`, `@vitejs/plugin-react` | Dev server and build |
| `react-router-dom` | Pages: Today, Ask, Deadlines, Redaction log, Settings |
| `@tanstack/react-query` | Server data fetching, caching, loading and error states |
| `axios` | HTTP client with a shared error interceptor |
| `react-hook-form`, `zod` | Settings and API-key forms with validation |
| `tailwindcss` | Styling |
| `react-markdown` | Rendering chat answers with citation links |
| `date-fns` | Date formatting for deadlines and emails |
| `react-hot-toast` | Success and error notifications |
| `lucide-react` | Icons |

**API (`server/`)**

| Library | Purpose |
| --- | --- |
| `express` | HTTP API |
| `mongoose` | MongoDB models; `$vectorSearch` aggregation |
| `googleapis` | Google sign-in and Gmail API (read-only) |
| `jsonwebtoken`, `cookie-parser` | Login as a signed JWT in an httpOnly cookie (the course repository's pattern) |
| `helmet`, `cors`, `express-rate-limit` | Security headers, allowed origins, rate limiting (demo and Ask) |
| `zod` | Request validation and structured-output schemas |
| `dotenv` | Environment variables in local development |
| `pino`, `pino-http` | Structured logging that never logs email text or keys |
| `agenda` | MongoDB-backed background jobs (backfill, sync) that survive restarts |
| `p-queue`, `p-retry` | Concurrency limits and backoff for Gmail, Groq and Vercel |
| `mailparser` | Parsing raw MIME emails |
| `html-to-text` | HTML emails to plain text |
| `email-reply-parser` | Removing quoted replies and signatures |
| `chrono-node` | Deadline and event dates |
| `langchain`, `@langchain/core` | Chains, prompts, output parsers, `EnsembleRetriever` |
| `@langchain/textsplitters` | Chunking long emails |
| `@langchain/mongodb` | `MongoDBAtlasVectorSearch`, pre-filtered by user |
| `@langchain/groq` | `ChatGroq` for gpt-oss-20b: classification, answers, rewriting |
| `@langchain/openai` | `OpenAIEmbeddings` pointed at Vercel AI Gateway for Qwen3 embeddings |
| Built-in `fetch` | Laya (Vercel `/v1/evaluate`) and Jev (OpenRouter) calls for the evaluation |
| Built-in `crypto` | AES-256-GCM encryption of Gmail tokens and API keys |

**Testing**

| Library | Purpose |
| --- | --- |
| `vitest` | Unit tests (redaction, dates, urgency, classifier output shape) |
| `supertest` | API and authorisation tests |
| `mongodb-memory-server` | Throwaway MongoDB for tests |
| `msw` | Mocking Gmail, Laya, Groq and Vercel responses |
| `@testing-library/react` | Front-end component tests |

**Tooling:** `eslint`, `prettier`, `wrangler` (Cloudflare Worker deployment).

## 12. Data model

| Collection | Key fields |
| --- | --- |
| `users` | googleId, email, encryptedRefreshToken, sync {historyId, backfillPageToken, backfillDone, lastSyncedAt, lastError}, encryptedApiKeys {groq, jev}, settings, isDemo, expiresAt (demo users) |
| `threads` | userId, threadId, latestMessageId, classification {category, categoryP, securityP, needsActionP, urgencyModel, dateKind, source, questionsVersion}, tier, dueAt, state (open/done/snoozed/dismissed), snoozeUntil |
| `messages` | userId, gmailId, threadId, from, fromMe, date, subject and body (redacted), strict, hidden (count per type, e.g. {OTP: 1, LINK: 3}; never the values), labelIds, bulkSender, deadlineAt, eventAt (both found while the raw text is in memory) |
| `sender_rules` | userId, sender or domain, rule (category override, always/never show) |
| `chunks` | userId, messageId, text, embedding, embeddingModel, date, from, category |
| `conversations` | userId, messages [{role, text, citations}], updatedAt |

## 13. Security and privacy

- **Read-only Gmail access.** Mailmind cannot send, delete or change mail.
- **Secrets never leave the API server.** Raw email text exists only in memory during processing; originals are never stored.
- **Only redacted text reaches AI services:** the classifier, Qwen embeddings and RAG answers all receive the same redacted copy, so no secret reaches any of them. The classifier sees only the sender's domain. In the evaluation, Laya and Jev receive the same copy.
- **Data policies:** each provider's data-use policy (retention and training) is checked and stated plainly in the README.
- **Encrypted credentials:** Gmail refresh tokens and users' API keys, with AES-256-GCM and a master key in an environment variable. Email text is stored already redacted and not encrypted, so keyword search works.
- **Authorisation:** every query is scoped to the logged-in user; tests check that one user cannot read another's data. Demo visitors are temporary users with their own data.
- **No secrets in Git:** `.env` is ignored; `.env.example` documents variables.
- **Delete all my data** removes the user's emails, chunks, conversations, tokens and keys.
- **Known limit:** the words of an email (names, personal content) can reach AI services; Mailmind protects secrets, not every private detail.

## 14. Error handling

| Failure | Behaviour |
| --- | --- |
| Gmail access not granted at sign-in | Message explaining Mailmind needs Gmail access, with a retry button |
| Gmail login expired (7 days in testing mode) | Sync stops; banner asks the user to reconnect |
| Server restarts during backfill | Resumes from the saved page |
| Classifier returns invalid output | Retried once; then the thread is marked pending |
| Groq unavailable or rate-limited | Thread marked pending and retried later; never stored with less redaction |
| Embedding service unavailable | Thread still appears in Today; embedded later; keyword search still works |
| Missing or invalid user API key | Clear message in Settings with a "Test key" button |
| No relevant emails for a question | "I couldn't find this in your inbox" |
| New message arrives during classification | The newer message wins; stale results are discarded |
| Server waking from sleep | Loading screen while the API starts |

Every screen has loading, empty, success and error states.

## 15. Testing and evaluation

| What | How | Target |
| --- | --- | --- |
| Redaction | Unit tests (141 passing, including 33 adversarial cases) plus real security emails from the author's inbox | No secret reaches any AI request |
| Classification | 100 hand-labelled real threads; gpt-oss-20b vs Laya vs Jev (if available) vs fine-tuned Laya (stretch) | ≥ 85% category accuracy; accuracy, speed and cost compared |
| Probabilities | Same set: how often answers given at 0.8 are actually right | Thresholds chosen from the data, not guessed |
| Security-email recall | Same set | Close to 100%; every miss reviewed |
| Promotions | 20 marketing emails written to sound urgent | None appear under "Needs action" |
| Deadlines and events | 25 unit tests (day-first dates, EOD, "by the 15th", times after dates, scores like 10/11 ignored) plus 25 real threads with dates | ≥ 90% correct |
| RAG | 20 questions with known answers, including follow-ups | ≥ 80% correct, every answer cited |
| Authorisation | Automated tests across two users and demo visitors | No cross-user access |
| Demo inbox | Every fake email carries its correct label | Regression test for the whole pipeline |

## 16. Deployment

- **Front end:** Vercel (rewrites `/api/*` to Render). **API:** Render free tier. **Database:** MongoDB Atlas free tier. **Scheduler:** Cloudflare Worker.
- **Evaluator access:** the deployed link opens in an incognito window with a **"Try the demo"** button. No Google account is needed. About 300 synthetic emails of an Indian student's inbox, with dates relative to today, are processed once at deployment by the real pipeline; each visitor gets a private copy deleted after 24 hours.
- Real Gmail works for accounts added as test users (Google allows up to 100 for unverified apps).

## 17. Timeline

| Dates | Milestone |
| --- | --- |
| 7–8 Oct | Repository and git, project skeleton, Google sign-in, first deployment of all services; Groq model check; start labelling real emails |
| 9–11 Oct | Gmail backfill (resumable, threads, Sent mail), cleaning, demo inbox generation |
| 12–14 Oct | Redaction and tests (identifiers, coupon rule), gpt-oss-20b classifier in the decision-model shape, promotion rules, storage tiers |
| 15–16 Oct | Deadlines and urgency, Today view and actions, sender rules, Add to Calendar |
| 17–19 Oct | RAG: chunking, embeddings, indexes, hybrid retrieval, cited answers, follow-ups, Gmail links |
| 20–21 Oct | Incremental sync and deletions, scheduled sync, bring your own key, delete my data, demo copies per visitor |
| 22–23 Oct | Error and empty states, authorisation tests, classifier evaluation and report; fine-tuned Laya if time allows |
| 24–25 Oct | README, architecture diagram, demo video |
| 26–27 Oct | Buffer, incognito checks, submission |

**If behind schedule, cut in this order:** snooze → sender rules → follow-up questions → RAG filters → fine-tuned Laya → Jev and Laya evaluation. Redaction, classification, Today view, basic RAG, demo mode and documentation are never cut.

## 18. Risks

| Risk | Mitigation |
| --- | --- |
| The probabilities from gpt-oss-20b are its own estimates, not calibrated like a decision model's | Thresholds tuned on the labelled set; the security threshold stays low so mistakes lead to stricter storage |
| Groq's free tier has per-minute and per-day limits that could slow the 30-day backfill | Requests queued and spread out; backfill is resumable; users can add their own Groq key |
| Laya is weak without fine-tuning (published zero-shot accuracy 0.362 on TypeSafe's typed-decisions benchmark, against 0.318 for random and 0.727 for Jev), may be limited to 512 tokens, and is free on Vercel only until 31 October 2026 | Not used in the live pipeline; evaluated only. A fine-tuned, self-hosted Laya is a stretch goal |
| Vercel AI Gateway requires a card on file, even for free models | Needed for embeddings; added before RAG work starts |
| Free tiers change (Vercel, Groq, Render, Atlas) | Every model sits behind an interface and can be swapped |
| A secret slips through redaction | Rules-first design, strict copy for the AI, adversarial tests, tests on real emails |
| Gmail login expires weekly in testing mode | Reconnect banner; demo mode unaffected |
| A college Google Workspace may block the app | Personal Gmail is fully supported; Workspace is best effort |
| Atlas free tier limits the number of search indexes | Exactly two needed (vector and text) |
| Scope for three weeks | Fixed cut order above |

## 19. Questions for you

1. **Scope:** are the four workflows (Connect & sync, Protect & classify, Triage, Ask) the right depth for the end-term project?
2. **Evaluation access:** is demo mode with a synthetic inbox acceptable, or should I also add evaluators' Google accounts as test users?
3. **AI services:** is it acceptable to rely on free tiers of external AI services (Groq, Qwen embeddings), given each sits behind an interface and can be swapped?
4. **Privacy design:** secrets are removed on the server before any AI call, and only credentials are encrypted at rest. Does this meet your expectations for handling personal email?
5. **Anything missing** that you would expect to see?
