import mongoose from "mongoose";

// An email a demo visitor typed to see the redaction work (/demo/redact),
// not a Gmail email. Unlike Gmail mail, the original is kept, encrypted, so
// the author can study what the rules miss (scripts/export-typed.js). It is
// never sent to an AI service, and is deleted after 90 days.
const DAY_S = 24 * 60 * 60;

const typedEmailSchema = new mongoose.Schema(
  {
    // encrypt(JSON.stringify({ subject, body })), see utils/crypto.js.
    original: {
      type: String,
      required: true,
    },

    // What Mailmind would store for it: the redacted copy.
    subject: {
      type: String,
      default: "",
    },

    body: {
      type: String,
      default: "",
    },

    strict: {
      type: Boolean,
      default: false,
    },

    hidden: {
      type: Map,
      of: Number,
      default: {},
    },

    // The visitor said a secret was left in.
    reportedMiss: {
      type: Boolean,
      default: false,
    },

    // What they said was missed, encrypted: it may repeat the secret.
    note: String,
  },
  { timestamps: true },
);

typedEmailSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * DAY_S });

const TypedEmail = mongoose.model("TypedEmail", typedEmailSchema);

export default TypedEmail;
