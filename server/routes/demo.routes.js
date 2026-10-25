import express from "express";
import { askInbox } from "../controllers/ask.controllers.js";
import { getDemoToday } from "../controllers/demo.controllers.js";
import { getDigest } from "../controllers/digest.controllers.js";
import { getThread } from "../controllers/thread.controllers.js";
import { redactTyped, reportMiss } from "../controllers/typedEmail.controllers.js";
import asDemoUser from "../middlewares/demo.middleware.js";
import { demoAiLimiter, typedEmailLimiter } from "../middlewares/rateLimit.middleware.js";

// The demo inbox, without a login. Read-only: a visitor's changes stay in
// their browser and are sent with the Today request.
const demoRoutes = express.Router();

demoRoutes.post("/today", asDemoUser, getDemoToday);
demoRoutes.get("/threads/:threadId", asDemoUser, getThread);
demoRoutes.post("/ask", asDemoUser, demoAiLimiter, askInbox);
demoRoutes.get("/digest", asDemoUser, demoAiLimiter, getDigest);

// "Try the redaction": an email the visitor types, redacted, no AI.
demoRoutes.post("/redact", typedEmailLimiter, redactTyped);
demoRoutes.post("/redact/:id/miss", typedEmailLimiter, reportMiss);

export default demoRoutes;
