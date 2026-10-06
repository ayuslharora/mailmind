import express from "express";
import { healthRouter } from "./routes/health.js";

// Builds the app without listening, so tests can start it on a random port.
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.use("/health", healthRouter);

  app.use((req, res) => res.status(404).json({ error: "Not found" }));
  return app;
}
