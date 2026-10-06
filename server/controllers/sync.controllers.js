import Message from "../models/message.model.js";
import Thread from "../models/thread.model.js";
import { isClassifying } from "../utils/classifyThreads.js";
import { backfill, isSyncing } from "../utils/sync.js";

export const startSync = (req, res) => {
  // Not awaited: the backfill runs in the background and the page polls
  // the status route.
  if (!isSyncing(req.user._id)) backfill(req.user._id);
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
