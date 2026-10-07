import { buildToday } from "../utils/todayView.js";

export const getToday = async (req, res) => {
  return res.status(200).json(await buildToday(req.user));
};
