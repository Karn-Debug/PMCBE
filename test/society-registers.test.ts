import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import request from "supertest";
import { app } from "../src/app.js";
import { db } from "../src/config/database.js";

test("Society and premises imports, files and decisions persist within the signed-in workspace", async (t) => {
  if (
    !["127.0.0.1", "localhost"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    )
  )
    return t.skip("Requires local PostgreSQL");
  const workspaceId = randomUUID(),
    other = randomUUID(),
    password = randomUUID(),
    email = workspaceId + "@example.test";
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
  const user = await db.atelierUser.create({
    data: {
      workspaceId,
      email,
      name: "Register test",
      passwordHash: await bcrypt.hash(password, 4),
    },
  });
  const foreign = await db.atelierSociety.create({
    data: { workspaceId: other, societyName: "Other society" },
  });
  const api = "/api/pmc",
    base = api + "/societies";
  const client = request.agent(app);
  await client.get(api + "/registers").expect(401);
  await client
    .post(api + "/auth/login")
    .send({ email, password })
    .expect(200);
  const forbidden = base + "/SOC-" + String(foreign.number).padStart(4, "0");
  for (const suffix of ["/premises", "/documents", "/meetings"])
    await client.get(forbidden + suffix).expect(404);

  const makeRow = (values: Record<string, string>) => ({
    source: "List row",
    fields: Object.entries(values).map(([key, value]) => ({ key, value })),
  });
  const society = makeRow({
    societyName: "Test Co-operative Society",
    locality: "North",
    numberOfUnits: "3",
  });
  let rows = [society, makeRow({ societyName: "X" })];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(init.body);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.store, false);
    const input = body.input[0].content[0];
    if (input.type === "input_text") assert.match(input.text, /Society/);
    else assert.match(input.file_data, /^data:application\/pdf;base64,/);
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({ complete: true, rows }),
            },
          ],
        },
      ],
    });
  });
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "fixture";
  t.after(() => {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  });
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("List").addRows([
    ["Society", "Locality"],
    ["Test Co-operative Society", "North"],
  ]);
  const excel = Buffer.from(await workbook.xlsx.writeBuffer());
  const upload = () =>
    client.post(base + "/import").attach("file", excel, "societies.xlsx");
  await upload().expect(422);
  assert.equal((await client.get(base)).body.length, 0);
  rows = [society, society];
  assert.deepEqual((await upload().expect(200)).body, {
    created: 1,
    skipped: 1,
    membersAdded: 0,
    alreadyImported: false,
  });
  assert.equal((await upload().expect(200)).body.alreadyImported, true);
  const [imported] = (await client.get(base)).body;
  assert.deepEqual(imported.projectAssignments, [
    { userId: user.id, role: user.role },
  ]);
  const path = base + "/" + imported.id,
    units = path + "/premises";
  const workbookPdf = await PDFDocument.create();
  workbookPdf.addPage().drawText("Unit 001 - Sample Owner");
  const pdf = Buffer.from(await workbookPdf.save());
  rows = [
    makeRow({
      premisesNumber: "001",
      members: "Sample Owner",
      existingArea: "535.25",
    }),
    makeRow({ premisesNumber: "001", members: "Second Owner" }),
  ];
  const result = await client
    .post(units + "/import")
    .attach("file", pdf, "owners.pdf")
    .expect(200);
  assert.equal(result.body.membersAdded, 2);
  const [unit] = (await client.get(units)).body;
  assert.equal(unit.premisesNumber, "001");
  assert.equal(unit.existingArea, "535.25");
  assert.equal(unit.proposedArea, "");
  assert.equal(unit.members.length, 2);
  const unitUrl = units + "/" + unit.id;
  await client.get(unitUrl).expect(200);
  await client
    .put(unitUrl)
    .send({
      updatedAt: unit.updatedAt,
      premisesNumber: "001",
      members: ["Second Owner"],
    })
    .expect(200);
  assert.equal((await client.get(unitUrl)).body.members.length, 1);
  await client
    .put(unitUrl)
    .send({ updatedAt: unit.updatedAt, premisesNumber: "001" })
    .expect(404);
  const fresh = await client
    .post(units)
    .send({ premisesNumber: "002" })
    .expect(201);
  await client.delete(units + "/" + fresh.body.id).expect(204);

  const documents = path + "/documents",
    doc = { title: "Minutes", category: "Meetings & Resolutions" };
  const created = await client
    .post(documents)
    .field("record", JSON.stringify(doc))
    .attach("file", pdf, "minutes.pdf")
    .expect(201);
  const docUrl = documents + "/" + created.body.id;
  assert.deepEqual((await client.get(docUrl + "/file").expect(200)).body, pdf);
  const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  await client
    .put(docUrl)
    .field(
      "record",
      JSON.stringify({
        ...doc,
        title: "Approved",
        status: "Verified",
        updatedAt: created.body.updatedAt,
      }),
    )
    .attach("file", image, "signed.png")
    .expect(200);
  assert.equal((await client.get(docUrl)).body.title, "Approved");
  assert.deepEqual((await client.get(docUrl + "/file")).body, image);
  const meetings = path + "/meetings",
    meeting = {
      meetingType: "PMC Review Meeting",
      date: "2026-10-29T14:30",
      agenda: "Review documents",
      venue: "Boardroom",
      decisions: [{ decision: "Accept drawings", votingSummary: "Unanimous" }],
    };
  const posted = await client
    .post(meetings)
    .field("record", JSON.stringify(meeting))
    .attach("attachments", pdf, "agenda.pdf")
    .expect(201);
  const meetingUrl = meetings + "/" + posted.body.id,
    fileUrl = meetingUrl + "/files/" + posted.body.attachments[0].id;
  assert.deepEqual((await client.get(fileUrl)).body, pdf);
  await client
    .put(meetingUrl)
    .send({
      ...meeting,
      updatedAt: posted.body.updatedAt,
      removeAttachments: [posted.body.attachments[0].id],
      decisions: [{ decision: "Defer vote" }],
    })
    .expect(200);
  assert.equal(
    (await client.get(meetingUrl)).body.decisions[0].decision,
    "Defer vote",
  );
  await client.get(fileUrl).expect(404);
  const portfolio = (await client.get(api + "/registers").expect(200)).body;
  assert.deepEqual(
    [
      portfolio.documents.length,
      portfolio.premises.length,
      portfolio.meetings.length,
    ],
    [1, 1, 1],
  );
  for (const url of [unitUrl, docUrl, meetingUrl]) {
    await client.delete(url).expect(204);
    await client.get(url).expect(404);
  }
});
