import express from "express";
import { getToday } from "../controllers/today.controllers.js";
import isAuthenticated from "../middlewares/auth.middleware.js";

const todayRoutes = express.Router();

todayRoutes.get("/", isAuthenticated, getToday);

export default todayRoutes;
