import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  MAX_XLSX_COMPRESSION_RATIO,
  MAX_ZIP_ENTRIES,
  TabularParseError,
  parseDelimitedTable,
  parseTabularFile,
  type TabularParseErrorCode
} from "../src/lib/tabularParsing";

function expectParseError(action: () => unknown, code: TabularParseErrorCode, detail?: Record<string, unknown>) {
  try {
    action();
    throw new Error("expectedTabularParseError");
  } catch (error) {
    expect(error).toBeInstanceOf(TabularParseError);
    expect((error as TabularParseError).code).toBe(code);
    if (detail) expect((error as TabularParseError).detail).toMatchObject(detail);
  }
}

async function expectAsyncParseError(
  action: () => Promise<unknown>,
  code: TabularParseErrorCode,
  detail?: Record<string, unknown>
) {
  try {
    await action();
    throw new Error("expectedTabularParseError");
  } catch (error) {
    expect(error).toBeInstanceOf(TabularParseError);
    expect((error as TabularParseError).code).toBe(code);
    if (detail) expect((error as TabularParseError).detail).toMatchObject(detail);
  }
}

describe("parseDelimitedTable", () => {
  it("parses raw headers and dot-decimal numeric cells without domain interpretation", () => {
    expect(parseDelimitedTable("Rate,Capacity\n0.1,325")).toEqual([
      ["Rate", "Capacity"],
      [0.1, 325]
    ]);
  });

  it("handles quoted delimiters, escaped quotes, and embedded newlines", () => {
    expect(parseDelimitedTable('Rate,"Capacity, specific",Note\n0.1,325,"first\ncycle"\n1,240,"said ""ok"""')).toEqual([
      ["Rate", "Capacity, specific", "Note"],
      [0.1, 325, "first\ncycle"],
      [1, 240, 'said "ok"']
    ]);
  });

  it("rejects inconsistent row widths with the stable parse error detail", () => {
    expectParseError(
      () => parseDelimitedTable("Rate,Capacity\n0.1\n1,240"),
      "malformedFile",
      { reason: "rowWidth", row: 2, expected: 2, actual: 1 }
    );
  });

  it("rejects oversized text before attempting tabular structure parsing", () => {
    expectParseError(
      () => parseDelimitedTable(`"${"x".repeat(MAX_FILE_BYTES)}`),
      "resourceLimitExceeded",
      { resource: "fileBytes", limit: MAX_FILE_BYTES }
    );
  });
});

describe("parseTabularFile", () => {
  it("decodes UTF-16 TXT and returns a single raw sheet", async () => {
    const file = new File([encodeUtf16("Rate\tCapacity\n0.1\t325", "le")], "rate.txt");

    await expect(parseTabularFile(file)).resolves.toEqual([{
      name: "rate.txt",
      rows: [["Rate", "Capacity"], [0.1, 325]]
    }]);
  });

  it("reads every XLSX sheet as raw normalized cells", async () => {
    const file = makeXlsxFile([
      { name: "Rate data", rows: [["Rate", "Capacity"], [1, 240]] },
      { name: "Notes", rows: [["ready", true]] }
    ]);

    await expect(parseTabularFile(file)).resolves.toEqual([
      { name: "Rate data", rows: [["Rate", "Capacity"], [1, 240]] },
      { name: "Notes", rows: [["ready", "true"]] }
    ]);
  });

  it("preserves file-size and ZIP archive resource-limit errors", async () => {
    const oversized = new File(["Rate,Capacity\n1,240"], "large.csv");
    Object.defineProperty(oversized, "size", { value: MAX_FILE_BYTES + 1 });
    await expectAsyncParseError(
      () => parseTabularFile(oversized),
      "resourceLimitExceeded",
      { resource: "fileBytes", limit: MAX_FILE_BYTES }
    );

    const tooManyEntries = makeDeclaredZip(Array.from(
      { length: MAX_ZIP_ENTRIES + 1 },
      (_, index) => ({ name: `xl/item${index}.xml`, compressed: 0, uncompressed: 0 })
    ));
    await expectAsyncParseError(
      () => parseTabularFile(new File([tooManyEntries], "entries.xlsx")),
      "resourceLimitExceeded",
      { resource: "zipEntries", limit: MAX_ZIP_ENTRIES }
    );
  });

  it("rejects XLSX compression bombs before workbook decompression", async () => {
    const ratioBomb = makeDeclaredZip([{
      name: "xl/worksheets/sheet1.xml",
      compressed: 1,
      uncompressed: MAX_XLSX_COMPRESSION_RATIO + 1
    }]);

    await expectAsyncParseError(
      () => parseTabularFile(new File([ratioBomb], "ratio.xlsx")),
      "resourceLimitExceeded",
      { resource: "zipCompressionRatio", limit: MAX_XLSX_COMPRESSION_RATIO }
    );
  });

  it("wraps malformed workbooks in the stable invalid-XLSX error", async () => {
    await expectAsyncParseError(
      () => parseTabularFile(new File(["not a zip"], "broken.xlsx")),
      "malformedFile",
      { reason: "invalidXlsx", fileName: "broken.xlsx" }
    );
  });
});

