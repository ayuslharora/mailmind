# mailmind-pinger

A Cloudflare Worker that calls the API's `/health` endpoint every 10 minutes so the Render free-tier service never spins down.

## Why a separate service

- Render puts a free web service to sleep after 15 minutes without inbound traffic. The next request then waits ~50 seconds for a cold start.
- A pinger hosted on Render would sleep too, and would use up the same 750 free instance hours, so it runs on Cloudflare's free tier instead.

## Setup

```bash
cd pinger
npx wrangler login
# set TARGET_URL in wrangler.toml to the deployed API, e.g. https://mailmind-api.onrender.com/health
npx wrangler deploy
```

## Test locally

```bash
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*/10+*+*+*+*"
```

## Logs

```bash
npx wrangler tail
```

Each run logs `{ ok, status, ms }`. A large `ms` means the API was asleep when it was pinged.

## API side

The Express API must expose a cheap endpoint that does not touch the database or any model:

```js
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));
```
