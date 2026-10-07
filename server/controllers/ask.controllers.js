import { z } from "zod";
import { answerQuestion } from "../utils/answer.js";
import { DailyLimitError } from "../utils/groqLimiter.js";

// The page sends the last few turns, so follow-up questions work.
const askSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    history: z
      .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) }))
      .max(12)
      .default([]),
  })
  .strict();

export const askInbox = async (req, res) => {
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }
  try {
    const result = await answerQuestion(req.user, parsed.data.question, parsed.data.history);
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof DailyLimitError) {
      return res.status(503).json({ message: "Today's free AI limit is used up. Ask again tomorrow." });
    }
    throw err;
  }
};
