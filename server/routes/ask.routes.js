import express from "express";
import { askInbox } from "../controllers/ask.controllers.js";
import isAuthenticated from "../middlewares/auth.middleware.js";
import { aiLimiter } from "../middlewares/rateLimit.middleware.js";

const askRoutes = express.Router();

askRoutes.post("/", isAuthenticated, aiLimiter, askInbox);

export default askRoutes;
