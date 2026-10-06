# Case study: classifying private email without exposing secrets

**Project:** Mailmind · **Author:** Ayush · **Date:** 6 October 2026 · **Status:** Design decided; gpt-oss-20b is the classifier, answering in a decision model's shape (updated 7 October 2026)

## 1. The problem

Mailmind sorts a Gmail inbox so the user sees what matters first. Each **thread** is classified, and classified again whenever a new message arrives in it. Each classification needs five answers:

| Question | Answer type | Used for |
| --- | --- | --- |
| Is this a login, password or security email? | Yes/no probability | Deciding how carefully to store it |
| Which category? (Academic, Jobs, Finance, Personal, Notifications, Promos) | One choice | Dashboard tabs |
| Does it need action? | Yes/no probability | "Needs action" list |
| How urgent does it sound? | Score, 0–4 | Ranking |
| Does it mention a date? (deadline / event / none) | One choice | Triggers date extraction; "Due Fri" or "Event Fri" |

Answering these well needs an AI model. But inboxes are full of OTPs, card numbers, Aadhaar/PAN and password-reset links, and **none of that may reach a third-party AI provider.**

## 2. Constraints

1. **Privacy:** no secret may leave our server. Raw email text is only ever held in memory on the API server.
2. **Cost:** the project must run for free.
3. **Output shape:** answers must be typed values with probabilities, so code can apply thresholds instead of parsing free text, and so the model can be replaced without changing the rest of the app.
4. **Hosting:** the API runs on Render's free tier (512 MB RAM, a fraction of a CPU), which cannot hold large local models.
5. **Time:** three weeks to a working, deployed product.

## 3. Options explored

| Option | What we found | Verdict |
| --- | --- | --- |
| **Jev** (TypeSafe AI) via OpenRouter | A decision model that returns typed answers with probabilities. Live test on a sample college email: category *academic* (1.00), needs action 0.97, urgency "this week" (0.78), has deadline 0.99. 632 input tokens, cost about $0.000027, median latency about 194 ms. No free tier; every provider requires at least a $5 top-up. The only accuracy figure (0.727) comes from TypeSafe's own benchmark | Excellent fit, but paid. **Challenger in the evaluation if a key is available**; the classifier's output shape copies Jev's so it can replace gpt-oss-20b later |
| **Jev Router** (OpenRouter) | Not Jev itself: it forwards each request to another model (our test was answered by an OpenAI model on Azure) and returns plain text | Rejected: no probabilities, and data goes to an unknown provider |
| **Jev on Vercel AI Gateway** | Same price; Vercel's free monthly credit does **not** cover Jev (`availableToFreeTier: false`). An article promising free Jev referred to a promotion that ended 25 September | Not free |
| **Laya** (Convai Innovations) on Vercel AI Gateway | Open-weights (Apache-2.0) decision model, 421M parameters, same question types and same `/v1/evaluate` API as Jev. Listed at $0 and available on the free tier. Vercel lists an 8,192-token context; third-party write-ups report 512 tokens for the English model. Its listing has **no zero-data-retention and no no-training guarantee.** Reported zero-shot accuracy is 0.362 on TypeSafe's benchmark, barely above random (0.318). Free on Vercel only until 31 October 2026 | First chosen as the main classifier, then **moved to the evaluation only**: too weak without fine-tuning, and its free period ends four days after submission |
| **gpt-oss-20b on Groq** | Free key that already works; structured output through a JSON schema; already used for RAG answers. Llama models on Groq are now Enterprise-only. A general LLM has no built-in probabilities, but can be asked to state one for every answer | **Chosen as the classifier** (section 5) |
| **Local zero-shot NLI model** | Free and private, but needs memory Render does not have, and runs one model pass per label | Dropped: the classifier only receives redacted text |
| **Fine-tuned Laya, self-hosted** | Laya's weights are open (Apache-2.0); a public Kaggle notebook fine-tunes it in about four hours on two free T4 GPUs. It could run on a free Hugging Face Space (CPU), avoiding both the 31 October deadline and a third-party provider. Needs several hundred labelled real emails and a second service to keep awake | **Stretch goal**, attempted only once the core is done |

