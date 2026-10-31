import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { app } from "../src/app.js";
import { db } from "../src/config/database.js";
import { calculateTotals } from "../src/utils/money.js";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || ""))
  throw new Error("Integration tests require a local test database.");
const uid = randomUUID().slice(0, 8),
  owner = request.agent(app),
  viewer = request.agent(app),
  member = request.agent(app),
  other = request.agent(app);
const password = "IntegrationTest!" + uid;
let orgId = "",
  otherOrgId = "",
  projectId = "",
  otherProjectId = "",
  invoiceId = "",
  tenderId = "";
before(async () => {
  const org = await db.organization.create({ data: { name: "TEST " + uid } });
  orgId = org.id;
  const second = await db.organization.create({
    data: { name: "TEST other " + uid },
  });
  otherOrgId = second.id;
  const passwordHash = await bcrypt.hash(password, 4);
  for (const [role, agent, organizationId] of [
    ["OWNER", owner, orgId],
    ["VIEWER", viewer, orgId],
    ["MEMBER", member, orgId],
    ["OWNER", other, otherOrgId],
  ] as const) {
    const email = role.toLowerCase() + organizationId + "@test.invalid";
    await db.user.create({
      data: { organizationId, name: role + " test", role, email, passwordHash },
    });
    await agent.post("/api/auth/login").send({ email, password }).expect(200);
  }
  projectId = (
    await owner
      .post("/api/projects")
      .send({
        name: "Integration project",
        code: "TEST-" + uid,
        location: "Test location",
      })
      .expect(201)
  ).body.id;
  otherProjectId = (
    await other
      .post("/api/projects")
      .send({
        name: "Other tenant project",
        code: "OTHER-" + uid,
        location: "Test location",
      })
      .expect(201)
  ).body.id;
});
after(async () => {
  // Fixtures are identified by fresh IDs created in this run; no application records are selected.
  for (const organizationId of [orgId, otherOrgId].filter(Boolean)) {
    await db.file.deleteMany({ where: { organizationId } });
    await db.comment.deleteMany({ where: { entity: { organizationId } } });
    await db.payment.deleteMany({ where: { invoice: { organizationId } } });
    await db.invitation.deleteMany({ where: { tender: { organizationId } } });
    await db.quotation.deleteMany({ where: { organizationId } });
    await db.invoice.deleteMany({ where: { organizationId } });
    await db.entity.deleteMany({ where: { organizationId } });
    await db.project.deleteMany({ where: { organizationId } });
    await db.audit.deleteMany({ where: { organizationId } });
    await db.user.deleteMany({ where: { organizationId } });
    await db.organization.delete({ where: { id: organizationId } });
  }
  await db.$disconnect();
});
test("unauthenticated requests and untrusted origins are blocked", async () => {
  await request(app).get("/api/projects").expect(401);
  await owner
    .post("/api/projects")
    .set("Origin", "https://untrusted.invalid")
    .send({})
    .expect(403);
});
test("passwords and session tokens are never included in team responses", async () => {
  const res = await owner.get("/api/team").expect(200);
  assert.equal(res.body.length, 3);
  for (const u of res.body) {
    assert.equal(u.passwordHash, undefined);
    assert.equal(u.sessions, undefined);
  }
});
test("viewer is read-only and members cannot edit financial records", async () => {
  await viewer.post("/api/projects").send({}).expect(403);
  await viewer.post("/api/records/tasks").send({}).expect(403);
  await member.post("/api/records/invoices").send({}).expect(403);
  await member.post("/api/team").send({}).expect(403);
});
test("tenant scoping blocks cross-workspace reads and relationships", async () => {
  const list = await owner.get("/api/projects").expect(200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].id, projectId);
  await owner
    .post("/api/records/tasks")
    .send({
      title: "Cross tenant task",
      status: "Open",
      projectId: otherProjectId,
      data: {},
    })
    .expect(400);
});
test("all modules persist valid records and return them after a new fetch", async () => {
  const billing = {
    items: [{ description: "Consultancy", quantity: 1, rate: 100, tax: 18 }],
    tds: 0,
    retention: 0,
    developerName: "Test developer",
    terms: "",
  };
  const resources: Record<string, { status: string; data: object }> = {
    tenders: { status: "Floated", data: {} },
    "work-orders": { status: "Issued", data: billing },
    invoices: { status: "Issued", data: billing },
    permissions: { status: "Pending", data: { type: "IOD" } },
    tasks: { status: "Open", data: {} },
    topics: { status: "Active", data: {} },
    documents: { status: "Draft", data: {} },
    templates: { status: "Draft", data: { category: "Legal draft" } },
    feasibility: { status: "Pending", data: {} },
    meetings: { status: "Scheduled", data: {} },
    progress: { status: "In progress", data: { percent: 50 } },
    developers: { status: "Active", data: {} },
    schemes: { status: "Active", data: { type: "CC", scheme: "33(9)" } },
  };
  for (const [module, value] of Object.entries(resources)) {
    const created = await owner
      .post("/api/records/" + module)
      .send({ title: "Test " + module, projectId, ...value })
      .expect(201);
    const record = await owner
      .get("/api/records/" + module + "/" + created.body.id)
      .expect(200);
    assert.equal(record.body.title, "Test " + module);
    if (module === "invoices") invoiceId = record.body.id;
    if (module === "tenders") tenderId = record.body.id;
    await other
      .get("/api/records/" + module + "/" + created.body.id)
      .expect(404);
  }
  const quote = await owner
    .post("/api/records/quotes")
    .send({
      title: "Test quote",
      status: "Received",
      projectId,
      parentId: tenderId,
      data: { developerName: "Test developer", amount: 500 },
    })
    .expect(201);
  assert.equal(quote.body.total, "500");
});
test("money uses decimal rounding, tax and deduction calculations", () => {
  const a = calculateTotals([{ quantity: 3, rate: 0.1, tax: 18 }], 0, 0);
  assert.equal(a.amount.toString(), "0.3");
  assert.equal(a.total.toString(), "0.35");
  const b = calculateTotals([{ quantity: 1, rate: 1000, tax: 18 }], 2, 5);
  assert.equal(b.total.toString(), "1110");
  assert.throws(() =>
    calculateTotals([{ quantity: 1000000, rate: 100000000000, tax: 18 }]),
  );
});
test("server rejects unknown properties, invalid status, and client total overrides", async () => {
  await owner
    .post("/api/records/tasks")
    .send({ title: "Bad task", status: "Invented", data: {} })
    .expect(400);
  await owner
    .post("/api/records/invoices")
    .send({
      title: "Bad invoice",
      status: "Paid",
      data: { items: [{ description: "Test", quantity: 1, rate: 10, tax: 0 }] },
    })
    .expect(400);
  await owner
    .post("/api/records/invoices")
    .send({
      title: "Bad invoice",
      status: "Issued",
      total: 0,
      data: { items: [{ description: "Test", quantity: 1, rate: 10, tax: 0 }] },
    })
    .expect(400);
  await owner
    .post("/api/projects")
    .send({ name: "Wrong date", code: "DATE", location: "Test", progress: 101 })
    .expect(400);
});
test("invalid calendar dates and duplicate document references are rejected", async () => {
  await owner
    .post("/api/records/tasks")
    .send({
      title: "Invalid calendar date",
      status: "Open",
      dueDate: "2026-02-30",
      data: {},
    })
    .expect(400);
  const value = {
    title: "Referenced document",
    reference: "UNIQUE-TEST",
    status: "Draft",
    data: {},
  };
  await owner.post("/api/records/documents").send(value).expect(201);
  await owner.post("/api/records/documents").send(value).expect(409);
});
test("image previews require authentication, organization access, and valid image bytes", async () => {
  const record = (
    await owner
      .post("/api/records/documents")
      .send({ title: "Image preview fixture", status: "Draft", data: {} })
      .expect(201)
  ).body;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4vQAAAAASUVORK5CYII=",
    "base64",
  );
  const f = (
    await owner
      .post("/api/records/documents/" + record.id + "/files")
      .attach("file", png, { filename: "header.png", contentType: "image/png" })
      .expect(201)
  ).body;
  const response = await owner
    .get("/api/files/" + f.id + "/preview")
    .expect(200);
  assert.equal(response.headers["content-type"], "image/png");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  await other.get("/api/files/" + f.id + "/preview").expect(404);
  await request(app)
    .get("/api/files/" + f.id + "/preview")
    .expect(401);
  const fake = (
    await owner
      .post("/api/records/documents/" + record.id + "/files")
      .attach("file", Buffer.from("<script>unsafe</script>"), {
        filename: "fake.png",
        contentType: "image/png",
      })
      .expect(201)
  ).body;
  await owner.get("/api/files/" + fake.id + "/preview").expect(400);
});
test("optimistic locking prevents overwriting another editor", async () => {
  const created = (
    await member
      .post("/api/records/tasks")
      .send({ title: "Concurrent task", status: "Open", projectId, data: {} })
      .expect(201)
  ).body;
  const update = {
    title: "Updated task",
    status: "In progress",
    projectId,
    data: {},
  };
  await member
    .put("/api/records/tasks/" + created.id)
    .set("If-Match", "1")
    .send(update)
    .expect(200);
  await member
    .put("/api/records/tasks/" + created.id)
    .set("If-Match", "1")
    .send(update)
    .expect(409);
});
test("concurrent payments cannot overpay an invoice", async () => {
  const post = (reference: string) =>
    owner.post("/api/records/invoices/" + invoiceId + "/payments").send({
      amount: 80,
      date: "2026-10-28",
      reference,
      method: "Bank transfer",
    });
  const results = await Promise.all([
    post("CONCURRENT-A"),
    post("CONCURRENT-B"),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
  const invoice = (
    await owner.get("/api/records/invoices/" + invoiceId).expect(200)
  ).body;
  assert.equal(invoice.paid, "80");
  assert.equal(invoice.status, "Part paid");
  await owner
    .post("/api/records/invoices/" + invoiceId + "/payments")
    .send({ amount: 38, date: "2026-10-28", reference: "FINAL", method: "UPI" })
    .expect(201);
  const paid = (await owner.get("/api/records/invoices/" + invoiceId)).body;
  assert.equal(paid.paid, "118");
  assert.equal(paid.status, "Paid");
  await owner
    .post("/api/records/invoices/" + invoiceId + "/archive")
    .expect(400);
});
test("file uploads, download access, comments, archive, and restore work", async () => {
  const record = (
    await member.post("/api/records/documents").send({
      title: "Test attachment",
      status: "Draft",
      projectId,
      data: { category: "General" },
    })
  ).body;
  const f = (
    await member
      .post("/api/records/documents/" + record.id + "/files")
      .attach("file", Buffer.from("integration document"), "test.txt")
      .expect(201)
  ).body;
  const download = await owner.get("/api/files/" + f.id).expect(200);
  assert.ok(download.headers["content-disposition"].includes("test.txt"));
  await other.get("/api/files/" + f.id).expect(404);
  await member
    .post("/api/records/documents/" + record.id + "/comments")
    .send({ content: "Verified comment" })
    .expect(201);
  await owner
    .post("/api/records/documents/" + record.id + "/archive")
    .expect(200);
  await owner.get("/api/records/documents/" + record.id).expect(404);
  await owner.get("/api/files/" + f.id).expect(404);
  await owner
    .post("/api/records/documents/" + record.id + "/restore")
    .expect(200);
  const restored = (await owner.get("/api/records/documents/" + record.id))
    .body;
  assert.equal(restored.comments[0].content, "Verified comment");
  assert.equal(restored.files.length, 1);
});
test("tender invitation accepts exactly one submission and exposes only tender fields", async () => {
  const invite = (
    await owner
      .post("/api/tenders/" + tenderId + "/invitations")
      .send({ developerName: "Invited developer" })
      .expect(201)
  ).body;
  const token = invite.url.split("/").pop(),
    route = "/api/portal/" + token;
  const info = (await request(app).get(route).expect(200)).body;
  assert.equal(info.developerName, "Invited developer");
  assert.equal(info.tokenHash, undefined);
  const body = {
    amount: 1000,
    additionalArea: 30,
    rent: 100,
    corpus: 2000,
    completionMonths: 36,
    content: "Proposal",
  };
  await request(app).post(route).send(body).expect(201);
  await request(app).post(route).send(body).expect(409);
});
test("logout revokes the server session", async () => {
  await viewer.post("/api/auth/logout").expect(204);
  await viewer.get("/api/projects").expect(401);
});

test("awarding proposals atomically keeps one accepted quote per tender", async () => {
  const create = async (name: string) =>
    (
      await owner
        .post("/api/records/quotes")
        .send({
          title: name,
          status: "Received",
          projectId,
          parentId: tenderId,
          data: { developerName: name, amount: 1000 },
        })
        .expect(201)
    ).body.id;
  const a = await create("Award candidate A"),
    b = await create("Award candidate B");
  await Promise.all([
    owner.post("/api/quotes/" + a + "/award").expect(200),
    owner.post("/api/quotes/" + b + "/award").expect(200),
  ]);
  const quotes = (await owner.get("/api/records/quotes?parentId=" + tenderId))
    .body.items;
  assert.equal(
    quotes.filter((q: { status: string }) => q.status === "Accepted").length,
    1,
  );
  assert.equal(
    (await owner.get("/api/records/tenders/" + tenderId)).body.status,
    "Awarded",
  );
  await member.post("/api/quotes/" + a + "/award").expect(403);
});
test("password changes verify the old password and revoke every session", async () => {
  await member
    .post("/api/auth/password")
    .send({ currentPassword: "wrong", newPassword: "ChangedIntegration!123" })
    .expect(400);
  await member
    .post("/api/auth/password")
    .send({ currentPassword: password, newPassword: "ChangedIntegration!123" })
    .expect(200);
  await member.get("/api/projects").expect(401);
});

test("Tender Form persists separately with tenant isolation, roles and edit conflicts", async () => {
  const initial = (await owner.get("/api/tender-setup").expect(200)).body;
  assert.equal(initial.version, 0);
  const body = {
    regulation: "33(9)",
    unitTypes: [
      {
        id: "unit-a",
        name: "1 BHK",
        sortOrder: 1,
        type: "Custom",
        status: "Active",
      },
    ],
    otherTerms: [
      {
        id: "term-a",
        name: "Car Parking",
        sortOrder: 1,
        type: "Custom",
        status: "Active",
      },
    ],
    sections: [
      {
        id: "section-a",
        serial: "1",
        title: "Displacement of members",
        rows: [
          {
            id: "row-a",
            serial: "1.1",
            description: "Monthly rent",
            offer: "110 / sq ft",
            remarks: "Verify area",
          },
        ],
      },
    ],
  };
  const viewerEmail = "viewer" + orgId + "@test.invalid";
  await viewer
    .post("/api/auth/login")
    .send({ email: viewerEmail, password })
    .expect(200);
  await viewer
    .put("/api/tender-setup")
    .set("If-Match", "0")
    .send(body)
    .expect(403);
  const saved = (
    await owner
      .put("/api/tender-setup")
      .set("If-Match", "0")
      .send(body)
      .expect(200)
  ).body;
  assert.equal(saved.version, 1);
  const reloaded = (await owner.get("/api/tender-setup").expect(200)).body;
  assert.deepEqual(reloaded.sections, body.sections);
  assert.deepEqual(reloaded.unitTypes, body.unitTypes);
  assert.deepEqual(reloaded.otherTerms, body.otherTerms);
  assert.equal(
    (await other.get("/api/tender-setup").expect(200)).body.version,
    0,
  );
  await owner
    .put("/api/tender-setup")
    .set("If-Match", "0")
    .send(body)
    .expect(409);
  const invalid = structuredClone(body);
  invalid.sections[0].rows.push({ ...invalid.sections[0].rows[0] });
  await owner
    .put("/api/tender-setup")
    .set("If-Match", "1")
    .send(invalid)
    .expect(400);
  const updated = (
    await owner
      .put("/api/tender-setup")
      .set("If-Match", "1")
      .send({ ...body, regulation: "33(8)" })
      .expect(200)
  ).body;
  assert.equal(updated.version, 2);
  assert.equal(updated.regulation, "33(8)");
});

test("rich templates retain Word formatting and remove executable content", async () => {
  const content =
    '<p><strong>Work order</strong> <span style="font-size:18px;color:#111111">Readable text</span><mark data-color="#ffff00" style="background-color:#ffff00">Highlighted</mark></p><table><tbody><tr><td colspan="2">||DEVELOPER_NAME||</td></tr></tbody></table><script>alert(1)</script><img src="https://tracker.invalid/pixel" onerror="alert(1)"><a href="javascript:alert(1)">Unsafe link</a><div style="position:fixed;background-image:url(https://tracker.invalid)">Safe text</div>';
  const saved = (
    await owner
      .post("/api/records/templates")
      .send({
        title: "Rich work order test",
        status: "Draft",
        content,
        data: { category: "Work order", format: "html" },
      })
      .expect(201)
  ).body;
  assert.match(saved.content, /<strong>Work order<\/strong>/);
  assert.match(saved.content, /font-size:18px/);
  assert.match(saved.content, /<table>/);
  assert.match(saved.content, /<mark[^>]*>Highlighted<\/mark>/);
  assert.match(saved.content, /\|\|DEVELOPER_NAME\|\|/);
  assert.doesNotMatch(
    saved.content,
    /script|onerror|javascript:|tracker.invalid|position:fixed/,
  );
  const reloaded = (
    await owner.get("/api/records/templates/" + saved.id).expect(200)
  ).body;
  assert.equal(reloaded.content, saved.content);
  assert.equal(reloaded.data.format, "html");
  const filtered = (
    await owner.get("/api/records/templates?category=Work%20order").expect(200)
  ).body.items;
  assert(filtered.some((r: any) => r.id === saved.id));
  assert(filtered.every((r: any) => r.data.category === "Work order"));
  assert(
    !(
      await owner.get("/api/records/templates?category=Invoice").expect(200)
    ).body.items.some((r: any) => r.id === saved.id),
  );
});

test("modules persist in dedicated tables with typed columns and no JSON business storage", async () => {
  const tables = await db.$queryRaw<
    Array<{ table_name: string; column_name: string }>
  >`
    SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND data_type IN ('json','jsonb')
  `;
  assert.deepEqual(tables, []);
  const legacy = await db.$queryRaw<
    Array<{ name: string | null }>
  >`SELECT to_regclass('public."Record"')::text AS name`;
  assert.equal(legacy[0].name, null);
  assert.ok(await db.tender.findUnique({ where: { id: tenderId } }));
  const invoice = await db.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { items: true, payments: true },
  });
  assert.equal(invoice.items.length, 1);
  assert.equal(invoice.items[0].description, "Consultancy");
  assert.ok(invoice.payments.length > 0);
  assert.ok(invoice.payments.every((p) => p.invoiceId === invoiceId));
});

