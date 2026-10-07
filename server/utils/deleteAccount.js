// "Delete all my data": everything Mailmind stores about a user, and its
// access to their Gmail.
import Chunk from "../models/chunk.model.js";
import Message from "../models/message.model.js";
import SenderRule from "../models/senderRule.model.js";
import Thread from "../models/thread.model.js";
import User from "../models/user.model.js";
import { decrypt } from "./crypto.js";
import { createOAuthClient } from "./gmail.js";

// Tells Google to cancel Mailmind's access, so the stored token is useless
// even if a copy existed somewhere. Already revoked or expired is fine.
async function revokeGoogleAccess(user) {
  if (!user.encryptedRefreshToken) return false;
  try {
    await createOAuthClient().revokeToken(decrypt(user.encryptedRefreshToken));
    return true;
  } catch {
    return false;
  }
}

export async function deleteAccount(userId) {
  const user = await User.findById(userId);
  if (!user) return null;

  const revoked = await revokeGoogleAccess(user);
  const [messages, threads, chunks, senderRules] = await Promise.all([
    Message.deleteMany({ userId }),
    Thread.deleteMany({ userId }),
    Chunk.deleteMany({ userId }),
    SenderRule.deleteMany({ userId }),
  ]);
  await User.deleteOne({ _id: userId });

  return {
    revoked,
    deleted: {
      messages: messages.deletedCount,
      threads: threads.deletedCount,
      chunks: chunks.deletedCount,
      senderRules: senderRules.deletedCount,
    },
  };
}
