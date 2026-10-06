// Pinged every 10 minutes by the Cloudflare Worker to keep Render awake.
// Does no database work, so a ping never fails because of a slow query.
export const getHealth = (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) });
};
