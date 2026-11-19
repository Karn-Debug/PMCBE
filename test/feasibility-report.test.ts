import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  importSpreadsheet,
  type WorkbookData,
} from "../src/services/atelier-spreadsheet.service.js";
import { buildFeasibilityReport } from "../src/services/feasibility-report.service.js";
import { prepareReadingView } from "../src/services/feasibility-reading-view.js";

test("a tenant register keeps entered zeroes, source errors and later records while removing unused formula rows", async () => {
  const doc = new ExcelJS.Workbook(),
    sheet = doc.addWorksheet("Register");
  sheet.addRows([
    ["Sr. No.", "R/NR", "Existing CA (sq.ft.)", "Rehab BUA"],
    ["1)", "R", 20, 24],
    ["2)", null, null, { formula: "0/0", result: { error: "#DIV/0!" } }],
    ["3)", null, 0, { formula: "0/0", result: { error: "#DIV/0!" } }],
    ["4)", "NR", 10, 12],
  ]);
  const parsed = await importSpreadsheet(
    Buffer.from(await doc.xlsx.writeBuffer()),
    "register.xlsx",
  );
  const original = {
    version: 1 as const,
    title: "Study",
    notes: [],
    sections: [
      {
        sourceSheet: "Register",
        title: "Tenant schedule",
        cost: false,
        labelHeading: "Sr. No.",
        columns: ["R/NR", "Rehab BUA"],
        rows: [],
      },
    ],
  };
  const result = prepareReadingView(
    parsed.statement as unknown as WorkbookData,
    original,
  );
  const register = result.sections[0];
  assert.deepEqual(
    register.rows.map((r) => r.label),
    ["1)", "3)", "4)"],
  );
  assert.equal(register.templateRows, 1);
  assert.deepEqual(register.rows[1].values, ["", "0", "#DIV/0!"]);
  assert.equal(
    prepareReadingView(parsed.statement as unknown as WorkbookData, result),
    result,
  );
  assert.equal(original.sections[0].rows.length, 0);
});

test("a structured AI layout uses actual cells across sheets and preserves unmapped entries", async (t) => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "fixture";
  t.after(() => {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  });
  const doc = new ExcelJS.Workbook();
  const printed = doc.addWorksheet("Land");
  printed.addRows([
    ["Area statement"],
    ["F.P. 12"],
    ["No.", "Particulars", "Value", "Basis"],
    ["1", "Plot", 0, "Survey"],
    ["No.", "Particulars", "Value", "Basis"],
    ["2", "Retained area", 2.5, "Plan"],
    ["COST SHEET"],
    ["1", "Fee", 150],
    ["Sale realization"],
    ["3", "Gross profit", 30],
    ["DISCLAIMER", "Survey pending."],
  ]);
  const matrix = doc.addWorksheet("Options");
  matrix.addRows([
    ["Option", "East", "West"],
    ["Houses", 4, 8],
    ["State", "Approved", "Pending"],
    [],
    ["Check on site", 47],
  ]);
  const hidden = doc.addWorksheet("Internal");
  hidden.state = "hidden";
  hidden.addRow(["Hidden draft"]);
  const { statement } = await importSpreadsheet(
    Buffer.from(await doc.xlsx.writeBuffer()),
    "report.xlsx",
  );
  const layout = {
    title: "Redevelopment appraisal",
    sheets: [
      { sheet: 1, headings: [], notes: [], sections: [] },
      {
        sheet: 2,
        headings: ["A1", "A2", "A3", "B2"],
        notes: ["A5"],
        sections: [
          {
            title: "Options",
            financial: false,
            across: true,
            first: 2,
            last: 3,
            label: 1,
            labelHeading: "Option",
            columns: [
              { index: 1, title: "Option" },
              { index: 2, title: "Houses" },
              { index: 3, title: "State" },
            ],
            basis: null,
            numbering: null,
            totals: [],
            highlights: [3],
            results: [],
          },
        ],
      },
    ],
  };
  t.mock.method(globalThis, "fetch", async (_url, opts) => {
    const body = JSON.parse(String(opts.body));
    assert.equal(body.text.format.name, "feasibility_layout");
    assert.equal(body.text.format.strict, true);
    assert.doesNotMatch(body.input[0].content[0].text, /Hidden draft/);
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(layout) }],
        },
      ],
    });
  });
  const report = await buildFeasibilityReport(
    statement as unknown as WorkbookData,
  );
  assert.deepEqual(
    report.sections.map((s) => [s.title, s.rows.length]),
    [
      ["F.P. 12", 2],
      ["COST SHEET", 3],
      ["Options", 2],
      ["Options · Additional entries", 1],
    ],
  );
  assert.equal(report.sections[0].rows[0].values[0], "0");
  assert.equal(report.sections[0].rows[0].basis, "Survey");
  assert.equal(report.sections[1].cost, true);
  assert.equal(report.sections[1].rows[1].label, "Sale realization");
  assert.deepEqual(report.sections[1].rows[1].values, [""]);
  assert.deepEqual(report.sections[2].columns, ["Houses", "State"]);
  assert.deepEqual(report.sections[2].rows[1], {
    label: "West",
    values: ["8", "Pending"],
    basis: "",
    tone: "highlight",
  });
  assert.equal(report.sections[2].rows[0].values[0], "4");
  assert.equal(report.sections[3].rows[0].values[0], "47");
  assert.deepEqual(report.notes, [
    "DISCLAIMER",
    "Survey pending.",
    "Check on site",
  ]);
});
