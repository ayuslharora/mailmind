import express from "express";
import { getDigest } from "../controllers/digest.controllers.js";
import isAuthenticated from "../middlewares/auth.middleware.js";

const digestRoutes = express.Router();

digestRoutes.get("/", isAuthenticated, getDigest);

export default digestRoutes;
