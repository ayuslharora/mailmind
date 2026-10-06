# Mailmind — Decision log

**Author:** Ayush · **Period:** 5–7 October 2026 · **Purpose:** a record of every major decision made while planning Mailmind: what was tried, what went wrong, and why the final choice won.

The final design is in `docs/PRD.md`. The classification design is covered in depth in `docs/classification-case-study.md`.

---

## 1. Product direction

| Stage | Idea | What went wrong | Outcome |
| --- | --- | --- | --- |
| V1 PRD | A "privacy-first inbox assistant": a privacy gate that blocked sensitive emails from the cloud, plus triage, a digest and RAG chat | The gate dominated the design. Sensitive emails (offer letters, bills, results) were blocked, so the assistant could not help with the emails that mattered most. Triage mostly duplicated Gmail's tabs. Success was measured by leak rate, not usefulness | Rewritten |
| V2 PRD | A daily brief: Reply needed, Due soon, Waiting on; the gate *routes* email instead of dropping it | Better product, but still a single-user tool, and a public Gmail app needs Google's restricted-scope verification | Ideas kept: deadlines, urgency, done/snooze |
| Alternatives | GitHub duplicate-issue finder; campus notice hub; exam-paper analyser | Rejected by the author: the goal is a tool used in daily life, and email is where important things get buried | Email assistant kept |
| Final | **Mailmind:** reads the last month of Gmail, removes secrets before any AI sees the mail, sorts by urgency, collects deadlines and answers questions with links to the source emails | — | Chosen |

**Constraints that shaped everything:** the end-term guidelines (deadline 27 October 2026; a deployed working app; 3–5 workflows built in depth; real git history; README; demo video; evaluators must get in from an incognito window without extra permissions) and a requirement that the project cost nothing to run.

## 2. Website or browser extension

| Option | Problem | Outcome |
| --- | --- | --- |
| Browser extension reading the Gmail page | Only sees the ~50 emails on screen; fetching a month needs the Gmail API anyway, with the same restricted access. Extensions don't run on most phone browsers. Not accepted for the end-term submission | Moved to v2 |
| **Website using the Gmail API** | Testing mode allows at most 100 test users, and Google's sign-in expires every 7 days | **Chosen.** Demo mode covers evaluators; the extension can later become a second front end on the same backend |

## 3. Privacy model

| Stage | Approach | What went wrong | Outcome |
| --- | --- | --- | --- |
| 1 | Block every sensitive email from AI (V1) | Blocked the most important emails | Rejected |
| 2 | Only filter OTPs and passwords; everything else goes to the AI | OTPs are the least dangerous secret (they expire in minutes). Reset links, card numbers, Aadhaar, PAN and API keys matter more | Widened to "secrets" |
| 3 | NLP model decides which emails need redaction, then regex redacts | Makes the NLP a single gatekeeper: if it misses, regex never runs and the raw secret goes to the AI. Two ways to fail instead of one | Rejected |
| 4 | Send only the subject to an AI to decide | Subjects are often vague ("Welcome back!") while the body holds the code, and the subject itself can contain the code | Rejected as the only signal |
| 5 | **Heavily redact first, then let the AI classify the redacted copy** | — | **Chosen.** The model never sees a secret, whatever its data policy |

**Final privacy promise:** pattern-based secrets never leave the API server, and AI providers only receive redacted text. The words of an email (names, personal content) can still reach the AI; Mailmind protects secrets, not every private detail, and the README says so.

## 4. Classifier model

**Requirement:** typed answers with probabilities, at no cost.

| Option | Finding | Outcome |
| --- | --- | --- |
| Jev (TypeSafe AI) via OpenRouter | Worked very well on a sample email (category academic 1.00, needs action 0.97, has deadline 0.99), about $0.000027 per email | Paid: every provider requires at least a $5 top-up |
| Jev Router (OpenRouter) | Not Jev: it forwarded the request to an OpenAI model on Azure and returned plain text | Rejected |
| Jev on Vercel AI Gateway | Vercel's free monthly credit does not cover Jev | Not free |
| "Jev for free" article | Real, but described a promotion that ended on 25 September | Expired |
| Local zero-shot NLI model | Needs more memory than Render's free tier; one model pass per label | Dropped |
| Laya on Vercel AI Gateway | Free, same API as Jev. No no-training guarantee. Reported zero-shot accuracy 0.362 on TypeSafe's benchmark, barely above random (0.318) and below always guessing the most common answer (0.461); free on Vercel only until 31 October 2026, four days after submission | First chosen as main classifier → **moved to the evaluation only** |
| Jev as main classifier | Built for exactly this question shape, with probabilities. But its only accuracy figure (0.727) is the vendor's own benchmark, it is paid, and the OpenRouter endpoint is in alpha | **Challenger in the evaluation** if a key arrives (asked the college AIML club) |
| **gpt-oss-20b on Groq** | Free key confirmed working; structured JSON output; already used for RAG. No built-in probabilities | First the fallback → **chosen as main classifier**, prompted to answer in Jev's shape: a probability for each yes/no answer, each choice option and each urgency level. Swapping in Jev later means writing one adapter. Its probabilities are self-reported, so thresholds are tuned on labelled emails |
| Fine-tuned Laya | Weights are open (Apache-2.0); a public Kaggle notebook fine-tunes it on free GPUs in about four hours; could be self-hosted on a free Hugging Face Space. Needs several hundred labelled real emails | **Stretch goal** |

