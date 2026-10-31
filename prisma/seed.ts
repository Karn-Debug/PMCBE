import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/config/database.js";
import { calculateTotals } from "../src/utils/money.js";
import { createEntity } from "../src/repositories/entity.repository.js";
import { moduleKinds, type Module } from "../src/constants/modules.js";
import type { RecordKind } from "../src/generated/prisma/client.js";
const email = process.env.ADMIN_EMAIL,
  password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 12)
  throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters).");
if (await db.user.findUnique({ where: { email } })) {
  console.log("Account exists; seed skipped.");
  await db.$disconnect();
  process.exit(0);
}
const demo = process.env.SEED_DEMO === "true";
if (demo && process.env.NODE_ENV === "production")
  throw new Error("Demo seeding is disabled in production");
const org = await db.organization.create({
  data: {
    name: "Alpha Force",
    isDemo: demo,
    profile: {
      create: {
        email: "",
        phone: "",
        address: "Mumbai, Maharashtra",
        gstin: "",
        website: "",
        companySize: "12–50",
      },
    },
  },
});
const passwordHash = await bcrypt.hash(password, 12);
const owner = await db.user.create({
  data: {
    organizationId: org.id,
    name: "Workspace Owner",
    email,
    passwordHash,
    role: "OWNER",
  },
});
if (demo) {
  const manager = await db.user.create({
    data: {
      organizationId: org.id,
      name: "Project Manager",
      email: "manager@stallion.local",
      passwordHash,
      role: "MANAGER",
    },
  });
  await db.user.create({
    data: {
      organizationId: org.id,
      name: "Project Viewer",
      email: "viewer@stallion.local",
      passwordHash,
      role: "VIEWER",
    },
  });
  const projects = await Promise.all(
    [
      {
        name: "KNK CHSL",
        code: "KNK-001",
        location: "Borivali West",
        stage: "Approvals",
        progress: 42,
        tower: "Tower A",
        society: "KNK Co-operative Housing Society",
        description:
          "Redevelopment programme with a coordinated approach to society requirements, approvals and project delivery.",
      },
      {
        name: "Agripada",
        code: "AGR-002",
        location: "Agripada",
        stage: "Tendering",
        progress: 24,
        tower: "Main tower",
        society: "Agripada Society",
        description:
          "A new chapter for an established community. Tender evaluation and development planning.",
      },
    ].map((p) =>
      db.project.create({
        data: {
          ...p,
          organizationId: org.id,
          startDate: new Date("2026-07-01"),
          targetDate: new Date("2028-12-31"),
        },
      }),
    ),
  );
  const make = async (
    kind: RecordKind,
    title: string,
    status: string,
    projectId: string | null,
    data: object = {},
    extra: object = {},
  ) =>
    db.$transaction((tx) =>
      createEntity(
        tx,
        (Object.keys(moduleKinds) as Module[]).find(
          (m) => moduleKinds[m] === kind,
        )!,
        org.id,
        {
          title,
          status,
          projectId,
          data: JSON.parse(JSON.stringify(data)),
          ...extra,
        },
      ),
    );
  const requirements = [
    {
      section: "Member rehabilitation",
      description: "Additional carpet area offered to existing members",
      offer: "",
      remarks: "Specify percentage and area basis.",
    },
    {
      section: "Displacement",
      description: "Monthly rent during construction, per sq. ft.",
      offer: "",
      remarks: "Include escalation and advance schedule.",
    },
    {
      section: "Delivery",
      description: "Completion period and handover milestones",
      offer: "",
      remarks: "State the grace period separately.",
    },
  ];
  const tender = await make(
    "TENDER",
    "KNK society redevelopment",
    "Floated",
    projects[0].id,
    {
      regulation: "33(9)",
      requirements,
      units: "Residential and commercial",
      terms: "Sample terms. Replace with approved project terms.",
    },
    {
      dueDate: new Date("2026-11-15"),
      reference: "TND-2026-001",
      content:
        "Detailed proposals for rehabilitation, commercial terms, and delivery commitments.",
    },
  );
  await make(
    "TENDER",
    "Agripada development partner",
    "Under review",
    projects[1].id,
    {
      regulation: "33(9)",
      requirements,
      units: "Residential",
      terms: "Sample tender terms.",
    },
    { dueDate: new Date("2026-11-05"), reference: "TND-2026-002" },
  );
  for (const [i, name] of [
    "Northline Developers",
    "Meridian Infrastructure",
  ].entries()) {
    await make("DEVELOPER", name, "Active", null, {
      email: "contact" + i + "@example.com",
      phone: "",
      contact: "Development team",
      address: "Mumbai",
    });
    await make(
      "QUOTE",
      name + " proposal",
      i ? "Shortlisted" : "Received",
      projects[0].id,
      {
        developerName: name,
        amount: i ? 18500000 : 19200000,
        additionalArea: i ? 35 : 32,
        rent: i ? 115 : 110,
        corpus: i ? 5000000 : 4500000,
        completionMonths: i ? 36 : 40,
      },
      {
        parentId: tender.id,
        amount: i ? 18500000 : 19200000,
        total: i ? 18500000 : 19200000,
      },
    );
  }
  const items = [
      {
        description: "Structural consultancy and project coordination",
        quantity: 1,
        rate: 800000,
        tax: 18,
      },
    ],
    { amount, total } = calculateTotals(items);
  const wo = await make(
    "WORK_ORDER",
    "Structural consultancy",
    "Approved",
    projects[0].id,
    {
      developerName: "Northline Developers",
      items,
      tds: 0,
      retention: 0,
      terms: "Sample work order — milestone approval required.",
    },
    { amount, total, reference: "WO-2026-001" },
  );
  const inv = await make(
    "INVOICE",
    "Structural consultancy · Phase 1",
    "Part paid",
    projects[0].id,
    {
      developerName: "Northline Developers",
      items,
      tds: 0,
      retention: 0,
      terms: "Payment due within 30 days.",
    },
    {
      amount,
      total,
      paid: 150000,
      parentId: wo.id,
      reference: "INV-2026-001",
      dueDate: new Date("2026-11-12"),
    },
  );
  await db.payment.create({
    data: {
      invoiceId: inv.id,
      amount: 150000,
      date: new Date("2026-10-16"),
      reference: "DEMO-PAY-001",
      method: "Bank transfer",
    },
  });
  for (const [i, title] of [
    "Review revised structural drawings",
    "Compare developer proposals",
    "Prepare society AGM agenda",
    "Collect fire approval documents",
    "Publish weekly site update",
    "Complete feasibility review",
  ].entries())
    await make(
      "TASK",
      title,
      ["In progress", "In review", "Open", "Open", "In progress", "Completed"][
        i
      ],
      projects[i % 2].id,
      {
        topic: ["Design coordination", "Tender evaluation", "Society liaison"][
          i % 3
        ],
      },
      {
        assigneeId: i % 2 ? owner.id : manager.id,
        priority: i === 3 ? "High" : "Medium",
        dueDate: new Date("2026-11-" + String(i + 1).padStart(2, "0")),
        content: "Sample task for the local demonstration workspace.",
      },
    );
  for (const title of [
    "Design coordination",
    "Tender evaluation",
    "Society liaison",
  ])
    await make("TOPIC", title, "Active", null, {
      members: [owner.name, manager.name],
    });
  for (const [i, title] of [
    "Hydraulic NOC",
    "CFO NOC",
    "Commencement certificate",
    "Occupation certificate",
    "Environmental clearance",
  ].entries())
    await make(
      "PERMISSION",
      title,
      i === 2 ? "Issued" : i === 1 ? "Applied" : "Pending",
      projects[i % 2].id,
      {
        type: ["IOD", "IOD", "CC", "OC", "IOD"][i],
        scheme: "33(9)",
        authority: "Municipal authority",
        expiry: null,
        flagged: i === 0,
        documents: "Application, drawings, supporting certificates",
      },
      {
        assigneeId: manager.id,
        dueDate: new Date("2026-11-" + String(i + 5).padStart(2, "0")),
      },
    );
  for (const title of [
    "Power of Attorney",
    "PAAA",
    "Escrow Letter",
    "Development Agreement",
    "Letter of Interest",
    "Letter of Intent",
    "Preliminary Consent Letter",
  ])
    await make(
      "TEMPLATE",
      title,
      "Draft",
      null,
      { category: "Legal draft", header: "", footer: "" },
      {
        content:
          "Draft template: " +
          title +
          "\n\nProject: ||PLOT_SOCIETY_NAME||\nLocation: ||SOCIETY_LOCATION||\nCompany: ||COMPANY_NAME||\n\nInsert your approved document text here before use.",
      },
    );
  for (const category of [
    "Work order",
    "Invoice",
    "Terms & conditions",
    "Letterhead",
    "Tender form",
  ])
    await make(
      "TEMPLATE",
      category + " template",
      "Draft",
      null,
      {
        category,
        header: "STALLION · PROJECT MANAGEMENT CONSULTANCY",
        footer: "Mumbai, Maharashtra",
      },
      {
        content:
          "||COMPANY_NAME||\n\n" +
          category +
          "\n\nProject: ||PLOT_SOCIETY_NAME||\nLocation: ||SOCIETY_LOCATION||\n\nInsert approved content here.",
      },
    );
  await make(
    "DOCUMENT",
    "Redevelopment brief",
    "In review",
    projects[0].id,
    { category: "Legal", revision: "1" },
    {
      content:
        "Sample brief. Upload the actual project document to replace this note.",
    },
  );
  await make(
    "FEASIBILITY",
    "KNK preliminary assessment",
    "In review",
    projects[0].id,
    {
      plotArea: 24000,
      fsi: 3,
      saleRate: 26000,
      constructionRate: 6500,
      otherCost: 250000000,
    },
    {
      content:
        "Illustrative inputs. Excludes taxes, financing, rehabilitation and regulatory premiums.",
    },
  );
  await make(
    "MEETING",
    "Monthly society review",
    "Scheduled",
    projects[0].id,
    {
      location: "Society office",
      attendees: "Committee and project team",
      agenda: "Approvals update\nTender evaluation\nNext steps",
      minutes: "",
    },
    { dueDate: new Date("2026-11-08") },
  );
  await make(
    "PROGRESS",
    "Site survey and baseline drawings",
    "Completed",
    projects[0].id,
    { percent: 100, videoUrl: "" },
  );
  await make(
    "PROGRESS",
    "Structural design package",
    "In progress",
    projects[0].id,
    { percent: 65, videoUrl: "" },
  );
  for (const type of ["IOD", "CC", "OC"])
    await make("SCHEME", type + " standard checklist", "Active", null, {
      type,
      scheme: "33(9)",
      documents: "Application\nSupporting drawings\nConsultant certificates",
    });
  await db.audit.create({
    data: {
      organizationId: org.id,
      actor: "Workspace setup",
      action: "created",
      entity: "projects",
      entityId: projects[0].id,
      title: "Sample workspace — demonstration values",
    },
  });
}
console.log(
  demo
    ? "Demo workspace created. Local account is configured in backend/.env."
    : "Empty workspace and owner created.",
);
await db.$disconnect();
