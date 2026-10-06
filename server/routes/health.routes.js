import express from "express";
import { getHealth } from "../controllers/health.controllers.js";

const healthRoutes = express.Router();

healthRoutes.get("/", getHealth);

export default healthRoutes;
