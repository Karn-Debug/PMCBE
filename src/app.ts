import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { trustProxy } from "./config/http.js";
import { apiLimit } from "./middleware/rate-limit.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";
import routes from "./routes/index.js";
export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", trustProxy);
app.use(
  helmet(),
  cors(),
  express.json({ limit: "2mb" }),
  cookieParser(),
);
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
}, apiLimit, routes);
app.use(errorHandler);
