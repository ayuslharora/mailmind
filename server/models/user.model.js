import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      required: true,
      unique: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    name: {
      type: String,
      trim: true,
    },

    // AES-256-GCM, see utils/crypto.js. Lets the server read Gmail when the
    // user is not on the site (scheduled sync).
    encryptedRefreshToken: {
      type: String,
    },

    // Where Gmail sync has got to. One per user, so it lives on the user.
    sync: {
      backfillPageToken: String,
      backfillDone: { type: Boolean, default: false },
      // Gmail's bookmark for "changes since last time" (incremental sync).
      historyId: String,
      lastSyncedAt: Date,
      lastError: String,
    },

    // Today's briefing, kept so reopening the tab costs no AI call. Made
    // again when the day changes or the items in it change.
    digest: {
      day: String,
      key: String,
      headline: String,
      points: [{ _id: false, threadId: String, text: String }],
      generatedAt: Date,
    },
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);

export default User;
