import express from "express";
import { getSyncStatus, startSync, syncEveryone } from "../controllers/sync.controllers.js";
import isAuthenticated from "../middlewares/auth.middleware.js";
import { syncLimiter } from "../middlewares/rateLimit.middleware.js";

const syncRoutes = express.Router();

syncRoutes.post("/", isAuthenticated, syncLimiter, startSync);
syncRoutes.get("/status", isAuthenticated, getSyncStatus);
// Protected by a shared secret instead of a login: called by the scheduler.
syncRoutes.post("/scheduled", syncEveryone);

export default syncRoutes;
