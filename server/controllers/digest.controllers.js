import { digestFor } from "../utils/digest.js";
import { DailyLimitError } from "../utils/groqLimiter.js";

export const getDigest = async (req, res) => {
  try {
    return res.status(200).json(await digestFor(req.user));
  } catch (err) {
    if (err instanceof DailyLimitError) {
      return res.status(503).json({ message: "Today's free AI limit is used up. The Today tab still works." });
    }
    throw err;
  }
};