**Lesson:** the classifier was first chosen for being free and having the right output shape, before checking its accuracy. Once the published numbers were read, the choice was reversed. The final pick is decided by measuring all candidates on the same hand-labelled real emails, not by reputation.

**Rule:** every number reported in the evaluation comes from real runs.

**Still to verify:** how well gpt-oss-20b's stated probabilities match reality, and whether Groq's free limits can handle the 30-day backfill. Vercel needs a card on file before serving any request, even free models (needed for embeddings and the Laya evaluation).

## 5. Redaction

| Stage | Approach | What went wrong | Outcome |
| --- | --- | --- | --- |
| 1 | Redact every link | Newsletter and blog links became useless | Changed |
| 2 | Keep safe content links (query string stripped); redact links with sensitive words, token-like paths, shorteners or credentials; redact all links in OTP emails | — | **Kept** for the stored copy |
| 3 | First regex and 32 self-written tests: all passed | Tests written by the regex's author only check what the author expected | Challenged |
| 4 | 33 adversarial cases written to break it | **20 of 33 failed:** codes with no trigger word, dotted and spaced codes, lowercase codes, Devanagari and full-width digits, Hindi words, URL shorteners, wrapped and percent-encoded URLs | Fixed; 65 tests now pass. Independent tests on real emails are still needed |
| 5 | Replace every number with `[NUM:n]` for classification | Lost meaning: "₹5 debited" vs "₹50,000 debited"; "due in 2 days" | Changed |
| 6 | **Typed placeholders:** only code-shaped numbers hidden; amounts become ranges; dates, times and small counts kept; facts such as `deadline_in_days` computed on the server | — | **Chosen** |
| 7 | Coupon codes (e.g. SAVE50) were redacted as if they were OTPs, so "find my coupon" failed | Storing unredacted text would store real OTPs | **Fix 1 (now):** codes next to coupon/promo/discount words, in emails with no OTP words, are kept. **Fix 2 (future idea):** the AI sees placeholders, and the server swaps real values back in for the user's screen only. Downgraded from stretch goal because every answer already links to the exact Gmail message, so a hidden value is one click away |
| 8 | Cards (Luhn check), Aadhaar (Verhoeff check), PAN, account numbers after an account label, PINs/CVVs, passwords after "password is/:" | Writing the tests exposed two bugs in the existing module: "PIN code: 560001" (a postal code) was hidden as an OTP, and "Never share your OTP" in a bank alert hid every amount ("Rs 2500" → `[OTP]`) | **Fixed:** "PIN code" is not a code word; a number after Rs/₹/INR is never a code. 107 tests pass |
| 9 | IFSC codes hidden too | They are public bank-branch codes; hiding them protects nothing (YAGNI) | **Dropped** |
| 10 | Fix 1 implemented: a code is kept as a coupon only if the email has no OTP words, it is in capitals starting with three letters with at most four digits (SAVE50, not K7P9QX or 482913), a coupon word is within 60 characters, and no login or verification word is nearby | — | **Kept**; 17 tests, 9 of them checking that look-alike login codes stay hidden |

**Accepted trade-off:** some over-redaction (e.g. a room number near "sign in"). The user loses nothing visible, because opening an email shows the original, fetched live from Gmail.

## 6. Storage tier

**Rules decide when they are sure; the AI decides only when they are not:**

| Rules | Classifier `security` | Stored copy |
| --- | --- | --- |
| Sure (strong OTP word, card, Aadhaar, PAN) | ignored | Strict |
| Unsure (weak word near a code-shaped number) | ≥ 0.3 → strict, < 0.3 → light | — |
| Nothing found | ≥ 0.3 → strict, < 0.3 → light | — |

Lowest level is **light**, never "none": a wrong AI answer must not send a raw secret anywhere.

## 7. Context, promotions and urgency

