import mongoose from "mongoose";

// One Gmail message, stored redacted. The original text is never stored:
// opening an email fetches it live from Gmail.
const messageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    gmailId: {
      type: String,
      required: true,
    },

    threadId: {
      type: String,
      required: true,
    },

    from: {
      type: String,
    },

    // Sent by the user (Gmail's SENT label): nothing is waiting on them.
    fromMe: {
      type: Boolean,
      default: false,
    },

    date: {
      type: Date,
      required: true,
    },

    // Redacted subject and body.
    subject: {
      type: String,
      default: "",
    },

    body: {
      type: String,
      default: "",
    },

    // Strict: every code-shaped number and link was hidden.
    strict: {
      type: Boolean,
      default: false,
    },

    // How many of each kind of thing were hidden, e.g. { OTP: 1, LINK: 3 }.
    hidden: {
      type: Map,
      of: Number,
      default: {},
    },

    labelIds: [String],

    // List-Unsubscribe or Precedence: bulk header: sent by a mailing tool.
    bulkSender: {
      type: Boolean,
      default: false,
    },

    // Both readings are found while the raw text is in memory, because it is
    // not kept. The classifier later says which one applies.
    deadlineAt: Date,
    deadlineHasTime: Boolean,
    eventAt: Date,
    eventHasTime: Boolean,
  },
  { timestamps: true },
);

messageSchema.index({ userId: 1, gmailId: 1 }, { unique: true });
messageSchema.index({ userId: 1, threadId: 1, date: -1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;
