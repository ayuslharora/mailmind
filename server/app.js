import express from "express";
import healthRoutes from "./routes/health.routes.js";
import errorMiddleware from "./middlewares/error.middleware.js";

// Kept apart from index.js so tests can start the app on a random port.
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));

app.use("/health", healthRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use(errorMiddleware);

export default app;
