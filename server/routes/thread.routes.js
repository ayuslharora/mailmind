import express from "express";
import { updateThread } from "../controllers/thread.controllers.js";
import isAuthenticated from "../middlewares/auth.middleware.js";

const threadRoutes = express.Router();

threadRoutes.patch("/:threadId", isAuthenticated, updateThread);

export default threadRoutes;
