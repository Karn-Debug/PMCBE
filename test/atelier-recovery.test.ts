import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { app } from "../src/app.js";
import { db } from "../src/config/database.js";

test("Local password recovery enforces attempt limits, consumes a challenge once and revokes all sessions", async (t) => {
  if (
    !["127.0.0.1", "localhost"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    )
  )
    return t.skip("Requires a local test database");
  const workspaceId = randomUUID(),
    email = workspaceId + "@example.test";
  const oldPassword = randomUUID(),
    password = randomUUID();
  const vars = {
    NODE_ENV: process.env.NODE_ENV,
    HOST: process.env.HOST,
    PMC_LOCAL_RESET_OTP: process.env.PMC_LOCAL_RESET_OTP,
  };
  const root = "/api/atelier/auth";
  const start = async () =>
    (
      await request(app)
        .post(root + "/forgot-password")
        .send({ email })
        .expect(200)
    ).body.challenge as string;
  const reset = (challenge: string, code: string) =>
    request(app)
      .post(root + "/reset-password")
      .send({ challenge, code, password });
  try {
    Object.assign(process.env, {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PMC_LOCAL_RESET_OTP: "123456",
    });
    await db.atelierWorkspace.create({
      data: {
        id: workspaceId,
        users: {
          create: {
            email,
            name: "Reset test",
            role: "liaisoner",
            passwordHash: await bcrypt.hash(oldPassword, 4),
          },
        },
      },
    });
    const session = request.agent(app);
    await session
      .post(root + "/login")
      .send({ email, password: oldPassword })
      .expect(200);
    const locked = await start();
    for (let attempt = 0; attempt < 5; attempt++)
      await reset(locked, "000000").expect(400);
    await reset(locked, "123456").expect(400);
    const fresh = await start();
    const outcomes = await Promise.all([
      reset(fresh, "123456"),
      reset(fresh, "123456"),
    ]);
    assert.deepEqual(outcomes.map((r) => r.status).sort(), [204, 400]);
    await session.get(root + "/me").expect(401);
    await session
      .post(root + "/login")
      .send({ email, password: oldPassword })
      .expect(401);
    const result = await session
      .post(root + "/login")
      .send({ email, password })
      .expect(200);
    assert.equal(result.body.role, "liaisoner");
    process.env.NODE_ENV = "production";
    await request(app)
      .post(root + "/forgot-password")
      .send({ email })
      .expect(503);
  } finally {
    await db.atelierUser.deleteMany({ where: { workspaceId } });
    await db.atelierWorkspace.deleteMany({ where: { id: workspaceId } });
    await db.$disconnect();
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
