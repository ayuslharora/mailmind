import Message from "../models/message.model.js";
import Thread from "../models/thread.model.js";
import User from "../models/user.model.js";
import { isAllowed } from "../utils/allowList.js";
import crypto from "crypto";
import { isClassifying } from "../utils/classifyThreads.js";
import { isSyncing, syncUser } from "../utils/sync.js";

export const startSync = (req, res) => {
  // Not awaited: sync runs in the background and the page polls the status
  // route. The first sync fetches 30 days; later ones only what changed.
  if (!isSyncing(req.user._id)) syncUser(req.user._id);
  return res.status(202).json({ message: "Sync started" });
};

export const getSyncStatus = async (req, res) => {
  const userId = req.user._id;
  const messages = await Message.countDocuments({ userId });
  const threads = Object.fromEntries(
    (await Thread.aggregate([{ $match: { userId } }, { $group: { _id: "$status", n: { $sum: 1 } } }])).map((s) => [s._id, s.n]),
  );
  const { backfillDone = false, lastSyncedAt = null, lastError = null } = req.user.sync ?? {};
  return res.status(200).json({
    syncing: isSyncing(userId),
    classifying: isClassifying(userId),
    messages,
    threads,
    backfillDone,
    lastSyncedAt,
    lastError,
  });
};

const sameSecret = (a = "", b = "") =>
  a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Called every 15 minutes by the Cloudflare Worker (pinger/). Syncs every
// user one after another, in the background.
export const syncEveryone = async (req, res) => {
  if (!sameSecret(req.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return res.status(401).json({ message: "Not allowed" });
  }
  const found = await User.find({ encryptedRefreshToken: { $exists: true }, "sync.lastError": { $ne: "reconnect" } }, "_id email");
  // Accounts taken off the allowed list are not synced.
  const users = found.filter((user) => isAllowed(user.email));
  res.status(202).json({ message: "Sync started", users: users.length });
  for (const user of users) await syncUser(user._id);
};
