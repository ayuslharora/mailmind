import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import healthRoutes from "./routes/health.routes.js";
import errorMiddleware from "./middlewares/error.middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, ".env"),
  quiet: true,
});

const requiredEnvVars = ["MONGODB_URI"];

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
app.use(express.json({ limit: "100kb" }));

app.use("/health", healthRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use(errorMiddleware);

app.listen(port, () => {
  console.log(`Server started at ${port}`);
});
