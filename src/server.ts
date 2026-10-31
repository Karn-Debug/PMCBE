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
const server = app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log("PMC API ready at http://127.0.0.1:" + port),
);
async function shutdown() {
  server.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
