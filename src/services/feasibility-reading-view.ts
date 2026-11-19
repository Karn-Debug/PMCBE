import * as XLSX from "xlsx";
import type { WorkbookData } from "./atelier-spreadsheet.service.js";
import type {
  FeasibilityReport,
  ReportSection,
} from "./feasibility-report.service.js";

type Sheet = WorkbookData["sheets"][number];
type Entry = {
  address: string;
  row: number;
  col: number;
  text: string;
  formula: boolean;
  type: string;
  value: unknown;
};
type Lines = Map<number, Entry[]>;
const clean = (value: string) => value.trim().replace(/\s+/g, " ");
const serial = /^\d+(?:[.)]|\([a-z\d]+\))?$/i;
const typeHeader = /^(?:r\s*\/\s*nr|residential\s*\/\s*non[- ]?residential)$/i;
const serialHeader = /^(?:sr\.?\s*no\.?|serial (?:no\.?|number))$/i;

function linesFor(sheet: Sheet): Lines {
  const lines: Lines = new Map();
  for (const [address, c] of Object.entries(sheet.cells)) {
    const { r, c: col } = XLSX.utils.decode_cell(address);
    if (sheet.rows[r]?.hidden || sheet.columns[col]?.hidden) continue;
    const text = c.w || (c.v != null ? String(c.v) : c.f ? "=" + c.f : "");
    if (!text.trim()) continue;
    const row = r + 1,
      line = lines.get(row) ?? [];
    line.push({
      address,
      row,
      col,
      text: clean(text),
      formula: !!c.f,
      type: c.t,
      value: c.v,
    });
    lines.set(row, line);
  }
  for (const line of lines.values()) line.sort((a, b) => a.col - b.col);
  return new Map([...lines].sort(([a], [b]) => a - b));
}

function tenantHeader(line: Entry[]) {
  return (
    line.some((c) => serialHeader.test(c.text)) &&
    line.some((c) => typeHeader.test(c.text)) &&
    line.some((c) => /existing (?:ca|carpet area)/i.test(c.text)) &&
    line.some((c) => /rehab.*bua/i.test(c.text))
  );
}

function hasTypeHeader(sheet: Sheet) {
  return Object.values(sheet.cells).some((c) =>
    typeHeader.test(clean(String(c.w ?? c.v ?? ""))),
  );
}

function isUnusedSlot(line: Entry[], ref: Entry) {
  return line.every(
    (c) =>
      c === ref ||
      (c.formula && (c.value === 0 || c.text === "#DIV/0!" || c.value === "")),
  );
}

export function unusedTenantRows(sheet: Sheet): Set<number> {
  const empty = new Set<number>();
  if (!hasTypeHeader(sheet)) return empty;
  const lines = linesFor(sheet),
    head = [...lines.values()].slice(0, 10).find(tenantHeader);
  const id = head?.find((c) => serialHeader.test(c.text));
  if (!id) return empty;
  for (const [n, line] of lines) {
    const ref = line.find((c) => c.col === id.col);
    if (
      n > id.row &&
      ref &&
      /^\d+[.)]?$/.test(ref.text) &&
      isUnusedSlot(line, ref)
    )
      empty.add(n);
  }
  return empty;
}