## 4. The key idea: classify the redacted copy, never the raw email

Instead of trusting a model to protect secrets, the model is never given any. Every email is redacted on the server first, and that **one redacted copy** is classified, stored and later used by RAG.

| Content | In the redacted copy |
| --- | --- |
| One-time codes: code-shaped tokens near code words, or every code-shaped token in an OTP email | `[OTP]` |
| Card numbers (Luhn check), Aadhaar (Verhoeff check), PAN, account numbers after an account label | `[CARD]`, `[AADHAAR]`, `[PAN]`, `[ACCOUNT]` |
| PINs and CVVs, passwords written after "password is" | `[PIN]`, `[PASSWORD]` |
| Risky links (reset, login, tokens, shorteners, all links in an OTP email) | `[LINK:domain]` |
| Safe content links (blogs, newsletters) | Kept, query string removed |
| Amounts, dates, times, order numbers, coupon codes | Kept |

Only the sender's **domain** is sent to the classifier, never the full address.

**A separate classification copy was designed and then dropped.** It would have turned amounts into ranges (`[AMOUNT:₹10k–1L]`) and every other long number into `[NUM:n]`. It made sense when Laya, whose provider gives no no-training guarantee, was the classifier. Now the classifier is gpt-oss-20b on Groq, and Groq already receives the redacted copy for RAG answers, so a stricter copy only for classification would hide almost nothing from it, at the cost of a day of work and another set of rules (YAGNI). Secrets are removed from the one copy either way.

### Facts computed on our server

Some meaning is worked out on the server and passed to the model as separate fields:

| Field | Computed by | Example |
| --- | --- | --- |
| `deadline_in_days` | chrono-node on the raw text, using the email's sent date as the reference and IST as the time zone | `2` |
| `gmail_category` | Gmail's own label (`CATEGORY_PROMOTIONS`, `CATEGORY_UPDATES`, …) | `"promotions"` |
| `bulk_sender` | `List-Unsubscribe` or `Precedence: bulk` header present | `true` |

## 5. Final flow

```
Gmail API → clean thread → redacted copy (+ server-computed facts) → gpt-oss-20b (one call)
          → post-classification rules → classification stored on the thread
                                          └─ invalid output: retry once
                                             └─ Groq fails or rate-limited: mark pending, retry later
```

1. **Fetch:** read-only Gmail access, last 30 days, then incremental sync. A new message in an existing thread triggers reclassification of that thread.
2. **Clean:** HTML converted to text and quoted replies removed (the earlier messages are sent separately, see below).
3. **Build the thread context:**
   - **Latest message:** its first ~1,200 and last ~300 characters, so a closing line such as "P.S. please reply by Friday" is not cut off.
   - **The two previous messages:** about 300 characters each.
   - **`from_me` on every message.** If the latest message is the user's own, nothing is waiting on them.

   Sending the whole thread on every update was rejected: long threads would exceed the context limits of the decision models in the evaluation, and cost and rate-limit pressure would grow with every reply.
4. **Redact** (section 4) and compute the server-side facts.
5. **One gpt-oss-20b call** with all five questions (low reasoning effort).
6. **Apply the post-classification rules** (below) and store one normalised result on the thread, whichever model produced it.

### Request

