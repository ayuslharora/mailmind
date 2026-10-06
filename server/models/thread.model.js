import mongoose from "mongoose";

// One Gmail conversation. Classified as a whole, again whenever a new
// message arrives in it.
const threadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    threadId: {
      type: String,
      required: true,
    },

    latestMessageId: {
      type: String,
      required: true,
    },

    lastMessageAt: {
      type: Date,
      required: true,
    },

    // pending: waiting for the classifier (shown as "sorting…"). failed: the
    // classifier could not answer; retried on the next run.
    status: {
      type: String,
      enum: ["pending", "classified", "failed"],
      default: "pending",
    },

    // In the shape a decision model such as Jev returns, whichever model
    // produced it (see docs/classification-case-study.md).
    classification: {
      category: String,
      categoryProbs: { type: Map, of: Number },
      securityP: Number,
      needsActionP: Number,
      // Expected value of the 0–4 urgency score, after the promotion rules.
      urgency: Number,
      dateKind: { type: String, enum: ["deadline", "event", "none"] },
      dateKindP: Number,
      promoCap: Boolean,
      source: String,
      questionsVersion: Number,
      // The message the result is based on: a result for an older message is
      // thrown away if a newer one has arrived meanwhile.
      classifiedFromMessageId: String,
      classifiedAt: Date,
    },

    // The deadline or event date, if the classifier says there is one.
    dueAt: Date,
    dueHasTime: Boolean,
  },
  { timestamps: true },
);

threadSchema.index({ userId: 1, threadId: 1 }, { unique: true });
threadSchema.index({ status: 1, lastMessageAt: -1 });

const Thread = mongoose.model("Thread", threadSchema);

export default Thread;
