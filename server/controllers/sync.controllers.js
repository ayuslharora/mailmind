import Message from "../models/message.model.js";
import { backfill, isSyncing } from "../utils/sync.js";

export const startSync = (req, res) => {
  // Not awaited: the backfill runs in the background and the page polls
  // the status route.
  if (!isSyncing(req.user._id)) backfill(req.user._id);
  return res.status(202).json({ message: "Sync started" });
};

export const getSyncStatus = async (req, res) => {
  const messages = await Message.countDocuments({ userId: req.user._id });
  const { backfillDone = false, lastSyncedAt = null, lastError = null } = req.user.sync ?? {};
  return res.status(200).json({ running: isSyncing(req.user._id), messages, backfillDone, lastSyncedAt, lastError });
};
