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
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);

export default User;
