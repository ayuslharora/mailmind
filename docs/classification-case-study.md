# Case study: classifying private email without exposing secrets

**Project:** Mailmind · **Author:** Ayush · **October 2026**

## 1. The problem

Mailmind sorts a Gmail inbox so the user sees what matters first. Each **conversation** is classified, and classified again whenever a new message arrives in it. Each classification needs five answers:

| Question | Answer type | Used for |
| --- | --- | --- |
| Is this a login, password or security email? | Yes/no probability | Deciding how carefully to store it |
| Which category? (Academic, Jobs, Finance, Personal, Notifications, Promos) | One choice | Labels on the Today view |
| Does it need action? | Yes/no probability | The "Needs action" list |
| How urgent does it sound? | Score, 0–4 | Ranking |
| Does it mention a date? (deadline / event / none) | One choice | "Due Fri" or "Event Fri" |

Answering these well needs an AI model. But inboxes are full of OTPs, card numbers, Aadhaar/PAN and password-reset links, and **none of that may reach a third-party AI provider.**

## 2. Constraints

1. **Privacy:** no secret may leave our server. Raw email text is only held in memory on the API server.
2. **Cost:** the project must run for free or close to it.
3. **Output shape:** answers must be typed values with probabilities, so code can apply thresholds, and so one model can replace another without changing the rest of the app.
4. **Hosting:** the API runs on Render's free tier (512 MB RAM), which cannot hold local models.

## 3. The key idea: classify the redacted copy, never the raw email

Instead of trusting a model to protect secrets, the model is never given any. Every email is redacted on the server first, and that **one redacted copy** is classified, stored and later used by Ask your inbox.

| Content | In the redacted copy |
| --- | --- |
| One-time codes | `[OTP]` |
| Card numbers (Luhn check), Aadhaar (Verhoeff check), PAN, account numbers | `[CARD]`, `[AADHAAR]`, `[PAN]`, `[ACCOUNT]` |
| PINs, CVVs, passwords | `[PIN]`, `[PASSWORD]` |
| Risky links (reset, login, tokens, shorteners) | `[LINK:domain]` |
| Safe content links (blogs, newsletters) | Kept, query string removed |
| Amounts, dates, times, order numbers, coupon codes | Kept |

Only the sender's **domain** is sent to the classifier, never the full address.

Some facts are worked out on the server and passed to the model as separate fields: days until a deadline found in the text (`deadline_in_days`), Gmail's own tab (`gmail_category`), and whether the email came from a mailing tool (`bulk_sender`).

## 4. Choosing the model

| Option | Finding | Outcome |
| --- | --- | --- |
| **Jev** (TypeSafe AI) via OpenRouter | A decision model built for exactly these question types, returning a real probability for every answer. Paid, but a full classification costs a tiny fraction of a cent | **Main classifier** |
| **gpt-oss-20b** on Groq | Free, fast, and can answer in the same shape through structured output. But its probabilities were not useful: it answered exactly 0 or 1 for most yes/no questions, so thresholds meant nothing | **Fallback** when Jev is unavailable |
| **Laya** (open decision model) | Same question types as Jev and free, but its published accuracy is barely above random guessing | Rejected |
| **Local zero-shot model** | Free and private, but needs more memory than Render's free tier and runs once per label | Rejected |

gpt-oss-20b was the classifier at first, chosen because it was free. Measuring it on a real inbox (section 8) showed its probabilities were unusable, and Jev replaced it.

## 5. Flow

```
Gmail API → clean thread → redacted copy (+ server-computed facts)
          → rules (OTP emails need no AI) → Jev, or gpt-oss-20b if Jev fails
          → promotion rules → classification stored on the conversation
```

1. **Fetch:** read-only Gmail access, last 30 days, then incremental sync. A new message reclassifies its conversation.
2. **Clean:** HTML converted to text, quoted replies removed.
3. **Build the context:**
   - **Latest message:** its first ~1,200 and last ~300 characters, so a closing "P.S. please reply by Friday" is not cut off.
   - **The two previous messages:** about 300 characters each.
   - **`from_me` on every message:** if the latest message is the user's own, nothing is waiting on them.
4. **Redact** and compute the server-side facts.
5. **Rules first:** an email that says it contains a one-time code is a security notice and needs no AI call.
6. **One model call** with all five questions, then the promotion rules below.

### Request

The request uses Jev's `state` and `questions` format. The same request goes to gpt-oss-20b when it is the fallback.

```json
{
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
    "security": { "type": "boolean", "instructions": "Is this a login code, password, security alert or account-access email?" },
    "category": { "type": "choice", "instructions": "Which category best fits this email thread?", "criteria": { "academic": "…", "jobs": "…", "finance": "…", "personal": "…", "notifications": "…", "promos": "…" } },
    "needs_action": { "type": "boolean", "instructions": "Does the recipient need to reply, submit, pay or act? If the latest message is from the recipient, nothing is needed from them." },
    "urgency": { "type": "score", "instructions": "How urgent is this thread for the recipient?", "criteria": ["Can be ignored", "Read sometime", "Handle this week", "Handle today", "Handle immediately"] },
    "date_kind": { "type": "choice", "instructions": "Does the thread mention a date the recipient must act by or attend?", "criteria": { "deadline": "…", "event": "…", "none": "…" } }
  }
}
```

