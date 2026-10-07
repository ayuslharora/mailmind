import express from "express";
import { askInbox } from "../controllers/ask.controllers.js";
import isAuthenticated from "../middlewares/auth.middleware.js";

const askRoutes = express.Router();

askRoutes.post("/", isAuthenticated, askInbox);

export default askRoutes;
