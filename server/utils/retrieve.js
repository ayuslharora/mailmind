// Hybrid search over one user's chunks: by meaning (vector index) and by
// words (text index), merged with Reciprocal Rank Fusion. Both searches are
// filtered to the user inside Atlas, so another user's mail is never a
// candidate.
import Chunk from "../models/chunk.model.js";
import Thread from "../models/thread.model.js";
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

const LIST_LIMIT = 15;

// filters: { senders: [addresses], after: Date, before: Date }, all optional.
function vectorFilter(userId, { senders, after, before } = {}) {
  const filter = { userId };
  if (senders) filter.sender = { $in: senders };
  if (after || before) filter.date = { ...(after && { $gte: after }), ...(before && { $lte: before }) };
  return filter;
}

function textFilter(userId, { senders, after, before } = {}) {
  const filter = [{ equals: { path: "userId", value: userId } }];
  if (senders) filter.push({ in: { path: "sender", value: senders } });
  if (after || before) filter.push({ range: { path: "date", ...(after && { gte: after }), ...(before && { lte: before }) } });
  return filter;
}

// "Summarize all emails from X": every matching email rather than the most
// similar chunks. One chunk per email (its start), newest first.
export function listMatching(userId, filters, limit = LIST_LIMIT) {
  return Chunk.find({ ...vectorFilter(userId, filters), part: 0 }, { embedding: 0 })
    .sort({ date: -1 })
    .limit(limit)
    .lean();
}

// "What's due" with no dates given: the next two weeks. Up to 25 emails,
// each cut to its start, so the whole list fits in one small prompt.
const DUE_DAYS = 14;
const DUE_LIMIT = 25;
const DUE_CHARS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

// The date as the Today view read it: "Due: Tue, 27 Oct, 5:00 pm".
export function dueLine({ dueAt, dueHasTime, dateKind }) {
  const when = dueAt.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(dueHasTime && { hour: "numeric", minute: "2-digit" }),
  });
  return `${dateKind === "event" ? "Event" : "Due"}: ${when}`;
}

// "What's due this week": every email with a deadline or event in the range,
// soonest first, from the dates the Today view uses. Not a similarity
// search: a list question has no single best match, so the six nearest
// chunks would miss most of the list. One chunk per email (its start), with
// its date on the first line. Threads marked done are left out, and so are
// promotions: "sale ends tonight" is not something due.
export async function listDue(userId, { senders, after, before } = {}, now = new Date(), limit = DUE_LIMIT) {
  const threads = await Thread.find({
    userId,
    status: "classified",
    state: { $ne: "done" },
    "classification.category": { $ne: "promos" },
    "classification.promoCap": { $ne: true },
    dueAt: { $gte: after ?? now, $lte: before ?? new Date(now.getTime() + DUE_DAYS * DAY_MS) },
  })
    .sort({ dueAt: 1 })
    .limit(limit);
  const chunks = await Chunk.find(
    { userId, part: 0, gmailId: { $in: threads.map((t) => t.latestMessageId) }, ...(senders && { sender: { $in: senders } }) },
    { embedding: 0 },
  ).lean();
  const byId = new Map(chunks.map((chunk) => [chunk.gmailId, chunk]));
  return threads
    .filter((thread) => byId.has(thread.latestMessageId))
    .map((thread) => {
      const chunk = byId.get(thread.latestMessageId);
      const date = dueLine({ dueAt: thread.dueAt, dueHasTime: thread.dueHasTime, dateKind: thread.classification?.dateKind });
      return { ...chunk, text: `${date}\n${chunk.text.slice(0, DUE_CHARS)}` };
    });
}

// userId must be an ObjectId: aggregation stages are not cast by Mongoose.
export async function retrieve(userId, question, { top = 6, filters = {} } = {}) {
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
          filter: vectorFilter(userId, filters),
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
            filter: textFilter(userId, filters),
          },
        },
      },
      { $limit: CANDIDATES },
      hide,
    ]),
  ]);

  return fuseRankings([byMeaning, byWords]).slice(0, top);
}