| Problem | Rejected option | Final choice |
| --- | --- | --- |
| A single message lacks context ("Sounds good, see you then") | Send the entire thread on every update: exceeds the context of the decision models being evaluated; cost grows with every reply | Classify per **thread**: latest message (start and end) + 2 earlier messages trimmed + `from_me` flags; reclassify on each new message |
| Long emails cut at 1,500 characters lose a closing "P.S. reply by Friday" | — | First ~1,200 and last ~300 characters |
| Promotions can claim "URGENT" | Trust the model alone | Gmail's own category and bulk-mail headers combined with the classifier's promo score; both agree → urgency capped, never in "Needs action" |
| The classifier cannot see exact dates (they may sit near hidden numbers) | Ask the model for urgency alone | Server finds the date (chrono-node, raw text in memory, email's sent date as reference, IST). **Final urgency = max(model urgency, date urgency)**, computed every time the dashboard loads: < 1 day urgent, < 3 days today, < 7 days this week |
| Events vs deadlines | — | Both count. The classifier chooses deadline / event / no date, so the app can show "Due Fri" or "Event Fri" |
| Missed deadlines | Hide after 2 days | Stay until the user dismisses them; shown low on the page, not at the top (final placement decided in the front end) |

## 8. Hosting and models

| Stage | Plan | What went wrong | Outcome |
| --- | --- | --- | --- |
| 1 | Everything on Render's free tier | Two local models (NLI + embeddings) could exceed 512 MB; a fraction of a CPU makes inference slow | Changed |
| 2 | Two Render accounts to split the backend | Likely against Render's terms; double cold starts; same weak CPU | Rejected |
| 3 | Models on a Hugging Face Space | Unredacted text would travel to another host before redaction | Mitigated by running regex first, then made unnecessary |
| 4 | **No local models at all** | — | **Chosen.** An API model classifies the redacted copy; embeddings come from an API |
| Embeddings | Groq | Groq offers no embedding models | Rejected |
| Embeddings | **`alibaba/qwen3-embedding-0.6b` via Vercel AI Gateway** | Covered by the free $5/month credit (≈ $0.006/month for one inbox), multilingual, provider stores nothing and does not train | **Chosen** |
| Answers | Llama on Groq | Llama models are now Enterprise-only on Groq | Changed |
| Answers | **`openai/gpt-oss-20b` on Groq** | Free key confirmed working | **Chosen**; low reasoning effort for parsing, medium for answers |
| Keep-alive | Pinger every 15 minutes, hosted on Render | Races Render's 15-minute sleep; a second always-on Render service exceeds the 750 free hours | **Cloudflare Worker every 10 minutes**; also triggers the 15-minute sync |
| Cookies | Front end on Vercel, API on Render | Login cookie becomes third-party and browsers may block it | **Vercel rewrites `/api/*` to Render** (same origin) |

## 9. Security and keys

| Topic | History | Final |
| --- | --- | --- |
| Encryption | Per-user envelope encryption → simplified to one master key → restored per-user keys → reconsidered | **Only Gmail refresh tokens and API keys are encrypted** (AES-256-GCM). Email text is stored already redacted and left unencrypted, because MongoDB cannot keyword-search encrypted text |
| Bring your own key | Moved to v2 to save time → restored at the author's request | **In scope:** users can add their own Groq key (and optionally Jev). Embeddings run on the project's free Vercel key |
| Original emails | — | Never stored; fetched live from Gmail when opened |
| API keys shared during planning | Keys were pasted into the planning chat | Rotate them; keep keys only in `.env`; `.env` in `.gitignore` |

## 10. RAG

| Decision | Alternatives | Final |
| --- | --- | --- |
| Framework | No framework (fewer dependencies); LangChain in a separate Python service | **LangChain.js** inside the Node API: same concepts the author learned in Python, one backend |
| What is indexed | Redacted vs unredacted text | The **stored copy** (light or strict), including promotions; coupon codes kept by the coupon rule |
| Search | Semantic only | **Hybrid:** vector + keyword, merged with Reciprocal Rank Fusion, always filtered by user |
| Answers | Free text | Structured output `{found, answer, citations}`; citations checked in code; "couldn't find it" instead of guessing |
| Conversation | One question at a time | **Follow-up questions**, rewritten into standalone questions using recent history |
| Scope | First 30 days only | 30-day backfill, then **keeps growing** with every new email |
| Links | Generic Gmail links | Link to the exact message, including the account (`authuser`) so the right Gmail account opens |

## 11. Today view, sync, sign-in and demo

| Topic | Decision |
| --- | --- |
| Today view | Urgent → Needs action → Coming up this week → summary line; Missed lower or collapsed. Each item shows subject + first line (no extra AI call). Actions: done, snooze (tomorrow / next week / date), change category with "apply to this sender", open in Gmail, add to calendar. "Done" changes only Mailmind (read-only Gmail access) |
| Sync | 30-day backfill, skips spam and trash, includes Sent mail for context, resumable page by page with a progress bar; then incremental sync via Gmail history every 15 minutes plus "Sync now"; deleted Gmail emails are removed; reconnect banner when the login expires |
| Sign-in | One step: Google sign-in requests Gmail read access on the same screen; if the user unticks Gmail access, the app asks for it instead of breaking |
| Demo mode | ~300 AI-generated, reviewed fake emails of an Indian student's inbox, saved as JSON with dates relative to today and correct labels (a test set too); processed once at deploy by the real pipeline; each visitor gets a private copy deleted after 24 hours |

## 12. Libraries

A YAGNI review proposed cutting the dependency list from about 40 packages to 17. The author reverted it and kept the full list. Two points from the review still stand: keep `pino` (its `redact` option stops secrets reaching logs), and use a Vercel rewrite for same-origin cookies. Model changes since then: `@huggingface/transformers` and `@langchain/community` are no longer needed; `@langchain/openai` is added for the Vercel embeddings endpoint.
