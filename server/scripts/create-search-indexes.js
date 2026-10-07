// Creates the two Atlas Search indexes "Ask your inbox" needs, or updates
// their definitions if they already exist. Safe to run again.
//
//   npm run create-search-indexes --workspace server

import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import { EMBEDDING_DIMENSIONS } from "../utils/embeddings.js";
import { TEXT_INDEX, VECTOR_INDEX } from "../utils/retrieve.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, "../.env"),
  quiet: true,
});

const indexes = [
  {
    name: VECTOR_INDEX,
    type: "vectorSearch",
    definition: {
      fields: [
        { type: "vector", path: "embedding", numDimensions: EMBEDDING_DIMENSIONS, similarity: "cosine" },
        // Every search is filtered to the logged-in user inside the index.
        { type: "filter", path: "userId" },
        { type: "filter", path: "date" },
        { type: "filter", path: "sender" },
      ],
    },
  },
  {
    name: TEXT_INDEX,
    type: "search",
    definition: {
      mappings: {
        dynamic: false,
        fields: {
          text: { type: "string" },
          userId: { type: "objectId" },
          date: { type: "date" },
          sender: { type: "token" },
        },
      },
    },
  },
];

await mongoose.connect(process.env.MONGODB_URI, { dbName: "mailmind" });
const db = mongoose.connection.db;

if (!(await db.listCollections({ name: "chunks" }).toArray()).length) {
  await db.createCollection("chunks");
}
const chunks = db.collection("chunks");
const existing = new Set((await chunks.listSearchIndexes().toArray()).map((index) => index.name));

for (const index of indexes) {
  if (existing.has(index.name)) {
    await chunks.updateSearchIndex(index.name, index.definition);
    console.log(`${index.name}: definition updated (Atlas rebuilds it in a minute)`);
  } else {
    await chunks.createSearchIndex(index);
    console.log(`${index.name}: created (Atlas takes a minute to build it)`);
  }
}

await mongoose.disconnect();
