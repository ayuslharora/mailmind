import express from "express";
import { getDigest } from "../controllers/digest.controllers.js";
import isAuthenticated from "../middlewares/auth.middleware.js";
import { aiLimiter } from "../middlewares/rateLimit.middleware.js";

const digestRoutes = express.Router();

digestRoutes.get("/", isAuthenticated, aiLimiter, getDigest);

export default digestRoutes;
