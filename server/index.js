import express from "express";
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

const app = express();
const port = Number(process.env.PORT) || 4000;

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
