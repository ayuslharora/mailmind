import mongoose from "mongoose";

// "Apply to everything from this sender": a category the user chose for one
// email address. Applied when the Today view is built, so it also covers
// mail that arrives later.
const senderRuleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    sender: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

senderRuleSchema.index({ userId: 1, sender: 1 }, { unique: true });

const SenderRule = mongoose.model("SenderRule", senderRuleSchema);

export default SenderRule;
