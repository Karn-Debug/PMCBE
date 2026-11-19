import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import ExcelJS from "exceljs";
import { app } from "../src/app.js";
import { db } from "../src/config/database.js";
import {
  layouts,
  writeWorkbook,
  readWorkbook,
} from "../src/services/atelier-workbook.service.js";

async function filled(bytes: Buffer, value: number) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(bytes).buffer);
  book.getWorksheet("Statement")!.getCell("F2").value = value;
  return Buffer.from(await book.xlsx.writeBuffer());
}
for (const layout of layouts)
  test(
    "All " + layout.fields.length + " fields round trip for " + layout.id,
    async () => {
      const bytes = await writeWorkbook(layout.id, "Feasibility");
      assert.ok(
        Object.values((await readWorkbook(bytes)).statement.values).every(
          (value) => value === null,
        ),
      );
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(Uint8Array.from(bytes).buffer);
      const ws = book.getWorksheet("Statement")!;
      layout.fields.forEach((f, i) => {
        ws.getCell(i + 2, 6).value = f.text
          ? "Consultant input"
          : i === 0
            ? 0
            : -i - 0.25;
      });
      const result = await readWorkbook(
        Buffer.from(await book.xlsx.writeBuffer()),
      );
      assert.equal(
        Object.keys(result.statement.values).length,
        layout.fields.length,
      );
      layout.fields.forEach((f, i) =>
        assert.equal(
          result.statement.values[f.id],
          f.text ? "Consultant input" : i === 0 ? 0 : -i - 0.25,
        ),
      );
      assert.deepEqual(
        await readWorkbook(
          await writeWorkbook(layout.id, "", result.statement, result.meta),
        ),
        result,
      );
      ws.getCell("A3").value = ws.getCell("A2").value;
      await assert.rejects(
        readWorkbook(Buffer.from(await book.xlsx.writeBuffer())),
        /duplicate/,
      );
    },
  );
test("Portal sessions, society edits, independent histories and latest download", async (t) => {
  if (
    !["127.0.0.1", "localhost"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    )
  )
    return t.skip("Requires local database");
  const workspaceId = randomUUID(),
    otherWorkspace = randomUUID(),
    password = randomUUID();
  await db.atelierWorkspace.createMany({
    data: [{ id: workspaceId }, { id: otherWorkspace }],
  });
  try {
    const email = workspaceId + "@example.test";
    await db.atelierUser.create({
      data: {
        name: "Integration",
        workspaceId,
        email,
        passwordHash: await bcrypt.hash(password, 4),
      },
    });
    const base = "/api/atelier",
      browser = request.agent(app);
    await browser.get(base + "/societies").expect(401);
    await browser
      .post(base + "/auth/login")
      .send({ email, password: "wrong" })
      .expect(401);
    await browser
      .post(base + "/auth/login")
      .send({ email, password })
      .expect(200);
    await browser.get(base + "/auth/me").expect(200);
    await browser.get("/api/auth/me").expect(401);
    const { body: s } = await browser
      .post(base + "/societies")
      .send({
        societyName: "Integration society",
        city: "Pune",
        numberOfUnits: 0,
      })
      .expect(201);
    assert.equal(s.city, "Pune");
    assert.equal(s.numberOfUnits, 0);
    const foreign = await db.atelierSociety.create({
      data: { workspaceId: otherWorkspace, societyName: "Other" },
    });
    const inaccessible =
      base + "/societies/SOC-" + String(foreign.number).padStart(4, "0");
    await browser.get(inaccessible).expect(404);
    await browser.get(inaccessible + "/feasibility/workbook").expect(404);
    const patch = {
      id: s.id,
      updatedAt: s.updatedAt,
      fields: {
        engagementStatus: "Active",
        redevelopmentStage: "Feasibility Report",
      },
    };
    const change = await browser
      .patch(base + "/societies")
      .send([patch])
      .expect(200);
    assert.equal(change.body[0].engagementStatus, "Active");
    await browser
      .patch(base + "/societies")
      .send([patch])
      .expect(409);
    const path = base + "/societies/" + s.id + "/feasibility";
    const download = async () => {
      const res = await browser
        .get(path + "/workbook")
        .buffer(true)
        .parse((res, cb) => {
          const parts: Buffer[] = [];
          res.on("data", (c) => parts.push(c));
          res.on("end", () => cb(null, Buffer.concat(parts)));
        })
        .expect(200);
      return res.body as Buffer;
    };
    const blank = await download();
    assert.equal(
      (await readWorkbook(blank)).statement.values["plot-area"],
      null,
    );
    await browser.post(path).attach("file", blank, "empty.xlsx").expect(201);
    await browser
      .post(path)
      .attach("file", Buffer.from("invalid"), "bad.xlsx")
      .expect(400);
    assert.equal((await browser.get(path).expect(200)).body.length, 1);
    const a = await filled(blank, 100),
      b = await filled(blank, 220);
    const results = await Promise.all([
      browser.post(path).attach("file", a, "A.xlsx").expect(201),
      browser.post(path).attach("file", b, "B.xlsx").expect(201),
    ]);
    const rows = (await browser.get(path).expect(200)).body;
    assert.deepEqual(
      rows.map((r: { version: number }) => r.version),
      [3, 2, 1],
    );
    for (const [i, r] of results.entries()) {
      const saved = (await browser.get(path + "/" + r.body.id).expect(200))
        .body;
      assert.equal(saved.statement.values["plot-area"], i === 0 ? 100 : 220);
    }
    const expected = rows[0].filename === "A.xlsx" ? 100 : 220;
    await browser
      .patch(path + "/" + rows[0].id + "/remarks")
      .send({ previous: "", remarks: "Checked" })
      .expect(204);
    const latest = await readWorkbook(await download());
    assert.equal(latest.statement.values["plot-area"], expected);
    assert.equal(latest.meta.remarks, "Checked");
    await browser.post(base + "/auth/logout").expect(204);
    await browser.get(base + "/auth/me").expect(401);
  } finally {
    await db.atelierRevision.deleteMany({
      where: { society: { workspaceId } },
    });
    await db.atelierSociety.deleteMany({
      where: { workspaceId: { in: [workspaceId, otherWorkspace] } },
    });
    await db.atelierUser.deleteMany({ where: { workspaceId } });
    await db.atelierWorkspace.deleteMany({
      where: { id: { in: [workspaceId, otherWorkspace] } },
    });
    await db.$disconnect();
  }
});
