# mailmind-pinger

A Cloudflare Worker with two schedules:

- every 10 minutes it calls the API's `/health` endpoint, so the Render free-tier service never spins down;
- every 15 minutes it calls `POST /api/sync/scheduled`, which syncs Gmail for every user.

## Why a separate service

- Render puts a free web service to sleep after 15 minutes without inbound traffic. The next request then waits ~50 seconds for a cold start.
- A pinger hosted on Render would sleep too, and would use up the same 750 free instance hours, so it runs on Cloudflare's free tier instead.

## Setup

```bash
cd pinger
npx wrangler login
# set TARGET_URL and SYNC_URL in wrangler.toml to the deployed API
# use the same value as CRON_SECRET in the API's environment:
npx wrangler secret put CRON_SECRET
npx wrangler deploy
```

## Test locally

```bash
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*/10+*+*+*+*"   # ping
curl "http://localhost:8787/__scheduled?cron=*/15+*+*+*+*"   # sync
```

## Logs

```bash
npx wrangler tail
```

Each run logs `{ name, ok, status, ms }`. A large `ms` means the API was asleep when it was pinged.

## API side

The Express API must expose a cheap endpoint that does not touch the database or any model:

```js
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));
```
