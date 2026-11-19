import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { importFeasibilityPdf } from "../src/services/feasibility-pdf.service.js";
import {
  exportSpreadsheet,
  type WorkbookData,
} from "../src/services/atelier-spreadsheet.service.js";

test("PDF pages, typed numbers, text and blank cells survive the JSON and Excel round trip", async (t) => {
  const doc = await PDFDocument.create();
  doc.addPage().drawText("Consultant schedule");
  doc.addPage();
  const pdf = Buffer.from(await doc.save());
  const pages = [
    {
      page: 1,
      status: "readable",
      rows: [
        { kind: "header", cells: ["Particulars", "Value", "Calculation"] },
        { kind: "data", cells: ["Zero", { numeric: "0.00" }, null] },
        { kind: "data", cells: ["Rate", { numeric: "35%" }, "=B1*35%"] },
        {
          kind: "data",
          cells: ["Loss", { numeric: "(₹ 1,23,456.78)" }, "0015"],
        },
      ],
    },
    { page: 2, status: "blank", rows: [] },
  ];
  const original = process.env.OPENAI_API_KEY;
  t.after(() => {
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
  });
  let reply: unknown = { pages };
  let status = "completed",
    code = 200;
  const fetchCall = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const request = JSON.parse(options.body);
    assert.equal(request.store, false);
    assert.equal(request.text.format.strict, true);
    assert.equal(
      request.input[0].content[0].file_data,
      "data:application/pdf;base64," + pdf.toString("base64"),
    );
    return Response.json(
      {
        status,
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(reply) }],
          },
        ],
      },
      { status: code },
    );
  });
  process.env.OPENAI_API_KEY = "";
  await assert.rejects(
    importFeasibilityPdf(pdf, "survey.pdf"),
    /OPENAI_API_KEY/,
  );
  await assert.rejects(
    importFeasibilityPdf(Buffer.from("not a pdf"), "survey.pdf"),
    /valid PDF/,
  );
  assert.equal(fetchCall.mock.callCount(), 0);
  process.env.OPENAI_API_KEY = "mock-test-key";
  const { statement } = await importFeasibilityPdf(pdf, "survey.PDF");
  assert.equal(statement.format, 2);
  const data = JSON.parse(JSON.stringify(statement)) as WorkbookData;
  const excel = new ExcelJS.Workbook();
  await excel.xlsx.load(Uint8Array.from(await exportSpreadsheet(data)).buffer);
  assert.deepEqual(
    excel.worksheets.map((s) => s.name),
    ["Page 1", "Page 2"],
  );
  const s = excel.worksheets[0];
  assert.equal(s.getCell("B2").value, 0);
  assert.equal(s.getCell("C2").value, null);
  assert.equal(s.getCell("B3").value, 0.35);
  assert.equal(s.getCell("B3").numFmt, "0%");
  assert.equal(s.getCell("C3").value, "=B1*35%");
  assert.equal(s.getCell("B4").value, -123456.78);
  assert.equal(s.getCell("C4").value, "0015");
  reply = { pages: [pages[0]] };
  await assert.rejects(importFeasibilityPdf(pdf, "survey.pdf"), /completely/);
  reply = { pages: [pages[0], { page: 2, status: "unreadable", rows: [] }] };
  await assert.rejects(importFeasibilityPdf(pdf, "survey.pdf"), /completely/);
  status = "incomplete";
  await assert.rejects(
    importFeasibilityPdf(pdf, "survey.pdf"),
    /did not finish/,
  );
  code = 429;
  await assert.rejects(importFeasibilityPdf(pdf, "survey.pdf"), /quota/);
});
