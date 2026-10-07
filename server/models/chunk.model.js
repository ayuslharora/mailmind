import mongoose from "mongoose";

// A searchable piece of one stored (redacted) message, with its embedding.
// Lives next to the messages so a single query can filter by user, and
// deleting a message deletes its chunks in the same database.
const chunkSchema = new mongoose.Schema(
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

    date: {
      type: Date,
      required: true,
    },

    // "From: … | Subject: … | Date: …" followed by part of the body.
    text: {
      type: String,
      required: true,
    },

    embedding: {
      type: [Number],
      required: true,
    },

    // Stored with every vector: vectors from different models cannot be
    // compared, so a model change means re-embedding.
    embeddingModel: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

chunkSchema.index({ userId: 1, gmailId: 1 });

const Chunk = mongoose.model("Chunk", chunkSchema);

export default Chunk;
