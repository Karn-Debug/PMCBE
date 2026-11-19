import { officeCompatibleXlsx } from "./excel-export.service.js";
import { z } from "zod";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { HttpError } from "../utils/http-error.js";
import {
  inspectArchive,
  readWorkbook,
  type Statement,
  type ReportMeta,
} from "./atelier-workbook.service.js";
import type { Prisma } from "../generated/prisma/client.js";

type Cell = {
  t: XLSX.ExcelDataType;
  v?: string | number | boolean;
  w?: string;
  z?: string;
  f?: string;
  F?: string;
  style?: number;
};
type Sheet = {
  name: string;
  hidden: number;
  range: string;
  defaultRowHeight?: number;
  defaultColWidth?: number;
  cells: Record<string, Cell>;
  merges: XLSX.Range[];
  columns: Record<string, { wch?: number; hidden?: boolean }>;
  rows: Record<string, { hpt?: number; hidden?: boolean }>;
};
export type WorkbookData = {
  format: 2;
  title: string;
  sheets: Sheet[];
  date1904: boolean;
  styles: Partial<ExcelJS.Style>[];
  names: XLSX.DefinedName[];
};
export type StoredStatement =
  WorkbookData | (Statement & { workbook?: WorkbookData });
const unsupported = () =>
  new HttpError(
    400,
    "Choose an unencrypted Excel workbook (.xlsx, .xlsm, .xlsb or .xls).",
  );
const limit = () =>
  new HttpError(
    400,
    "Workbook exceeds the local limit of 64 sheets, 100,000 cells or 16 MB of expanded content.",
  );