test("tender row edits remain ordered and stale saves cannot partially replace child tables", async () => {
  const input = {
    title: "Relational tender",
    status: "Draft",
    projectId,
    data: {
      regulation: "33(9)",
      unitTypes: [{ name: "1 BHK" }, { name: "SHOP" }],
      otherTerms: [{ name: "Parking" }],
      requirements: [
        {
          section: "Rent",
          sectionSerial: "1",
          serial: "1.1",
          description: "Monthly rent",
          offer: "110",
          remarks: "First year",
        },
        {
          section: "Rent",
          sectionSerial: "1",
          serial: "1.2",
          description: "Annual increase",
          offer: "10%",
          remarks: "",
        },
      ],
    },
  };
  const created = (
    await owner.post("/api/records/tenders").send(input).expect(201)
  ).body;
  const edited = {
    ...input,
    data: {
      ...input.data,
      unitTypes: [{ name: "SHOP" }],
      requirements: [input.data.requirements[1]],
    },
  };
  const saved = (
    await owner
      .put("/api/records/tenders/" + created.id)
      .set("If-Match", "1")
      .send(edited)
      .expect(200)
  ).body;
  assert.equal(saved.createdAt, created.createdAt);
  assert.equal(saved.version, 2);
  await owner
    .put("/api/records/tenders/" + created.id)
    .set("If-Match", "1")
    .send(input)
    .expect(409);
  const rows = await db.tenderRequirement.findMany({
    where: { tenderId: created.id },
    orderBy: { position: "asc" },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].serial, "1.2");
  assert.equal(rows[0].position, 0);
  const reloaded = (
    await owner.get("/api/records/tenders/" + created.id).expect(200)
  ).body;
  assert.deepEqual(reloaded.data.requirements, edited.data.requirements);
  assert.deepEqual(reloaded.data.unitTypes, [{ name: "SHOP" }]);
});

