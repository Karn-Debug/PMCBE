import JSZip from "jszip";
import { writeWorkbook } from "../src/services/atelier-workbook.service.js";
import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import {
  exportSpreadsheet,
  importSpreadsheet,
  type WorkbookData,
} from "../src/services/atelier-spreadsheet.service.js";

for (const bookType of ["xlsx", "xlsm", "xlsb", "biff8", "biff5"] as const) {
  test(
    "Custom " + bookType + " worksheets survive storage and XLSX export",
    async () => {
      const book = XLSX.utils.book_new();
      const layout = XLSX.utils.aoa_to_sheet([
        [],
        ["", "Consultant layout"],
        [],
        ["", "Area", 0],
        ["", "Margin", -12.25],
      ]);
      layout["!merges"] = [XLSX.utils.decode_range("B2:D2")];
      XLSX.utils.book_append_sheet(book, layout, "Summary");
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.aoa_to_sheet([
          ["Location", "Occupied"],
          ["Mahim", true],
        ]),
        "Survey",
      );
      const bytes = XLSX.write(book, { bookType, type: "buffer" });
      const extension = bookType.startsWith("biff") ? "xls" : bookType;
      const { statement } = await importSpreadsheet(
        bytes,
        "Custom." + extension,
      );
      assert.equal(statement.format, 2);
      const stored = JSON.parse(JSON.stringify(statement)) as WorkbookData;
      const exported = XLSX.read(await exportSpreadsheet(stored), {
        type: "buffer",
      });
      assert.deepEqual(exported.SheetNames, book.SheetNames);
      assert.equal(exported.Sheets.Summary.C4.v, 0);
      assert.equal(exported.Sheets.Summary.C5.v, -12.25);
      assert.equal(exported.Sheets.Survey.B2.v, true);
    },
  );
}
test("An invalid renamed text file cannot create a workbook revision", async () => {
  await assert.rejects(
    importSpreadsheet(Buffer.from("not a workbook"), "Report.xlsx"),
    /Excel workbook/,
  );
});

test("Custom XLSX preserves styled blank cells, computed zero and formulas awaiting calculation", async () => {
  const source = new ExcelJS.Workbook(),
    sheet = source.addWorksheet("Formulas");
  sheet.getCell("A1").value = { formula: "1+1" };
  sheet.getCell("A2").value = { formula: "1-1", result: 0 };
  sheet.getCell("B5").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF123456" },
  };
  const { statement } = await importSpreadsheet(
    Buffer.from(await source.xlsx.writeBuffer()),
    "Formula.xlsx",
  );
  const saved = JSON.parse(JSON.stringify(statement)) as WorkbookData;
  const exported = new ExcelJS.Workbook();
  await exported.xlsx.load(
    Uint8Array.from(await exportSpreadsheet(saved)).buffer,
  );
  const copy = exported.getWorksheet("Formulas")!;
  assert.equal(copy.getCell("A1").formula, "1+1");
  assert.equal(copy.getCell("A1").result, undefined);
  assert.equal(copy.getCell("A2").result, 0);
  assert.deepEqual(copy.getCell("B5").fill, sheet.getCell("B5").fill);
});

test("Desktop Excel exports keep the font schema order and a valid worksheet default height", async () => {
  const source = new ExcelJS.Workbook(),
    sheet = source.addWorksheet("Report layout");
  sheet.properties.defaultRowHeight = 13.2;
  sheet.getCell("A1").value = "Area";
  sheet.getCell("A1").font = {
    bold: true,
    size: 11,
    name: "Calibri",
    family: 2,
    scheme: "minor",
    color: { theme: 1 },
  };
  const { statement } = await importSpreadsheet(
    Buffer.from(await source.xlsx.writeBuffer()),
    "Working.xlsx",
  );
  const custom = await exportSpreadsheet(
    JSON.parse(JSON.stringify(statement)) as WorkbookData,
  );
  const sample = await writeWorkbook("mahim-fp37", "Sample");
  for (const [bytes, height] of [
    [sample, 15],
    [custom, 13.2],
  ] as const) {
    const zip = await JSZip.loadAsync(bytes);
    const styles = await zip.file("xl/styles.xml")!.async("string");
    assert.match(
      styles,
      /<font><sz val="11"\/><color theme="1"\/><name val="Calibri"\/><family val="2"\/><scheme val="minor"\/><\/font>/,
    );
    const worksheet = await zip
      .file("xl/worksheets/sheet1.xml")!
      .async("string");
    assert.ok(worksheet.includes('defaultRowHeight="' + height + '"'));
  }
});
