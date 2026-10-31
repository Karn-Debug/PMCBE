import "dotenv/config";
import express from "express";
import path from "node:path";
import { app } from "./app.js";
import { db } from "./config/database.js";
if (process.env.SERVE_FRONTEND === "true") {
  app.use(express.static(path.resolve("../frontend/dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("../frontend/dist/index.html")),
  );
}
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const server = app.listen(port, host, () =>
  console.log(`PMC API listening on ${host}:${port}`),
);
async function shutdown() {
  server.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