function encodeUtf16(text: string, endian: "le" | "be") {
  const result = new Uint8Array(2 + text.length * 2);
  result.set(endian === "le" ? [0xff, 0xfe] : [0xfe, 0xff]);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const offset = 2 + index * 2;
    result[offset] = endian === "le" ? code & 0xff : code >> 8;
    result[offset + 1] = endian === "le" ? code >> 8 : code & 0xff;
  }
  return result;
}

function makeXlsxFile(sheets: Array<{ name: string; rows: Array<Array<string | number | boolean | null>> }>) {
  const sheetOverrides = sheets.map((_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");
  const workbookSheets = sheets.map((sheet, index) =>
    `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  ).join("");
  const workbookRelationships = sheets.map((_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join("");
  const entries: Array<[string, string]> = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        ${sheetOverrides}
      </Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets>${workbookSheets}</sheets>
      </workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        ${workbookRelationships}
      </Relationships>`]
  ];
  sheets.forEach((sheet, index) => entries.push([`xl/worksheets/sheet${index + 1}.xml`, makeSheetXml(sheet.rows)]));
  return new File([makeStoredZip(entries)], "rate.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

function makeSheetXml(rows: Array<Array<string | number | boolean | null>>) {
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      if (value === null) return "";
      const reference = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
      if (typeof value === "number") return `<c r="${reference}"><v>${value}</v></c>`;
      if (typeof value === "boolean") return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
      return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function makeStoredZip(entries: Array<[string, string]>) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const [name, contents] of entries) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(contents);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    writeZipHeader(localView, 0x04034b50, checksum, data.length, nameBytes.length);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return concatenate([...localParts, ...centralParts, end]).buffer;
}

function makeDeclaredZip(entries: Array<{ name: string; compressed: number; uncompressed: number }>) {
  const encoder = new TextEncoder();
  const centralSize = entries.reduce((total, entry) => total + 46 + encoder.encode(entry.name).length, 0);
  const bytes = new Uint8Array(30 + centralSize + 22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  let offset = 30;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    view.setUint32(offset, 0x02014b50, true);
    view.setUint32(offset + 20, entry.compressed, true);
    view.setUint32(offset + 24, entry.uncompressed, true);
    view.setUint16(offset + 28, name.length, true);
    view.setUint32(offset + 42, 0, true);
    bytes.set(name, offset + 46);
    offset += 46 + name.length;
  }
  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, 30, true);
  return bytes.buffer;
}

function writeZipHeader(view: DataView, signature: number, checksum: number, size: number, nameLength: number) {
  view.setUint32(0, signature, true);
  view.setUint16(4, 20, true);
  view.setUint32(14, checksum, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameLength, true);
}

function concatenate(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
