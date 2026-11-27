import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { app } from "../src/app.js";
import { db } from "../src/config/database.js";
import { societyRef } from "../src/services/atelier-society.service.js";

test("a society links a citizen-search match and reads its saved proposal within its workspace", async (t) => {
  if (
    !["127.0.0.1", "localhost"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    )
  )
    return t.skip("Requires local PostgreSQL");
  const workspaceId = randomUUID(),
    other = randomUUID();
  const email = workspaceId + "@example.test",
    password = randomUUID();
  await db.atelierWorkspace.createMany({
    data: [{ id: workspaceId }, { id: other }],
  });
  t.after(async () => {
    await db.atelierSociety.deleteMany({
      where: { workspaceId: { in: [workspaceId, other] } },
    });
    await db.atelierUser.deleteMany({ where: { workspaceId } });
    await db.atelierWorkspace.deleteMany({
      where: { id: { in: [workspaceId, other] } },
    });
    await db.$disconnect();
  });
  await db.atelierUser.create({
    data: {
      workspaceId,
      email,
      name: "Permission test",
      passwordHash: await bcrypt.hash(password, 4),
    },
  });
  const society = await db.atelierSociety.create({
    data: { workspaceId, societyName: "Test society", ctsNumber: "762" },
  });
  const foreign = await db.atelierSociety.create({
    data: { workspaceId: other, societyName: "Other society" },
  });
  const base = "/api/pmc/societies";
  const path = base + "/" + societyRef(society.number) + "/permissions";
  const foreignPath = base + "/" + societyRef(foreign.number) + "/permissions";
  const proposal = "P-21143/2024/(762)/D Ward/GIRGAUM";
  const original = process.env.BATMAN_SECURITY_KEY;
  process.env.BATMAN_SECURITY_KEY = "test-only";
  t.after(() => {
    if (original === undefined) delete process.env.BATMAN_SECURITY_KEY;
    else process.env.BATMAN_SECURITY_KEY = original;
  });
  const upstream: string[] = [];
  let failure = false;
  t.mock.method(globalThis, "fetch", async (input: URL, init: RequestInit) => {
    const url = new URL(input);
    upstream.push(url.pathname);
    if (url.hostname === "citizen-search.vercel.app") {
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(String(init.body)), {
        ctsNo: "762",
        details: false,
        maxDetailRecords: 3,
        fileMode: "onDemand",
      });
      return Response.json({
        result: { records: [{ projectNo: proposal }], totalRecords: 1 },
      });
    }
    assert.equal(url.origin, "https://api.dev.batman.co.in");
    assert.equal(url.searchParams.get("security_key"), "test-only");
    assert.equal(url.searchParams.get("proposal_no"), proposal);
    if (failure) return new Response("internal information", { status: 500 });
    return Response.json({
      success: true,
      data: url.pathname.endsWith("permissions")
        ? { groups: [] }
        : { response: { details: { fileNumber: proposal } } },
    });
  });
  const client = request.agent(app);
  await client.get(path + "/project").expect(401);
  await client
    .post("/api/pmc/auth/login")
    .send({ email, password })
    .expect(200);
  await client
    .post(foreignPath + "/search")
    .send({ ctsNo: "762" })
    .expect(404);
  await client.get(foreignPath + "/structure").expect(404);
  await client.get(path + "/project").expect(409);
  assert.equal(upstream.length, 0);
  const found = await client
    .post(path + "/search")
    .send({ ctsNo: "762" })
    .expect(200);
  assert.equal(found.body.records[0].projectNo, proposal);
  const change = {
    id: societyRef(society.number),
    updatedAt: society.updatedAt.toISOString(),
    fields: { proposalNumber: proposal },
  };
  await client.patch(base).send([change]).expect(200);
  await client.patch(base).send([change]).expect(409);
  const saved = await client.get(base + "/" + change.id).expect(200);
  assert.equal(saved.body.proposalNumber, proposal);
  await client
    .post(path + "/search")
    .send({ ctsNo: "762" })
    .expect(409);
  await client.get(path + "/project").expect(200);
  await client.get(path + "/structure").expect(200);
  assert.deepEqual(upstream, [
    "/api/citizen-search",
    "/project/search-projects",
    "/project/permissions",
  ]);
  failure = true;
  const failed = await client.get(path + "/project").expect(502);
  assert.doesNotMatch(failed.text, /internal information|test-only/);
});
