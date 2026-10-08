import express from "express";
import { getThread, updateThread } from "../controllers/thread.controllers.js";
import isAuthenticated from "../middlewares/auth.middleware.js";

const threadRoutes = express.Router();

threadRoutes.get("/:threadId", isAuthenticated, getThread);
threadRoutes.patch("/:threadId", isAuthenticated, updateThread);

export default threadRoutes;