```json
{
  "model": "openai/gpt-oss-20b",
  "state": {
    "from_domain": "college.edu",
    "subject": "DBMS Assignment 3 submission",
    "latest": {
      "from_me": false,
      "text": "Hi all, Assignment 3 is due this Friday 11:59pm. Submit the PDF on [LINK:portal.college.edu]. Late submissions lose 20%."
    },
    "earlier": [],
    "deadline_in_days": 4,
    "gmail_category": "updates",
    "bulk_sender": false
  },
  "questions": {
    "security": {
      "type": "boolean",
      "instructions": "Is this a login code, password, security alert or account-access email?"
    },
    "category": {
      "type": "choice",
      "instructions": "Which category best fits this email thread?",
      "criteria": {
        "academic": "College courses, assignments, exams, classes.",
        "jobs": "Jobs, internships, recruiters, interviews.",
        "finance": "Banks, bills, payments, receipts.",
        "personal": "Messages from friends or family.",
        "notifications": "Automated alerts and account notices.",
        "promos": "Marketing, sales, newsletters."
      }
    },
    "needs_action": {
      "type": "boolean",
      "instructions": "Does the recipient need to reply, submit, pay or act? If the latest message is from the recipient, nothing is needed from them."
    },
    "urgency": {
      "type": "score",
      "instructions": "How urgent is this thread for the recipient?",
      "criteria": ["Can be ignored", "Read sometime", "Handle this week", "Handle today", "Handle immediately"]
    },
    "date_kind": {
      "type": "choice",
      "instructions": "Does the thread mention a date the recipient must act by or attend?",
      "criteria": {
        "deadline": "Something must be done by a date.",
        "event": "Something happens on a date (exam, interview, meeting).",
        "none": "No such date."
      }
    }
  }
}
```

The request body uses Jev's `state` and `questions` format, so the same request can be sent to Jev or Laya in the evaluation.

### Answering in a decision model's shape

gpt-oss-20b receives the `state` and `questions` above and must reply through a JSON schema (`withStructuredOutput`) in the shape a decision model returns:

| Question type | Answer |
| --- | --- |
| `boolean` | `{ "p": 0.97 }`, the probability of "yes" |
| `choice` | `{ "probs": { "academic": 0.9, "jobs": 0.05, … } }`, one probability per option; the answer is the highest |
| `score` | `{ "probs": [0.0, 0.05, 0.65, 0.25, 0.05] }`, one probability per level; the score is the expected value (here 2.25) |

The adapter checks the reply (every option present, probabilities between 0 and 1) and normalises each choice so it sums to 1. The rest of the app only sees this normalised shape, so replacing gpt-oss-20b with Jev or a fine-tuned Laya means writing one new adapter.

**Honest limit:** these probabilities are the model's own estimates. A decision model is trained to produce calibrated probabilities; an LLM is not, and tends to give round, overconfident numbers such as 0.9 or 0.95. The thresholds below are therefore tuned on the labelled evaluation set, and the evaluation reports how often answers given at, say, 0.8 are actually right.

### Post-classification rules

Email text is untrusted: a promotion can claim "URGENT: action required today". The model usually recognises promotional style, but signals the sender cannot fake decide the final answer:

| Classifier says promo (P ≥ 0.7) | Header signal (`gmail_category: promotions` or `bulk_sender`) | Result |
| --- | --- | --- |
| Yes | Yes | Urgency capped at 1; never shown under "Needs action" |
| Yes | No | Urgency lowered by 1 |
| No | Yes | Urgency lowered by 1 (protects real notices that universities send through mailing tools) |
| No | No | No change |

### Stored result (on the thread)

```json
{
  "threadId": "18c2a7f0e91b",
  "classifiedFromMessageId": "18c2a7f0e91b",
  "category": "academic",
  "categoryP": 1.0,
  "securityP": 0.02,
  "needsActionP": 0.97,
  "urgencyModel": 2.25,
  "dateKind": "deadline",
  "dateKindP": 0.95,
  "promoCap": false,
  "source": "gpt-oss-20b",
  "questionsVersion": 2,
  "classifiedAt": "2026-10-06T09:12:04Z"
}
```

Probability values shown are from the Jev test in section 3. `source` records which model produced the result, so results from different models can be compared and reclassified. The urgency shown to the user is computed when the dashboard loads, from `urgencyModel` and the deadline, so it rises as a deadline approaches without reclassifying.

### Thresholds

