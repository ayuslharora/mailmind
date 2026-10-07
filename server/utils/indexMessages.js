// Turns stored (redacted) messages into searchable chunks for "Ask your inbox".
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import Chunk from "../models/chunk.model.js";
import Message from "../models/message.model.js";
import { EMBEDDING_MODEL, getEmbeddings } from "./embeddings.js";

const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 100 });

const senderName = (from = "") => from.replace(/<[^>]*>/, "").replace(/"/g, "").trim() || from;

// The header goes on every chunk, so a chunk found on its own still says who
// sent it, about what, and when.
export function headerOf(message) {
  // The day in India, not UTC: an email at 11 pm is still that day.
  const date = message.date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return `From: ${message.fromMe ? "me" : senderName(message.from)} | Subject: ${message.subject} | Date: ${date}`;
}

export async function chunksOf(message) {
  const header = headerOf(message);
  const parts = message.body.trim() ? await splitter.splitText(message.body) : [""];
  return parts.map((part) => `${header}\n${part}`.trim());
}

// Indexes the given messages, replacing any chunks they already have (used
// again when a message is re-stored strictly).
export async function indexMessages(userId, gmailIds) {
  if (gmailIds.length === 0) return 0;
  const messages = await Message.find({ userId, gmailId: { $in: gmailIds } });

  const rows = [];
  for (const message of messages) {
    for (const text of await chunksOf(message)) {
      rows.push({ userId, gmailId: message.gmailId, threadId: message.threadId, date: message.date, text });
    }
  }
  if (rows.length === 0) return 0;

  const vectors = await getEmbeddings().embedDocuments(rows.map((row) => row.text));
  await Chunk.deleteMany({ userId, gmailId: { $in: gmailIds } });
  await Chunk.insertMany(rows.map((row, i) => ({ ...row, embedding: vectors[i], embeddingModel: EMBEDDING_MODEL })));
  return rows.length;
}

// Messages that have no chunks yet: the first run after RAG was added, or
// after a failed embedding call.
export async function indexMissing(userId) {
  const indexed = new Set(await Chunk.distinct("gmailId", { userId }));
  const all = await Message.distinct("gmailId", { userId });
  return indexMessages(
    userId,
    all.filter((id) => !indexed.has(id)),
  );
}
