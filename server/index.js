import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import app from "./app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// One .env at the repository root, shared by every package.
dotenv.config({
  path: path.join(__dirname, "../.env"),
  quiet: true,
});

const port = Number(process.env.PORT) || 4000;

app.listen(port, () => {
  console.log(`Server started at ${port}`);
});
