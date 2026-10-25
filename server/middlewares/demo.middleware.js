import { loadDemoUser } from "../utils/demo.js";

// The demo routes need no login: every visitor gets the same demo inbox.
const asDemoUser = async (req, res, next) => {
  try {
    const user = await loadDemoUser();

    if (!user) {
      return res.status(503).json({ message: "The demo inbox is not set up yet." });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

export default asDemoUser;
