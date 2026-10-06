import express from "express";
import { finishGoogleSignIn, getMe, logoutUser, startGoogleSignIn } from "../controllers/auth.controllers.js";
import isAuthenticated from "../middlewares/auth.middleware.js";

const authRoutes = express.Router();

authRoutes.get("/google", startGoogleSignIn);
authRoutes.get("/google/callback", finishGoogleSignIn);
authRoutes.get("/me", isAuthenticated, getMe);
authRoutes.post("/logout", logoutUser);

export default authRoutes;
