import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { origins } from "./config/http.js";
import { checkOrigin } from "./middleware/origin.middleware.js";
import { apiLimit } from "./middleware/rate-limit.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";
import routes from "./routes/index.js";
export const app = express();
app.disable("x-powered-by");
app.use(
  helmet(),
  cors({ origin: origins, credentials: true }),
  express.json({ limit: "2mb" }),
  cookieParser(),
);
app.use("/api", checkOrigin, apiLimit, routes);
app.use(errorHandler);
