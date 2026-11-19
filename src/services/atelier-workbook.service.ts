import { officeCompatibleXlsx } from "./excel-export.service.js";
import ExcelJS from "exceljs";
import yauzl from "yauzl";
import { z } from "zod";
import catalog from "../constants/atelier/studies.json" with { type: "json" };
import { HttpError } from "../utils/http-error.js";

export const layouts = catalog;
export function layoutFor(id: string) {
  const layout = layouts.find((s) => s.id === id);
  if (!layout) throw new HttpError(400, "Select a supported study template.");
  return layout;
}
export type Statement = {
  format: 1;
  studyId: string;
  title: string;
  values: Record<string, number | string | null>;
  basis: Record<string, string>;
  parameters: Record<string, number | null>;
};
const headers = [
  "Field ID",
  "Section",
  "Particulars",
  "Unit",
  "Calculation / Basis",
  "Value",
];
const parameterHeaders = [
  "Parameter ID",
  "Parameter",
  "Unit",
  "Basis",
  "Value",
];
const metaKeys = [
  "Format",
  "Study",
  "Title",
  "Prepared date",
  "Consultant",
  "Review status",
  "Remarks",
];
const review = z.enum(["Pending Review", "Reviewed", "Superseded"]);
export type ReportMeta = {
  preparedDate: string;
  consultant: string;
  status: z.infer<typeof review>;
  remarks: string;
};
const invalid = (message: string) => new HttpError(400, message);
function decorate(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF244573" },
  };
}
export async function writeWorkbook(
  studyId: string,
  title: string,
  statement?: Statement,
  meta?: ReportMeta,
) {
  const layout = layoutFor(studyId);
  const book = new ExcelJS.Workbook();
  book.creator = "Stallion PMC";
  book.views = [
    {
      x: 0,
      y: 0,
      width: 16000,
      height: 9500,
      firstSheet: 0,
      activeTab: 1,
      visibility: "visible",
    },
  ];
  const info = book.addWorksheet("Report");
  info.addRow(["Property", "Value"]);
  const metadata = [
    "PMC Feasibility 1",
    studyId,
    statement?.title ?? title,
    meta?.preparedDate ?? "",
    meta?.consultant ?? "",
    meta?.status ?? "Pending Review",
    meta?.remarks ?? "",
  ];
  metaKeys.forEach((key, i) => info.addRow([key, metadata[i]]));
  decorate(info, [25, 85]);
  const sheet = book.addWorksheet("Statement");
  sheet.addRow(headers);
  for (const f of layout.fields)
    sheet.addRow([
      f.id,
      f.section,
      f.label,
      f.unit,
      statement?.basis[f.id] ?? f.basis,
      statement?.values[f.id] ?? null,
    ]);
  decorate(sheet, [34, 44, 56, 15, 45, 24]);
  if (layout.parameters.length) {
    const params = book.addWorksheet("Parameters");
    params.addRow(parameterHeaders);
    for (const p of layout.parameters)
      params.addRow([
        p.id,
        p.label,
        p.unit,
        p.basis,
        statement?.parameters[p.id] ?? null,
      ]);
    decorate(params, [24, 42, 12, 80, 20]);
  }
  return officeCompatibleXlsx(Buffer.from(await book.xlsx.writeBuffer()));
}
// Bound expanded OOXML before loading the workbook into memory.
export async function inspectArchive(buffer: Buffer) {
  await new Promise<void>((resolve, reject) =>
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(invalid("Choose an .xlsx workbook."));
      let bytes = 0,
        entries = 0;
      zip.on("error", () => reject(invalid("Unreadable Excel workbook.")));
      zip.on("end", resolve);
      zip.on("entry", (entry) => {
        bytes += entry.uncompressedSize;
        if (
          ++entries > 300 ||
          bytes > 16 * 1024 * 1024 ||
          entry.generalPurposeBitFlag & 1
        ) {
          zip.close();
          reject(
            invalid("Workbook exceeds the import limits or is encrypted."),
          );
          return;
        }
        zip.readEntry();
      });
      zip.readEntry();
    }),
  );
}
function checkHeaders(
  sheet: ExcelJS.Worksheet | undefined,
  expected: string[],
  rows: number,
) {
  if (
    !sheet ||
    sheet.rowCount !== rows + 1 ||
    sheet.columnCount !== expected.length ||
    expected.some((v, i) => sheet.getCell(1, i + 1).value !== v)
  )
    throw invalid(
      "The workbook layout has changed. Start with the downloadable template.",
    );
  return sheet;
}
function valueOf(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (
    value &&
    typeof value === "object" &&
    ("formula" in value || "sharedFormula" in value)
  ) {
    if (value.result == null)
      throw invalid(
        "Recalculate and save the workbook in Excel before uploading.",
      );
    return value.result;
  }
  return value;
}
function textCell(cell: ExcelJS.Cell, max = 1000) {
  const v = valueOf(cell);
  if (v == null) return "";
  if (typeof v !== "string" || v.length > max)
    throw invalid(
      "Expected text at " + cell.fullAddress.sheetName + "!" + cell.address,
    );
  return v.trim();
}
function numeric(cell: ExcelJS.Cell) {
  const v = valueOf(cell);
  if (v == null || v === "") return null;
  if (typeof v !== "number" || !Number.isFinite(v))
    throw invalid(
      "Enter a number at " + cell.fullAddress.sheetName + "!" + cell.address,
    );
  return v;
}
export async function readWorkbook(buffer: Buffer) {
  await inspectArchive(buffer);
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(Uint8Array.from(buffer).buffer);
  } catch {
    throw invalid("Excel could not read this workbook.");
  }
  const info = checkHeaders(
    book.getWorksheet("Report"),
    ["Property", "Value"],
    metaKeys.length,
  );
  for (const [i, key] of metaKeys.entries())
    if (info.getCell(i + 2, 1).value !== key)
      throw invalid("Invalid report metadata.");
  if (info.getCell("B2").value !== "PMC Feasibility 1")
    throw invalid("Unknown workbook format.");
  const layout = layoutFor(textCell(info.getCell("B3")));
  if (book.worksheets.length !== (layout.parameters.length ? 3 : 2))
    throw invalid("Unexpected worksheet. Use the downloaded template.");
  const statement: Statement = {
    format: 1,
    studyId: layout.id,
    title: z
      .string()
      .min(1)
      .max(250)
      .parse(textCell(info.getCell("B4"))),
    values: {},
    basis: {},
    parameters: {},
  };
  const rawDate = valueOf(info.getCell("B5"));
  const date =
    rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : rawDate;
  const meta: ReportMeta = {
    preparedDate: z.iso
      .date()
      .parse(date || new Date().toISOString().slice(0, 10)),
    consultant: textCell(info.getCell("B6"), 200),
    status: review.parse(textCell(info.getCell("B7"))),
    remarks: textCell(info.getCell("B8"), 8000),
  };
  const sheet = checkHeaders(
    book.getWorksheet("Statement"),
    headers,
    layout.fields.length,
  );
  const seen = new Set<string>();
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i),
      id = textCell(row.getCell(1)),
      f = layout.fields.find((field) => field.id === id);
    if (
      !f ||
      seen.has(id) ||
      [f.section, f.label, f.unit].some(
        (s, j) => s !== textCell(row.getCell(j + 2)),
      )
    )
      throw invalid(
        "Invalid or duplicate field at Statement row " +
          i +
          ". Keep the template labels and units.",
      );
    seen.add(id);
    statement.values[id] = f.text
      ? textCell(row.getCell(6)) || null
      : numeric(row.getCell(6));
    statement.basis[id] = textCell(row.getCell(5));
  }
  if (layout.parameters.length) {
    const params = checkHeaders(
      book.getWorksheet("Parameters"),
      parameterHeaders,
      layout.parameters.length,
    );
    for (let i = 2; i <= params.rowCount; i++) {
      const row = params.getRow(i),
        id = textCell(row.getCell(1)),
        p = layout.parameters.find((field) => field.id === id);
      if (
        !p ||
        Object.hasOwn(statement.parameters, id) ||
        [p.label, p.unit, p.basis].some(
          (s, j) => s !== textCell(row.getCell(j + 2)),
        )
      )
        throw invalid("Invalid parameter at row " + i + ".");
      const value = numeric(row.getCell(5));
      if (
        value !== null &&
        (value < p.min || (p.max !== undefined && value > p.max))
      )
        throw invalid("Parameter out of range: " + p.label);
      statement.parameters[id] = value;
    }
  }
  return { statement, meta };
}
