// Keeps Thread documents up to date and classifies the pending ones, newest
// first, so today's mail is sorted before last month's.
import Message from "../models/message.model.js";
import Thread from "../models/thread.model.js";
import User from "../models/user.model.js";
import {
  applyPromoRules,
  buildState,
  pickDueAt,
  QUESTIONS_VERSION,
  rulesClassification,
  SECURITY_P,
} from "./classify.js";
import * as gptOss from "./classifier.js";
import * as jev from "./classifierJev.js";

const { DailyLimitError } = gptOss;
import { getMessage } from "./gmail.js";
import { gmailAuthFor, toStoredMessage } from "./sync.js";

// The latest message and the two before it are what the classifier sees.
const CONTEXT_MESSAGES = 3;

// Marks threads with a new latest message as pending, and removes threads
// whose messages were all deleted in Gmail.
export async function updateThreads(userId, threadIds) {
  for (const threadId of new Set(threadIds)) {
    const latest = await Message.findOne({ userId, threadId }).sort({ date: -1 });
    if (!latest) {
      await Thread.deleteOne({ userId, threadId });
      continue;
    }
    const thread = await Thread.findOne({ userId, threadId });
    if (thread?.latestMessageId === latest.gmailId) continue;
    await Thread.updateOne(
      { userId, threadId },
      {
        $set: { latestMessageId: latest.gmailId, lastMessageAt: latest.date, status: "pending", state: "open" },
        // A new message opens a done or snoozed thread again, and the user's
        // old "needs action" answer was about the previous message.
        $unset: { snoozeUntil: "", "userLabel.needsAction": "" },
      },
      { upsert: true },
    );
  }
}

// Jev is the main classifier: on the author's inbox it agreed with the
// author's judgement on 16 of the 17 threads where the two models differed,
// and gave real probabilities (gpt-oss-20b answered exactly 0 or 1 for 83%
// of yes/no questions). gpt-oss-20b on Groq is the free fallback when there
// is no OpenRouter key or Jev fails.
export async function classifyWithBestModel(state) {
  if (process.env.OPENROUTER_API_KEY) {
    try {
      return { answers: await jev.classifyState(state), source: jev.SOURCE };
    } catch (err) {
      console.error(`Jev failed, falling back to ${gptOss.SOURCE}: ${err.message}`);
    }
  }
  return { answers: await gptOss.classifyState(state), source: gptOss.SOURCE };
}

// The classifier thinks it is a security email but the rules did not catch a
// secret, so the stored copy is light. The raw text is not kept, so the
// messages are read from Gmail again and redacted strictly.
async function storeStrictly(userId, threadId) {
  const light = await Message.find({ userId, threadId, strict: false });
  if (light.length === 0) return;
  const auth = gmailAuthFor(await User.findById(userId));
  for (const message of light) {
    const email = await getMessage(auth, message.gmailId);
    await Message.updateOne({ _id: message._id }, { $set: toStoredMessage(userId, email, { strict: true }) });
  }
}

async function classifyThread(thread) {
  const messages = await Message.find({ userId: thread.userId, threadId: thread.threadId })
    .sort({ date: -1 })
    .limit(CONTEXT_MESSAGES);
  const latest = messages[0];

  let answers = rulesClassification(latest);
  let source = "rules";
  if (!answers) {
    const state = buildState(messages);
    const result = await classifyWithBestModel(state);
    answers = applyPromoRules(result.answers, state);
    source = result.source;
  }

  // Only saved if no newer message arrived while the model was answering.
  await Thread.updateOne(
    { _id: thread._id, latestMessageId: latest.gmailId },
    {
      $set: {
        status: "classified",
        classification: {
          ...answers,
          source,
          questionsVersion: QUESTIONS_VERSION,
          classifiedFromMessageId: latest.gmailId,
          classifiedAt: new Date(),
        },
        ...pickDueAt(messages, answers),
      },
    },
  );

  if (answers.securityP >= SECURITY_P) await storeStrictly(thread.userId, thread.threadId);
}

const running = new Set();

export const isClassifying = (userId) => running.has(String(userId));

export async function classifyPending(userId) {
  const key = String(userId);
  if (running.has(key)) return;
  running.add(key);

  try {
    // Threads that failed last time get one more try per run, and results
    // from older questions are redone.
    await Thread.updateMany({ userId, status: "failed" }, { $set: { status: "pending" } });
    await Thread.updateMany(
      { userId, status: "classified", "classification.questionsVersion": { $lt: QUESTIONS_VERSION } },
      { $set: { status: "pending" } },
    );
    const failedThisRun = new Set();

    for (;;) {
      const thread = await Thread.findOne({ userId, status: "pending", _id: { $nin: [...failedThisRun] } }).sort({
        lastMessageAt: -1,
      });
      if (!thread) break;
      try {
        await classifyThread(thread);
      } catch (err) {
        if (err instanceof DailyLimitError) throw err;
        console.error(`Classification failed for a thread of user ${key}: ${err.message}`);
        failedThisRun.add(thread._id);
        await Thread.updateOne({ _id: thread._id, status: "pending" }, { $set: { status: "failed" } });
      }
    }
  } catch (err) {
    // The daily limit: the rest stay pending until the next sync.
    console.error(`Classification stopped for user ${key}: ${err.message}`);
  } finally {
    running.delete(key);
  }
}
