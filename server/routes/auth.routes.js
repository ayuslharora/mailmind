import express from "express";
import { deleteMe, finishGoogleSignIn, getMe, logoutUser, startGoogleSignIn } from "../controllers/auth.controllers.js";
import { signInLimiter } from "../middlewares/rateLimit.middleware.js";
import isAuthenticated from "../middlewares/auth.middleware.js";

const authRoutes = express.Router();

authRoutes.get("/google", signInLimiter, startGoogleSignIn);
authRoutes.get("/google/callback", signInLimiter, finishGoogleSignIn);
authRoutes.get("/me", isAuthenticated, getMe);
authRoutes.post("/logout", logoutUser);
authRoutes.delete("/me", isAuthenticated, deleteMe);

export default authRoutes;
