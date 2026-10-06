import express from "express";
import { getSyncStatus, startSync } from "../controllers/sync.controllers.js";
import isAuthenticated from "../middlewares/auth.middleware.js";

const syncRoutes = express.Router();

syncRoutes.post("/", isAuthenticated, startSync);
syncRoutes.get("/status", isAuthenticated, getSyncStatus);

export default syncRoutes;