### One answer shape for every model

| Question type | Answer |
| --- | --- |
| `boolean` | `{ "p": 0.97 }`, the probability of "yes" |
| `choice` | `{ "probs": { "academic": 0.9, "jobs": 0.05, … } }`, one probability per option; the answer is the highest |
| `score` | `{ "probs": [0.0, 0.05, 0.65, 0.25, 0.05] }`, one probability per level; the score is the expected value (here 2.25) |

Each model has an adapter that checks the reply (every option present, probabilities between 0 and 1) and normalises it. The rest of the app only sees this shape, so switching models means changing one adapter. The stored result also records which model produced it.

### Promotion rules

Email text is untrusted: a promotion can claim "URGENT: action required today". Signals the sender cannot fake decide the final answer:

| Model says promo (P ≥ 0.7) | Headers say promo (Gmail's Promotions tab or a mailing tool) | Result |
| --- | --- | --- |
| Yes | Yes | Urgency capped at 1; never shown under "Needs action" |
| Yes | No | Urgency lowered by 1 |
| No | Yes | Urgency lowered by 1 (protects real notices that colleges send through mailing tools) |
| No | No | No change |

### Thresholds

| Signal | Rule | Why |
| --- | --- | --- |
| Security | ≥ 0.3 counts as a security email | Deliberately low: a false alarm only stores a more heavily redacted copy, a miss could expose a secret |
| Needs action | ≥ 0.6 shows it under "Needs action" | Keeps the list short without missing real tasks |
| Date kind | deadline or event with P ≥ 0.5 uses the date found | Avoids showing a "Due" date on a weak guess |
| Promo | ≥ 0.7 counts as "model says promo" | Avoids capping real emails on a weak guess |

## 6. Failure handling

| Failure | Behaviour |
| --- | --- |
| Jev fails, is out of credit, or has no key | gpt-oss-20b answers instead |
| Malformed answer | Retried; then treated as unavailable |
| Both models unavailable or rate-limited | The conversation stays "sorting…" and is retried later. It is never processed with a less-redacted copy |
| Questions or categories change | A version number increases and only older results are reclassified |
| A new message arrives while a conversation is being classified | The older result is discarded |

**Classified after storing, not before.** The free AI tiers are rate-limited, so classification cannot keep up with a 30-day backfill. Messages are redacted and stored first, then classified, newest first. If the model then says a conversation is a security email, its messages are read again from Gmail and stored strictly, because the original text is not kept.

Every failure leads to a safer state, never a looser one.

## 7. What reaches the AI

| Data | Where it goes |
| --- | --- |
| Raw email text | Nowhere. In memory on the API server only |
| One-time codes, cards, Aadhaar, PAN, account numbers, risky links | Nowhere. Replaced before anything is sent |
| Dates, amounts, the words of the email | The classifier (Jev, or gpt-oss-20b as fallback) |
| Full sender address | Nowhere. Only the domain is sent |

The words of an email still leave the server. Mailmind protects **secrets**, not every private detail.

## 8. Results on a real inbox

**First run with gpt-oss-20b** (the author's inbox, last 30 days): 85 conversations, all classified, 7 of them by the OTP rule with no AI call. 11 were flagged as security emails and re-stored strictly, and 33 promotions were capped by the header rule. But **153 of 170 yes/no answers were exactly 0 or 1**, so the thresholds barely mattered and could not be tuned.

**Jev against gpt-oss-20b** (same inbox, same redacted text, 76 conversations):

| | gpt-oss-20b | Jev |
| --- | --- | --- |
| Yes/no answers exactly 0 or 1 | 83% | 0% |
| Conversations marked "needs action" | 19 | 8 |
| Right where the two disagreed (17 conversations, judged by the author) | 1 | 16 |

gpt-oss-20b's typical mistake was full certainty ("needs action: 1") on promotions, product launches and confirmations. Jev's only miss was the category of a declined-payment email. Jev became the main classifier, with gpt-oss-20b as the automatic fallback.

## 9. Trade-offs accepted

- **Some meaning is hidden:** a number near a code word, such as a room number after "sign in", becomes `[OTP]`. Over-redaction is preferred to a leak, and the original is one click away in Gmail.
- **Jev is paid.** It costs very little per conversation, and the app falls back to the free gpt-oss-20b if the credit runs out.
- **Reclassifying on every new message** costs one call per message rather than per conversation. Only the latest message plus two short earlier ones are sent, to keep it small.
- **The promotion cap could hide a genuine urgent notice** that arrives through a mailing tool and also reads like marketing. Both signals must agree before the cap applies.