function tenantSections(sheet: Sheet, lines: Lines, header: Entry[]) {
  const id = header.find((c) => serialHeader.test(c.text))!,
    type = header.find((c) => typeHeader.test(c.text))!;
  const fields = header.filter((c) => c !== id);
  const preferred = [
    type,
    fields.find((c) => /existing (ca|carpet area).*sq\.?\s*ft/i.test(c.text)),
    fields.find((c) => /^rehab\w*\s+bua$/i.test(c.text)),
    fields.find((c) => /rehab.*bua.*to be given/i.test(c.text)),
  ];
  const main: ReportSection = {
    title: "Tenant rehabilitation",
    labelHeading: id.text,
    cost: false,
    columns: fields.map((c) => (c === type ? "Type" : c.text)),
    rows: [],
    summaryColumns: preferred.flatMap((c) => (c ? [fields.indexOf(c)] : [])),
    sourceSheet: sheet.name,
  };
  const totals: ReportSection = {
    ...main,
    title: "Tenant area totals",
    labelHeading: "Category",
    columns: fields.map((c) => (c === type ? "Entries" : c.text)),
    rows: [],
  };
  const unmapped: ReportSection = {
    title: sheet.name + " · Additional entries",
    cost: false,
    labelHeading: "Cell",
    columns: ["Source value"],
    rows: [],
    sourceSheet: sheet.name,
  };
  const categories: Record<string, string> = {
    R: "Residential (R)",
    NR: "Non-residential (NR)",
    TOTAL: "Total",
  };
  let hiddenTemplates = 0;
  for (const [r, line] of lines) {
    if (r < header[0].row) {
      for (const c of line.filter((c) => !serialHeader.test(c.text)))
        unmapped.rows.push({ label: c.address, values: [c.text], basis: "" });
      continue;
    }
    if (r === header[0].row) continue;
    const cell = (col: number) => line.find((c) => c.col === col);
    const ref = cell(id.col),
      kind = cell(type.col);
    const category = line.find(
      (c) => c.col < type.col && /^(R|NR|total)$/i.test(c.text),
    );
    const numbered = ref && /^\d+[.)]?$/.test(ref.text);
    const values = fields.map((f) => cell(f.col)?.text ?? "");
    let label: string | undefined;
    if (numbered) {
      // A blank input row can contain prefilled zeroes and divide-by-zero formulas.
      // A typed zero, uncached formula or other error is still a meaningful record.
      if (isUnusedSlot(line, ref)) {
        hiddenTemplates++;
        continue;
      }
      if (kind && /^(R|NR)$/i.test(kind.text))
        values[fields.indexOf(type)] = categories[kind.text.toUpperCase()];
      main.rows.push({ label: ref.text, values, basis: "" });
    } else {
      if (category) label = categories[category.text.toUpperCase()];
      else if (
        !totals.rows.length &&
        kind?.formula &&
        kind.type === "n" &&
        line.every((c) => c.formula)
      )
        label = "Register total";
      if (label)
        totals.rows.push({
          label,
          values,
          basis: "",
          ...(/total/i.test(label) ? { tone: "total" as const } : {}),
        });
    }
    for (const c of line) {
      if (
        (numbered || label) &&
        (c === ref || c === category || fields.some((f) => f.col === c.col))
      )
        continue;
      unmapped.rows.push({ label: c.address, values: [c.text], basis: "" });
    }
  }
  if (hiddenTemplates) main.templateRows = hiddenTemplates;
  return [main, totals, unmapped].filter((s) => s.rows.length || s === main);
}

const descriptive = (e: Entry) =>
  e.type === "s" &&
  /\p{L}/u.test(e.text) &&
  !serial.test(e.text) &&
  !/^(?:[A-Z]{1,2}|sq\.?\s*(ft|mt)\.?|sft\.?|months|nos\.?)$/i.test(e.text);
