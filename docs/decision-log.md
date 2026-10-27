# Mailmind — Decision log

The main engineering decisions behind Mailmind: what was chosen, what was considered instead, and why. The full design is in [`PRD.md`](PRD.md); the classifier is covered in depth in the [classification case study](classification-case-study.md).

## 1. Privacy model

The core question: how can an AI sort an inbox without seeing the secrets in it?

| Option | Why not | Outcome |
| --- | --- | --- |
| Block sensitive emails from the AI entirely | The blocked emails (bills, offer letters, results) are the ones that matter most, so the assistant could not help with them | Rejected |
| Hide only OTPs and passwords | OTPs expire in minutes and are the least dangerous secret; card numbers, Aadhaar, PAN and reset links matter more | Rejected |
| Let an AI model decide which emails need redaction | If the model misses one, the raw secret goes straight to the AI. Two ways to fail instead of one | Rejected |
| **Redact every email on the server first, then let the AI classify the redacted copy** | — | **Chosen.** No AI ever receives a secret, whatever its data policy |

What this protects is secrets, not every private detail: the words of an email (names, personal content) can still reach the AI, and the privacy policy says so.

## 2. Website, not a browser extension

| Option | Why not | Outcome |
| --- | --- | --- |
| Browser extension reading the Gmail page | Only sees the ~50 emails on screen, so a month of mail needs the Gmail API anyway. Does not run on most phone browsers | Rejected |
| **Website using the Gmail API (read-only)** | — | **Chosen.** Reads 30 days of mail and syncs only what changed |

## 3. Classifier

The classifier answers five questions per conversation (security email? what kind? needs you? how urgent? date to act by?) and must give a probability for each answer, so the app can set thresholds.

| Option | Why not | Outcome |
| --- | --- | --- |
| gpt-oss-20b on Groq as the main classifier | Free and fast, but its probabilities were not useful: it answered exactly 0 or 1 for most yes/no questions, so it was overconfident and thresholds meant nothing | **Fallback** when Jev is unavailable |
| Laya (open decision model) | Its published accuracy is barely above random guessing | Rejected |
| A local zero-shot model on the server | Needs more memory than Render's free tier, and runs once per label | Rejected |
| **Jev (TypeSafe AI) via OpenRouter** | — | **Chosen.** Built for exactly this question shape and gives real probabilities instead of 0 or 1. On the author's inbox, it was right on 16 of the 17 conversations where it and gpt-oss-20b disagreed |

Both models answer in the same shape behind one interface, so switching between them needs no other change.

## 4. Redaction

| Decision | Reason |
| --- | --- |
| Own rules instead of an AI | Rules run on the server before anything leaves it, are predictable, and can be tested |
| Checksums for cards (Luhn) and Aadhaar (Verhoeff) | Separates real numbers from look-alike order IDs |
| **Strict mode:** if an email contains a real secret, hide every code and link in it | Favours hiding every secret over keeping every harmless number. Missing a card number is a privacy failure; hiding an order number only costs a click, since the original is one link away in Gmail |
| Keep safe content links, hide risky ones (reset, login, shortened, token-like) | Hiding every link made newsletters useless |
| Keep coupon codes such as SAVE50 | Hidden coupons made "find my coupon" fail. A strict pattern keeps them apart from login codes |
| Do not hide IFSC codes | They are public bank-branch codes; hiding them protects nothing |
| Rejected: replace every number with a placeholder | Lost meaning the AI needs: "₹5 debited" and "₹50,000 debited" looked the same |

Tests written by the rules' own author mostly confirm what the author expected, so 33 tests were written specifically to break the rules. 20 of them failed at first (spaced codes, Devanagari digits, shortened links, and more). All were fixed before the app was built on top.

## 5. Sorting and urgency

| Decision | Rejected option, and why |
| --- | --- |
| Classify per **conversation**: the latest message plus two earlier ones, trimmed | A single message lacks context ("Sounds good, see you then"); sending the whole thread grows the cost with every reply |
| Keep the first ~1,200 and last ~300 characters of a long email | Cutting at a fixed length lost closing lines like "P.S. reply by Friday" |
| The server reads deadline and event dates (chrono-node plus own rules); **urgency = the higher of the AI's urgency and the date's** | The AI alone cannot see exact dates reliably, because they may sit next to hidden numbers |
| Urgency is recomputed every time Today loads | A stored urgency goes stale as deadlines approach |
| Promotions are capped: when Gmail's category and the classifier both say "promotion", the email never reaches Needs action | Promotions often claim "URGENT"; trusting the AI alone let them through |

## 6. Hosting and AI services

| Need | Chosen | Rejected, and why |
| --- | --- | --- |
| Where the AI runs | **API models only**, no models on the server | Local models need more memory and CPU than Render's free tier (512 MB) |
| Embeddings for search | **bge-m3 on Cloudflare Workers AI**: free, multilingual, Cloudflare does not train on or keep the text | Gemini's free tier uses data to improve its products; Groq has no embedding models |
| Answers in Ask | **gpt-oss-20b on Groq**, then gpt-oss-120b when the daily limit is reached | Llama models on Groq are now Enterprise-only |
| Keeping the free API awake | **Cloudflare Worker** pinging every 10 minutes, which also runs the 15-minute sync | A pinger on Render would exceed Render's free hours |
| Login cookie across Vercel and Render | **Vercel rewrites `/api/*` to Render**, so the cookie is first-party | A cross-site cookie can be blocked by browsers |

## 7. Security

| Decision | Reason |
| --- | --- |
| Original emails are never stored | Opening an email goes to Gmail; only the redacted copy is kept |
| Encrypt the Gmail refresh token (AES-256-GCM), not the email text | The email text is already redacted, and encrypted text could not be searched |
| Read-only Gmail access | Mailmind never needs to send, delete or change mail |

## 8. Ask your inbox

| Decision | Rejected option, and why |
| --- | --- |
| **LangChain.js** inside the Node API | A separate Python service would mean a second backend to host and keep awake |
| **Hybrid search**: by meaning and by keywords, always filtered to the signed-in user | Meaning-only search misses exact names and numbers |
| Structured answers with citations checked in code; "couldn't find it" instead of guessing | Free-text answers could cite emails that were never retrieved |
| Follow-up questions rewritten into standalone ones | Without it, "and when is it due?" loses its subject |
| "What's due" questions answered from the stored deadlines | A similarity search returns only the few closest emails and missed deadlines |

## 9. Sign-in and evaluator access

| Option | Why not | Outcome |
| --- | --- | --- |
| Google "Testing" mode | Every user must be added by hand, and sign-ins expire every 7 days | Replaced |
| Full Google verification | Needs a paid security assessment and weeks of review | Not possible before submission |
| **Published, unverified app** | — | **Chosen.** Anyone can sign in after Google's warning screen (up to 100 accounts) |
| **Demo mode** alongside it | — | **Chosen.** One shared fake inbox, processed once by the real pipeline, so visitors can try Mailmind without Gmail and without new AI calls; each visitor's changes stay in their own browser |