test("database foreign keys enforce tenant, parent type and invoice-only payments", async () => {
  const task = await db.task.findFirstOrThrow({
    where: { organizationId: orgId },
  });
  const quote = await db.quotation.findFirstOrThrow({
    where: { organizationId: orgId },
  });
  await assert.rejects(
    db.task.update({
      where: { id: task.id },
      data: { projectId: otherProjectId },
    }),
  );
  await assert.rejects(
    db.quotation.update({
      where: { id: quote.id },
      data: { tenderId: task.id },
    }),
  );
  await assert.rejects(
    db.payment.create({
      data: {
        invoiceId: task.id,
        amount: 1,
        date: new Date(),
        reference: "INVALID-FK",
        method: "Cash",
      },
    }),
  );
  await assert.rejects(
    db.task.update({ where: { id: task.id }, data: { kind: "TENDER" } }),
  );
  assert.equal(
    (await db.task.findUniqueOrThrow({ where: { id: task.id } })).projectId,
    task.projectId,
  );
});

test("project coordinators and organization profile retain their API shape after relational saves", async () => {
  const input = {
    name: "Coordinator project",
    code: "COORD-" + uid,
    location: "Mumbai",
    coordinators: [
      { name: "Lead", mobile: "123" },
      { name: "Site", mobile: "456" },
    ],
  };
  const project = (await owner.post("/api/projects").send(input).expect(201))
    .body;
  assert.deepEqual(project.coordinators, input.coordinators);
  const changed = (
    await owner
      .put("/api/projects/" + project.id)
      .set("If-Match", "1")
      .send({ ...input, coordinators: [input.coordinators[1]] })
      .expect(200)
  ).body;
  assert.deepEqual(changed.coordinators, [input.coordinators[1]]);
  assert.equal(changed.createdAt, project.createdAt);
  assert.equal(
    await db.projectCoordinator.count({ where: { projectId: project.id } }),
    1,
  );
  const profile = {
    email: "team@test.invalid",
    phone: "123",
    address: "Mumbai",
    gstin: "",
    website: "",
    companySize: "1-10",
  };
  const organization = (
    await owner
      .put("/api/organization")
      .send({ name: "Updated test workspace", profile })
      .expect(200)
  ).body;
  assert.deepEqual(organization.profile, profile);
  assert.equal(
    (
      await db.organizationProfile.findUniqueOrThrow({
        where: { organizationId: orgId },
      })
    ).email,
    profile.email,
  );
});