| Signal | Rule | Why |
| --- | --- | --- |
| `securityP` | ≥ 0.3 counts as a security email | Deliberately low: a false alarm only stores a more heavily redacted copy, a miss could expose a secret |
| `needsActionP` | ≥ 0.6 shows the thread under "Needs action" | Balances a short list against missed tasks; tuned on labelled emails |
| `date_kind` | deadline or event with P ≥ 0.5 triggers date extraction | Extraction runs on our server, so extra runs are cheap |
| `categoryP` for promos | ≥ 0.7 counts as "classifier says promo" in the rules above | Avoids capping real emails on a weak guess |

## 6. Failure handling

| Failure | Behaviour |
| --- | --- |
| Malformed or missing answer | Retried once; then treated as unavailable |
| Groq unavailable, rate-limited or slow | Thread marked `pending` and retried later. It is never processed with a less-redacted copy |
| Groq's free daily limit reached during the 30-day backfill | Requests are queued and spread out; the backfill resumes the next day. Users can add their own Groq key |
| Questions or categories change | `questionsVersion` increases and only older results are reclassified |
| A new message arrives while a thread is being classified | The newer message wins: the result records which message it was based on, and a stale result is discarded |

Every failure leads to a safer state, never a looser one.

## 7. Privacy summary

| Data | Where it goes |
| --- | --- |
| Raw email text | Nowhere. In memory on the API server only |
| One-time codes, cards, Aadhaar, PAN, account numbers, link paths | Nowhere. Replaced before anything is sent |
| Dates, times, small counts, the words of the email | gpt-oss-20b on Groq (and Laya or Jev during the evaluation) |
| Full sender address | Nowhere. Only the domain is sent |
| Classification result | MongoDB |

The words of an email still leave the server. Mailmind protects **secrets**, not every private detail; this is stated in the README.

## 8. Evaluation plan

All measured on 100 hand-labelled threads from the author's own inbox:

| Measure | Purpose |
| --- | --- |
| Category accuracy and needs-action precision/recall for **gpt-oss-20b, Laya, Jev (if a key is available) and fine-tuned Laya (stretch)** | Which classifier to trust, and whether a free model is good enough |
| **Calibration of gpt-oss-20b's probabilities** | Whether its stated probabilities mean anything, and where the thresholds should sit |
| Security-email recall | Must be close to 100%; misses are reviewed one by one |
| **Thread context vs latest message only** | Whether `earlier` and `from_me` improve needs-action accuracy |
| **Promo rules on 20 marketing emails written to sound urgent** | None should reach "Needs action" |
| Latency and cost per 1,000 threads | Practical comparison of the models |

The labelled emails must be real and kept separate from any data used for fine-tuning. If another model clearly beats gpt-oss-20b, it replaces it through a new adapter; nothing else in the app changes.

## 9. Trade-offs accepted

- **Some meaning is still hidden:** a number near a code word, such as a room number after "sign in", becomes `[OTP]`, and every code-shaped number in an OTP email is hidden. Over-redaction is preferred to a leak.
- **The probabilities are not calibrated.** gpt-oss-20b states its own confidence; a decision model would be more reliable here. Thresholds are tuned on real labelled emails, and the security threshold stays low so mistakes lead to stricter storage.
- **No live fallback classifier.** If Groq is down, threads wait as `pending` instead of being classified by a weaker model.
- **Reclassifying on every new message** costs one call per message rather than per thread, which uses up Groq's free limits faster. Only the latest message plus two short earlier ones are sent.
- **The promo cap could hide a genuine urgent notice** that arrives through a bulk-mail tool and also reads like marketing. Both signals must agree before the cap applies.

## 10. Open items

1. Build the classifier adapter for gpt-oss-20b (structured output in the shape above), and check Groq's current free limits for the backfill.
2. Add a card to the Vercel account (required for embeddings and for Laya in the evaluation).
3. Compute the server-side facts (`deadline_in_days`, `gmail_category`, `bulk_sender`). Redaction is done: 124 tests pass, including 33 adversarial cases and the coupon rule.
4. Read thread history, `from_me`, Gmail category labels and bulk-mail headers during sync.
5. Label 100 real threads (starting now, a few each day) and run the evaluation in section 8.
6. Stretch: fine-tune Laya on Kaggle and host it on a Hugging Face Space.
