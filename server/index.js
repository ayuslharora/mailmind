import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";

import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import syncRoutes from "./routes/sync.routes.js";
import todayRoutes from "./routes/today.routes.js";
import threadRoutes from "./routes/thread.routes.js";
import askRoutes from "./routes/ask.routes.js";
import digestRoutes from "./routes/digest.routes.js";
import errorMiddleware from "./middlewares/error.middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, ".env"),
  quiet: true,
});

const requiredEnvVars = [
  "MONGODB_URI",
  "JWT_SECRET",
  "ENCRYPTION_KEY",
  "CLIENT_ORIGIN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GROQ_API_KEY",
  "CRON_SECRET",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
];

const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

const app = express();
const port = Number(process.env.PORT) || 4000;

mongoose
  .connect(process.env.MONGODB_URI, { dbName: "mailmind" })
  .then(() => {
    console.log("DB Connected");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

app.disable("x-powered-by");
// On Render the request reaches Express through one proxy; this makes
// req.ip the visitor's address, which the sign-in rate limit counts by.
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.use("/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/today", todayRoutes);
app.use("/api/threads", threadRoutes);
app.use("/api/ask", askRoutes);
app.use("/api/digest", digestRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use(errorMiddleware);

app.listen(port, () => {
  console.log(`Server started at ${port}`);
});
