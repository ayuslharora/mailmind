// Two schedules (see wrangler.toml):
// - every 10 minutes, ping /health: Render spins a free service down after
//   15 minutes without traffic, and the next request then waits ~50s.
// - every 15 minutes, start the Gmail sync for every user.

const TIMEOUT_MS = 60_000; // a cold start on Render can take ~50s
const SYNC_CRON = "*/15 * * * *";

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(event.cron === SYNC_CRON ? startSync(env) : ping(env.TARGET_URL));
  },
};

async function call(name, url, options = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      ...options,
      headers: { "user-agent": "mailmind-pinger", ...options.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    console.log(JSON.stringify({ name, ok: res.ok, status: res.status, ms: Date.now() - started }));
  } catch (err) {
    console.error(JSON.stringify({ name, ok: false, error: err.message, ms: Date.now() - started }));
  }
}

const ping = (url) => call("ping", url);

// The API answers 202 straight away and syncs in the background.
const startSync = (env) => call("sync", env.SYNC_URL, { method: "POST", headers: { "x-cron-secret": env.CRON_SECRET } });
