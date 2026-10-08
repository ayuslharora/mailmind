import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { isAllowed } from "../utils/allowList.js";

const isAuthenticated = async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: "Login required" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    // Only a problem with the token itself is a login problem.
    const expired = err instanceof jwt.TokenExpiredError;
    return res.status(401).json({ message: expired ? "Your login has expired. Please sign in again." : "Please sign in again." });
  }

  try {
    const user = await User.findById(decoded.userId).select("-encryptedRefreshToken");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    if (!isAllowed(user.email)) {
      return res.status(403).json({ message: "This account no longer has access to Mailmind." });
    }

    req.user = user;
    next();
  } catch (err) {
    // A database problem is not a bad login: the error middleware reports it.
    next(err);
  }
};

export default isAuthenticated;
