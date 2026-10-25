import { z } from "zod";
import { CATEGORIES } from "../utils/classify.js";
import { buildToday } from "../utils/todayView.js";

const MAX_CHANGES = 500;

// A visitor's own changes to the demo inbox, kept in their browser
// (client/src/utils/demo.js) and sent with each request. Never saved:
// every visitor sees the same inbox.
const changesSchema = z
  .object({
    threads: z
      .record(
        z.string().max(64),
        z
          .object({
            state: z.enum(["open", "done", "snoozed"]).optional(),
            snoozeUntil: z.coerce.date().optional(),
            category: z.enum(CATEGORIES).optional(),
            needsAction: z.boolean().optional(),
          })
          .strict(),
      )
      .default({}),
    senders: z.record(z.string().max(320), z.enum(CATEGORIES)).default({}),
  })
  .strict()
  .refine((changes) => Object.keys(changes.threads).length + Object.keys(changes.senders).length <= MAX_CHANGES, "Too many changes");

export const getDemoToday = async (req, res) => {
  const parsed = changesSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }
  return res.status(200).json(await buildToday(req.user, new Date(), parsed.data));
};
