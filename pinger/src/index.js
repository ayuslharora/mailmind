// Keeps the Render free-tier API awake. Render spins a free service down after
// 15 minutes without inbound traffic, so this pings /health every 10 minutes.

const TIMEOUT_MS = 60_000; // a cold start on Render can take ~50s

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ping(env.TARGET_URL));
  },
};

async function ping(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "mailmind-pinger" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    console.log(JSON.stringify({ ok: res.ok, status: res.status, ms: Date.now() - started }));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err.message, ms: Date.now() - started }));
  }
}