function supporting(
  section: ReportSection,
  lines: Lines,
  ordinary: ReportSection[],
  sheetName: string,
): ReportSection | undefined {
  const cellsByRow = new Map<number, Entry[]>();
  const labelIndex = new Map<string, ReportSection["rows"]>();
  for (const s of ordinary)
    for (const row of s.rows) {
      const key = clean(row.label);
      const matches = labelIndex.get(key) ?? [];
      matches.push(row);
      labelIndex.set(key, matches);
    }
  const rows: ReportSection["rows"] = [];
  for (const r of section.rows) {
    const match = /^[A-Z]+([1-9]\d*)$/.exec(r.label);
    const n = match ? Number(match[1]) : 0,
      entry = lines.get(n)?.find((c) => c.address === r.label);
    if (!entry) {
      rows.push({ ...r, values: [r.values.join(" "), r.label] });
      continue;
    }
    const group = cellsByRow.get(n) ?? [];
    group.push(entry);
    cellsByRow.set(n, group);
  }
  let noteSlots = false;
  for (const [n, line] of lines) {
    if (line.length === 1 && /^notes?\s*:?$/i.test(line[0].text)) {
      noteSlots = true;
      continue;
    }
    if (noteSlots && line.length === 1 && /^\d+[.)]?$/.test(line[0].text))
      continue;
    noteSlots = false;
    const extra = cellsByRow.get(n);
    if (!extra) continue;
    const first = line[0],
      name =
        line.find((c) => labelIndex.has(c.text) && !serial.test(c.text)) ??
        line.find(descriptive);
    // Keep the printed item reference beside the matching item, including numbered items with a blank description.
    const match = name && labelIndex.get(name.text);
    const target =
      match?.length === 1 ? match[0] : labelIndex.get("Row " + n)?.[0];
    let entries = extra;
    if (target && extra.includes(first) && serial.test(first.text)) {
      if (target.label === "Row " + n) target.label = first.text;
      else target.reference = first.text;
      entries = entries.filter((e) => e !== first);
    }
    if (!entries.length) continue;
    entries = entries.filter((e) => {
      const below = lines
        .get(n + 1)
        ?.find((c) => c.col === e.col && /^LR\s*\/\s*RC$/i.test(c.text));
      if (!below || e.type !== "n") return true;
      rows.push({ label: below.text, values: [e.text, e.address], basis: "" });
      return false;
    });
    if (!entries.length) continue;
    let label = name?.text;
    const date =
      entries.length === 1 &&
      /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(entries[0].text);
    if (date) label = "Date";
    const values = entries.filter((e) => e !== name);
    // An unassigned caption sometimes has its value in an already mapped column of the same row.
    const adjacent =
      name && line.find((c) => c.col > name.col && c.type === "n");
    if (!values.length && adjacent) values.push(adjacent);
    if (!label && entries.length === 1) {
      const e = entries[0],
        neighbor = lines
          .get(n + 1)
          ?.find((c) => c.col === e.col && descriptive(c));
      if (neighbor && /^(?:LR\s*\/\s*RC|ASR\b)/i.test(neighbor.text))
        label = neighbor.text;
    }
    const captionOnly =
      !values.length && entries.length === 1 && entries[0] === name;
    rows.push({
      label: captionOnly ? "Note" : label || "Worksheet row " + n,
      values: [
        values.map((e) => e.text).join(" · ") ||
          entries.map((e) => e.text).join(" · "),
        entries.map((e) => e.address).join(", "),
      ],
      basis: "",
    });
  }
  return rows.length
    ? {
        title: sheetName + " · Supporting details",
        labelHeading: "Item",
        columns: ["Value or note", "Source cells"],
        rows,
        cost: false,
        supporting: true,
        sourceSheet: sheetName,
      }
    : undefined;
}

export function prepareReadingView(
  book: WorkbookData,
  stored: FeasibilityReport,
): FeasibilityReport {
  if (stored.readingView === 2) return stored;
  const hasRegister = book.sheets.some(
    (s) =>
      !s.hidden &&
      hasTypeHeader(s) &&
      [...linesFor(s).values()].slice(0, 10).some(tenantHeader),
  );
  if (!hasRegister) return stored;
  const report = {
    ...stored,
    sections: structuredClone(stored.sections),
    readingView: 2 as const,
  };
  for (const sheet of book.sheets) {
    if (sheet.hidden) continue;
    const fallbackTitle = sheet.name + " · Additional entries";
    const fallback = report.sections.find(
      (s) =>
        s.title === fallbackTitle ||
        (s.title === sheet.name &&
          s.labelHeading === "Cell" &&
          s.columns[0] === "Source value"),
    );
    const lines = linesFor(sheet);
    const header = [...lines.values()].slice(0, 10).find(tenantHeader);
    if (header) {
      const belongs = (s: ReportSection) =>
        s.sourceSheet === sheet.name ||
        s === fallback ||
        (!s.sourceSheet &&
          s.columns.some((c) => typeHeader.test(c)) &&
          s.columns.some((c) => /rehab.*bua/i.test(c)) &&
          (fallback
            ? report.sections.indexOf(s) ===
              report.sections.indexOf(fallback) - 1
            : /tenant/i.test(s.title)));
      const first = report.sections.findIndex(belongs);
      if (first >= 0) {
        const register = tenantSections(sheet, lines, header);
        const tail = register.find((s) => s.labelHeading === "Cell");
        const details = tail && supporting(tail, lines, [], sheet.name);
        const keep = report.sections.filter((s) => !belongs(s));
        keep.splice(
          first,
          0,
          ...register.filter((s) => s !== tail),
          ...(details ? [details] : []),
        );
        report.sections = keep;
        continue;
      }
    }
    if (!fallback) continue;
    const pos = report.sections.indexOf(fallback);
    let start = pos;
    while (
      start > 0 &&
      !report.sections[start - 1].supporting &&
      !report.sections[start - 1].sourceSheet
    )
      start--;
    const ordinary = report.sections
      .slice(0, pos)
      .filter(
        (s, i) =>
          s.sourceSheet === sheet.name || (!s.sourceSheet && i >= start),
      );
    const details = supporting(fallback, lines, ordinary, sheet.name);
    report.sections.splice(pos, 1, ...(details ? [details] : []));
  }
  return report;
}
