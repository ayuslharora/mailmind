import { ipKeyGenerator, rateLimit } from "express-rate-limit";

const MINUTE_MS = 60 * 1000;
const tooMany = { message: "Too many requests. Please wait a minute and try again." };

// Ask and Digest each use AI quota shared by every user, so one user cannot
// use it all up. Counted per signed-in user (these routes come after login).
export const aiLimiter = rateLimit({
  windowMs: MINUTE_MS,
  limit: 10,
  keyGenerator: (req) => String(req.user._id),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany,
});

// The same for the demo, where every visitor shares one account: counted per
// IP address instead.
export const demoAiLimiter = rateLimit({
  windowMs: MINUTE_MS,
  limit: 10,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany,
});

// The demo's "Try the redaction" saves what it is sent, so a visitor cannot
// fill the database. Counted per IP address.
export const typedEmailLimiter = rateLimit({
  windowMs: MINUTE_MS,
  limit: 10,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany,
});

// "Sync now": new mail is classified by AI, so a few times a minute is plenty.
export const syncLimiter = rateLimit({
  windowMs: MINUTE_MS,
  limit: 3,
  keyGenerator: (req) => String(req.user._id),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany,
});

// Every API request, counted per IP address. The Today page asks twice every
// 10 seconds while mail is being sorted, far below this.
export const apiLimiter = rateLimit({
  windowMs: MINUTE_MS,
  limit: 120,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany,
});

// Sign-in, counted per IP address.
export const signInLimiter = rateLimit({
  windowMs: MINUTE_MS,
  limit: 20,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany,
});
