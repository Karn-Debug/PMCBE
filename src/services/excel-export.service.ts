import JSZip from "jszip";

// ExcelJS and other writers emit font properties in different orders. Desktop
// Office validates this sequence in xl/styles.xml, including the default font.
const fontOrder = [
  "b",
  "i",
  "strike",
  "condense",
  "extend",
  "outline",
  "shadow",
  "u",
  "vertAlign",
  "sz",
  "color",
  "name",
  "family",
  "charset",
  "scheme",
];

export async function officeCompatibleXlsx(bytes: Buffer): Promise<Buffer> {
  const archive = await JSZip.loadAsync(bytes);
  const part = archive.file("xl/styles.xml");
  if (!part) return bytes;
  const styles = await part.async("string");
  const normalized = styles.replace(
    /<font>([\s\S]*?)<\/font>/g,
    (original, body: string) => {
      // Only reorder the empty elements emitted by our XLSX writers.
      const elements = [...body.matchAll(/<([\w:]+)\b[^<>]*\/>/g)];
      if (
        elements.map((el) => el[0]).join("") !== body ||
        elements.some((el) => !fontOrder.includes(el[1]))
      )
        return original;
      elements.sort(
        (a, b) => fontOrder.indexOf(a[1]) - fontOrder.indexOf(b[1]),
      );
      return "<font>" + elements.map((el) => el[0]).join("") + "</font>";
    },
  );
  if (normalized === styles) return bytes;
  archive.file("xl/styles.xml", normalized);
  return archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
