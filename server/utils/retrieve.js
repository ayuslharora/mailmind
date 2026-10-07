// Hybrid search over one user's chunks: by meaning (vector index) and by
// words (text index), merged with Reciprocal Rank Fusion. Both searches are
// filtered to the user inside Atlas, so another user's mail is never a
// candidate.
import Chunk from "../models/chunk.model.js";
import { getEmbeddings } from "./embeddings.js";

export const VECTOR_INDEX = "chunks_vector";
export const TEXT_INDEX = "chunks_text";

const CANDIDATES = 20;
const VECTOR_POOL = 100;
// The usual RRF constant: it stops the very top ranks dominating.
const RRF_K = 60;

// lists: rankings of chunks (best first). Each chunk scores 1/(k + rank) in
// every list it appears in; a chunk found by both searches rises.
export function fuseRankings(lists, k = RRF_K) {
  const scores = new Map();
  const byId = new Map();
  for (const list of lists) {
    list.forEach((chunk, rank) => {
      const id = String(chunk._id);
      byId.set(id, chunk);
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => byId.get(id));
}

// userId must be an ObjectId: aggregation stages are not cast by Mongoose.
export async function retrieve(userId, question, { top = 6 } = {}) {
  const queryVector = await getEmbeddings().embedQuery(question);
  const hide = { $project: { embedding: 0 } };

  const [byMeaning, byWords] = await Promise.all([
    Chunk.aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX,
          path: "embedding",
          queryVector,
          numCandidates: VECTOR_POOL,
          limit: CANDIDATES,
          filter: { userId },
        },
      },
      hide,
    ]),
    Chunk.aggregate([
      {
        $search: {
          index: TEXT_INDEX,
          compound: {
            must: [{ text: { query: question, path: "text" } }],
            filter: [{ equals: { path: "userId", value: userId } }],
          },
        },
      },
      { $limit: CANDIDATES },
      hide,
    ]),
  ]);

  return fuseRankings([byMeaning, byWords]).slice(0, top);
}