function dimensions<T, U>(
  items: (T | undefined)[] | undefined,
  convert: (v: T) => U,
) {
  const result: Record<string, U> = {};
  for (const [key, value] of Object.entries(items ?? []))
    if (value) result[key] = convert(value);
  return result;
}
export async function importSpreadsheet(bytes: Buffer, filename: string) {
  if (bytes.length < 8 || !/\.(xlsx|xlsm|xlsb|xls)$/i.test(filename))
    throw unsupported();
  const zipped = bytes.readUInt32BE(0) === 0x504b0304;
  const legacy =
    bytes.subarray(0, 8).toString("hex") === "d0cf11e0a1b11ae1" ||
    (bytes[0] === 9 && [0, 2, 4, 8].includes(bytes[1]));
  const xml = bytes
    .subarray(0, 2048)
    .toString("utf8")
    .includes("urn:schemas-microsoft-com:office:spreadsheet");
  if (!zipped && !legacy && !xml) throw unsupported();
  if (zipped) await inspectArchive(bytes);
  let source: XLSX.WorkBook;
  try {
    source = XLSX.read(bytes, {
      type: "buffer",
      cellStyles: true,
      cellNF: true,
      cellHTML: false,
      cellDates: false,
      bookVBA: false,
    });
  } catch {
    throw unsupported();
  }
  if (!source.SheetNames?.length) throw unsupported();
  if (source.SheetNames.length > 64) throw limit();
  let count = 0,
    mergedArea = 0,
    mergeCount = 0;
  const sheets: Sheet[] = source.SheetNames.map((name, i) => {
    const ws = source.Sheets[name];
    const sheet: Sheet = {
      name,
      hidden: source.Workbook?.Sheets?.[i]?.Hidden ?? 0,
      range: ws["!ref"] ?? "A1",
      cells: {},
      merges: ws["!merges"] ?? [],
      columns: dimensions(ws["!cols"], (v) => ({
        wch: v.wch,
        hidden: v.hidden,
      })),
      rows: dimensions(ws["!rows"], (v) => ({ hpt: v.hpt, hidden: v.hidden })),
    };
    for (const m of sheet.merges) {
      mergedArea += (1 + m.e.r - m.s.r) * (1 + m.e.c - m.s.c);
      if (++mergeCount > 2000 || mergedArea > 180000) throw limit();
    }
    for (const [address, cell] of Object.entries(ws)) {
      if (!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(address)) continue;
      if (++count > 100000) throw limit();
      const { t, v, f, F, w, z } = cell as XLSX.CellObject;
      const uncached = t === "z" && !!f;
      sheet.cells[address] = {
        t: uncached ? "n" : t,
        v: uncached ? undefined : (v as Cell["v"]),
        f,
        F,
        w: w ?? (f ? "=" + f : ""),
        z: typeof z === "string" ? z : undefined,
      };
    }
    return sheet;
  });
  if (
    !sheets.some((sheet) =>
      Object.values(sheet.cells).some(
        (c) => c.f || (c.v != null && c.v !== ""),
      ),
    )
  )
    throw new HttpError(
      400,
      "Enter at least one worksheet value before uploading.",
    );
  const workbook: WorkbookData = {
    format: 2,
    title: filename.replace(/\.[^.]+$/, ""),
    sheets,
    styles: [],
    date1904: !!source.Workbook?.WBProps?.date1904,
    names: source.Workbook?.Names ?? [],
  };
  // ExcelJS exposes cell fonts, borders and alignment for XML workbooks.
  if (zipped && /\.xls[xm]$/i.test(filename)) {
    const styled = new ExcelJS.Workbook();
    let styledLoaded = false;
    try {
      await styled.xlsx.load(Uint8Array.from(bytes).buffer);
      styledLoaded = true;
    } catch {
      /* The parsed worksheet data still supports nonstandard Excel producers. */
    }
    if (styledLoaded) {
      const ids = new Map<string, number>();
      for (const sheet of sheets) {
        const ws = styled.getWorksheet(sheet.name);
        if (!ws) continue;
        sheet.defaultRowHeight = ws.properties.defaultRowHeight;
        sheet.defaultColWidth = ws.properties.defaultColWidth;
        for (const [address, data] of Object.entries(sheet.cells)) {
          const cell = ws.getCell(address);
          if (!Object.keys(cell.style).length) continue;
          const key = JSON.stringify(cell.style);
          if (!ids.has(key)) {
            ids.set(key, workbook.styles.length);
            workbook.styles.push(cell.style);
          }
          data.style = ids.get(key);
        }
      }
    }
  }
  let statement: StoredStatement = workbook;
  let meta: ReportMeta = {
    preparedDate: new Date().toISOString().slice(0, 10),
    consultant: "",
    remarks: "",
    status: "Pending Review",
  };
  if (
    source.Sheets.Report?.B2?.v === "PMC Feasibility 1" &&
    /\.xlsx$/i.test(filename)
  ) {
    try {
      const mapped = await readWorkbook(bytes);
      statement = { ...mapped.statement, workbook };
      meta = mapped.meta;
    } catch (e) {
      if (!(e instanceof HttpError) && !(e instanceof z.ZodError)) throw e;
      // User-defined layouts still retain all of their original worksheets.
    }
  }
  const json = JSON.stringify(statement);
  if (Buffer.byteLength(json) > 16 * 1024 * 1024) throw limit();
  return { statement: JSON.parse(json) as Prisma.InputJsonObject, meta };
}
export async function exportSpreadsheet(data: WorkbookData, meta?: ReportMeta) {
  const output = XLSX.utils.book_new();
  output.Workbook = {
    WBProps: { date1904: data.date1904 },
    Sheets: [],
    Names: data.names,
  };
  for (const sheet of data.sheets) {
    const ws: XLSX.WorkSheet = {
      "!ref": sheet.range,
      "!merges": sheet.merges,
      "!cols": [],
      "!rows": [],
    };
    for (const [address, cell] of Object.entries(sheet.cells)) {
      const { style, w, ...stored } = cell;
      ws[address] = stored;
    }
    for (const [i, c] of Object.entries(sheet.columns))
      ws["!cols"]![Number(i)] = c;
    for (const [i, r] of Object.entries(sheet.rows))
      ws["!rows"]![Number(i)] = r;
    if (meta && sheet.name === "Report") ws.B8 = { t: "s", v: meta.remarks };
    XLSX.utils.book_append_sheet(output, ws, sheet.name);
    output.Workbook.Sheets!.push({
      name: sheet.name,
      Hidden: sheet.hidden as 0 | 1 | 2,
    });
  }
  const bytes = XLSX.write(output, {
    type: "buffer",
    bookType: "xlsx",
    cellStyles: true,
    compression: true,
  }) as Buffer;
  if (!data.styles.length) return officeCompatibleXlsx(bytes);
  const styled = new ExcelJS.Workbook();
  await styled.xlsx.load(Uint8Array.from(bytes).buffer);
  for (const sheet of data.sheets) {
    const ws = styled.getWorksheet(sheet.name)!;
    ws.properties.defaultRowHeight = sheet.defaultRowHeight || 15;
    if (sheet.defaultColWidth)
      ws.properties.defaultColWidth = sheet.defaultColWidth;
    for (const [address, cell] of Object.entries(sheet.cells)) {
      if (cell.style !== undefined)
        ws.getCell(address).style = data.styles[cell.style];
    }
  }
  return officeCompatibleXlsx(Buffer.from(await styled.xlsx.writeBuffer()));
}
