import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { trustProxy } from "./config/http.js";
import { apiLimit } from "./middleware/rate-limit.middleware.js";
import { errorHandler } from "./middleware/error.middleware.js";
import routes from "./routes/index.js";

const helmetMiddleware = (
  typeof helmet === "function" ? helmet : (helmet as { default: unknown }).default
) as () => express.RequestHandler;

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", trustProxy);
app.use(
  helmetMiddleware(),
  cors(),
  express.json({ limit: "2mb" }),
  cookieParser(),
);

app.get("/", (_req, res) => {
  const env = process.env.NODE_ENV ?? "production";
  const timestamp = new Date().toUTCString();

  res.status(200).type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>API Status — Operational</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: radial-gradient(circle at top, #132238 0%, #090d16 65%);
      color: #e2e8f0;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 460px;
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 20px;
      padding: 36px 32px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(12px);
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.03em;
      margin-bottom: 24px;
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
      100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    h1 {
      font-size: 26px;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 10px;
    }
    p {
      font-size: 15px;
      color: #94a3b8;
      line-height: 1.6;
      margin-bottom: 28px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      text-align: left;
    }
    .item {
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(148, 163, 184, 0.1);
      border-radius: 12px;
      padding: 14px;
    }
    .item.full { grid-column: 1 / -1; }
    .label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748b;
      margin-bottom: 4px;
    }
    .value {
      font-size: 14px;
      font-weight: 600;
      color: #f1f5f9;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">
      <span class="dot"></span>
      SYSTEM OPERATIONAL
    </div>
    <h1>Backend is Alive</h1>
    <p>The API server is up, healthy, and ready to handle incoming requests.</p>
    <div class="grid">
      <div class="item">
        <div class="label">Status</div>
        <div class="value">200 OK</div>
      </div>
      <div class="item">
        <div class="label">Environment</div>
        <div class="value">${env}</div>
      </div>
      <div class="item">
        <div class="label">API Base</div>
        <div class="value">/api</div>
      </div>
      <div class="item">
        <div class="label">Runtime</div>
        <div class="value">Node.js</div>
      </div>
      <div class="item full">
        <div class="label">Server Time</div>
        <div class="value">${timestamp}</div>
      </div>
    </div>
  </main>
</body>
</html>`);
});


app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
}, apiLimit, routes);
app.use(errorHandler);

export default app;