test("Tender Form IDs are scoped to their setup and sections can be reordered safely", async () => {
  const first = (await owner.get("/api/tender-setup").expect(200)).body;
  const body = {
    regulation: first.regulation,
    unitTypes: first.unitTypes,
    otherTerms: first.otherTerms,
    sections: [
      ...first.sections,
      {
        id: "section-b",
        serial: "2",
        title: "Rehabilitation",
        rows: [
          {
            id: "row-b",
            serial: "2.1",
            description: "Carpet area",
            offer: "",
            remarks: "",
          },
        ],
      },
    ],
  };
  const copy = (
    await other
      .put("/api/tender-setup")
      .set("If-Match", "0")
      .send(body)
      .expect(200)
  ).body;
  assert.equal(copy.unitTypes[0].id, first.unitTypes[0].id);
  const updated = (
    await owner
      .put("/api/tender-setup")
      .set("If-Match", String(first.version))
      .send(body)
      .expect(200)
  ).body;
  const reordered = { ...body, sections: [...body.sections].reverse() };
  await owner
    .put("/api/tender-setup")
    .set("If-Match", String(updated.version))
    .send(reordered)
    .expect(200);
  const loaded = (await owner.get("/api/tender-setup").expect(200)).body;
  assert.deepEqual(loaded.sections, reordered.sections);
  const stored = await db.tenderSetup.findUniqueOrThrow({
    where: { organizationId: orgId },
    include: { sections: { include: { rows: true } } },
  });
  assert.equal(stored.sections.length, 2);
  assert.equal(
    stored.sections.reduce((n, s) => n + s.rows.length, 0),
    2,
  );
  assert.deepEqual(
    (await other.get("/api/tender-setup").expect(200)).body.sections,
    body.sections,
  );
});

test("empty frontend filters behave like omitted filters for every module", async () => {
  for (const module of [
    "tenders",
    "quotes",
    "work-orders",
    "invoices",
    "permissions",
    "tasks",
    "topics",
    "documents",
    "templates",
    "feasibility",
    "meetings",
    "progress",
    "developers",
    "schemes",
  ]) {
    const plain = (
      await owner.get("/api/records/" + module + "?limit=12").expect(200)
    ).body;
    const frontend = (
      await owner
        .get(
          "/api/records/" +
            module +
            "?q=&status=&projectId=&parentId=&category=&page=1&limit=12&archived=false",
        )
        .expect(200)
    ).body;
    assert.equal(frontend.total, plain.total, module + " total");
    assert.deepEqual(
      frontend.items.map((r: { id: string }) => r.id),
      plain.items.map((r: { id: string }) => r.id),
      module + " rows",
    );
  }
});
