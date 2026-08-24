import { describe, expect, it } from "vitest";
import {
  CvParseError,
  confirmCvSeries,
  parseCvFile,
  parseDelimitedCv,
  type CvParseErrorCode
} from "../src/lib/cvParsing";

function expectParseError(action: () => unknown, code: CvParseErrorCode, detail?: Record<string, unknown>) {
  try {
    action();
    throw new Error("expectedCvParseError");
  } catch (error) {
    expect(error).toBeInstanceOf(CvParseError);
    expect((error as CvParseError).code).toBe(code);
    if (detail) expect((error as CvParseError).detail).toMatchObject(detail);
  }
}

async function expectAsyncParseError(action: () => Promise<unknown>, code: CvParseErrorCode) {
  try {
    await action();
    throw new Error("expectedCvParseError");
  } catch (error) {
    expect(error).toBeInstanceOf(CvParseError);
    expect((error as CvParseError).code).toBe(code);
  }
}

describe("parseDelimitedCv", () => {
  it("parses quote-aware comma CSV and recognizes potential, current columns, and common rate headings", () => {
    const table = parseDelimitedCv([
      'Potential,"1","2 mV/s","Current 5 mV s-1","Current, unassigned"',
      "0,10,20,50,5",
      "0.5,11,21,51,6"
    ].join("\n"));

    expect(table.headers).toEqual([
      "Potential",
      "1",
      "2 mV/s",
      "Current 5 mV s-1",
      "Current, unassigned"
    ]);
    expect(table.potentialColumn).toBe(0);
    expect(table.currentColumns).toEqual([
      { column: 1, header: "1", inferredScanRate: 1 },
      { column: 2, header: "2 mV/s", inferredScanRate: 2 },
      { column: 3, header: "Current 5 mV s-1", inferredScanRate: 5 },
      { column: 4, header: "Current, unassigned", inferredScanRate: null }
    ]);
    expect(table.rows).toEqual([
      [0, 10, 20, 50, 5],
      [0.5, 11, 21, 51, 6]
    ]);
  });

  it.each([
    ["tab", "Potential\t1\t2\n0\t10\t20\n1\t11\t21"],
    ["semicolon", "Potential;1;2\n0;10;20\n1;11;21"],
    ["whitespace", "Potential 1 2\n0 10 20\n1 11 21"]
  ])("parses %s-separated tables", (_name, text) => {
    const table = parseDelimitedCv(text);
    expect(table.headers).toEqual(["Potential", "1", "2"]);
    expect(table.rows).toEqual([[0, 10, 20], [1, 11, 21]]);
  });

  it("falls back to whitespace when punctuation in a heading is not delimiter structure", () => {
    const table = parseDelimitedCv("Potential current;raw 2\n0 10 20\n1 11 21");

    expect(table.headers).toEqual(["Potential", "current;raw", "2"]);
    expect(table.currentColumns).toHaveLength(2);
  });

  it("only accepts exact electrochemical E headings rather than matching e inside arbitrary words", () => {
    expect(parseDelimitedCv("E (V),1,2\n0,10,20\n1,11,21").potentialColumn).toBe(0);
    expect(parseDelimitedCv("电位,1,2\n0,10,20\n1,11,21").potentialColumn).toBe(0);
    expectParseError(
      () => parseDelimitedCv("Temperature,Current 1 mV/s\n0,10\n1,11"),
      "potentialColumnMissing"
    );
  });

  it("rejects empty input, unclosed quotes, malformed row widths, and tables without current columns", () => {
    expectParseError(() => parseDelimitedCv(" \r\n\t"), "emptyFile");
    expectParseError(() => parseDelimitedCv('Potential,"1\n0,10'), "malformedFile", { reason: "unclosedQuote" });
    expectParseError(
      () => parseDelimitedCv('Potential,"1"junk,2\n0,10,20\n1,11,21'),
      "malformedFile",
      { reason: "charactersAfterQuote" }
    );
    expectParseError(() => parseDelimitedCv("Potential,1,2\n0,10\n1,11,21"), "malformedFile", {
      reason: "rowWidth",
      row: 2
    });
    expectParseError(() => parseDelimitedCv("Potential,Time\n0,0\n1,1"), "currentColumnsMissing");
  });
});

describe("confirmCvSeries", () => {
  it("keeps missing inferred rates editable and uses the confirmed values", () => {
    const table = parseDelimitedCv("Potential,Current,Current\n0,10,20\n1,11,21");
    expect(table.currentColumns.map((item) => item.inferredScanRate)).toEqual([null, null]);

    expect(confirmCvSeries(table, [2, 5])).toEqual([
      { label: "Current", scanRate: 2, points: [{ potential: 0, current: 10 }, { potential: 1, current: 11 }] },
      { label: "Current", scanRate: 5, points: [{ potential: 0, current: 20 }, { potential: 1, current: 21 }] }
    ]);
  });

  it("blocks missing, duplicate, zero, negative, and non-finite confirmed rates", () => {
    const table = parseDelimitedCv("Potential,1,2\n0,10,20\n1,11,21");
    expectParseError(() => confirmCvSeries(table, [1]), "missingScanRate");
    const sparseRates = [1, 2];
    delete sparseRates[1];
    expectParseError(() => confirmCvSeries(table, sparseRates), "missingScanRate");
    expectParseError(() => confirmCvSeries(table, [1, 1]), "duplicateScanRate", { scanRate: 1 });
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectParseError(() => confirmCvSeries(table, [1, invalid]), "invalidScanRate");
    }
  });

  it("preserves sparse points independently for each current series", () => {
    const table = parseDelimitedCv("Potential,1,2\n2,12,22\n0,10,\n1,,20");

    expect(confirmCvSeries(table, [1, 2])).toEqual([
      { label: "1", scanRate: 1, points: [{ potential: 0, current: 10 }, { potential: 2, current: 12 }] },
      { label: "2", scanRate: 2, points: [{ potential: 1, current: 20 }, { potential: 2, current: 22 }] }
    ]);
  });

  it("requires two points per series and reports duplicate potentials with stable detail", () => {
    expectParseError(
      () => confirmCvSeries(parseDelimitedCv("Potential,1,2\n0,10,20\n1,,21"), [1, 2]),
      "insufficientSeries",
      { header: "1", pointCount: 1 }
    );
    expectParseError(
      () => confirmCvSeries(parseDelimitedCv("Potential,1,2\n0,10,20\n0,11,21"), [1, 2]),
      "malformedFile",
      { reason: "duplicatePotential", header: "1", potential: 0 }
    );
  });
});

describe("parseCvFile", () => {
  it("parses CSV and TXT File objects through the shared delimited parser", async () => {
    const csv = new File(["Potential,1,2\n0,10,20\n1,11,21"], "example.csv", { type: "text/csv" });
    const txt = new File(["Potential\t1\t2\n0\t10\t20\n1\t11\t21"], "example.txt", { type: "text/plain" });

    await expect(parseCvFile(csv)).resolves.toMatchObject({ potentialColumn: 0 });
    await expect(parseCvFile(txt)).resolves.toMatchObject({ potentialColumn: 0 });
  });

  it("reads a valid XLSX File through the read-excel-file browser API", async () => {
    const table = await parseCvFile(makeMinimalXlsxFile());

    expect(table).toEqual({
      headers: ["Potential", "1 mV/s", "Current 5 mV s-1"],
      rows: [[0, 10, 50], [1, 11, 51]],
      potentialColumn: 0,
      currentColumns: [
        { column: 1, header: "1 mV/s", inferredScanRate: 1 },
        { column: 2, header: "Current 5 mV s-1", inferredScanRate: 5 }
      ]
    });
  });

  it("explicitly rejects legacy .xls files and wraps malformed XLSX files", async () => {
    await expectAsyncParseError(
      () => parseCvFile(new File(["legacy"], "legacy.xls", { type: "application/vnd.ms-excel" })),
      "malformedFile"
    );
    await expectAsyncParseError(
      () => parseCvFile(new File(["not a zip"], "broken.xlsx")),
      "malformedFile"
    );
  });

  it("wraps text File read failures in the stable parse error contract", async () => {
    const unreadable = new File(["ignored"], "unreadable.csv", { type: "text/csv" });
    Object.defineProperty(unreadable, "text", {
      value: () => Promise.reject(new DOMException("denied", "NotReadableError"))
    });

    try {
      await parseCvFile(unreadable);
      throw new Error("expectedCvParseError");
    } catch (error) {
      expect(error).toBeInstanceOf(CvParseError);
      expect((error as CvParseError).code).toBe("malformedFile");
      expect((error as CvParseError).detail).toMatchObject({
        reason: "fileReadFailed",
        fileName: "unreadable.csv",
        errorName: "NotReadableError"
      });
    }
  });
});

function makeMinimalXlsxFile() {
  const entries: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      </Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="CV" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
      </Relationships>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>Potential</t></is></c><c r="B1" t="inlineStr"><is><t>1 mV/s</t></is></c><c r="C1" t="inlineStr"><is><t>Current 5 mV s-1</t></is></c></row>
        <row r="2"><c r="A2"><v>0</v></c><c r="B2"><v>10</v></c><c r="C2"><v>50</v></c></row>
        <row r="3"><c r="A3"><v>1</v></c><c r="B3"><v>11</v></c><c r="C3"><v>51</v></c></row>
      </sheetData></worksheet>`
  };
  const archive = makeStoredZip(Object.entries(entries));
  return new File([archive], "cv-wide.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
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

  const centralSize = centralParts.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const parts = [...localParts, ...centralParts, end];
  const archive = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let position = 0;
  for (const part of parts) {
    archive.set(part, position);
    position += part.length;
  }
  return archive.buffer;
}

function writeZipHeader(view: DataView, signature: number, checksum: number, size: number, nameLength: number) {
  view.setUint32(0, signature, true);
  view.setUint16(4, 20, true);
  view.setUint32(14, checksum, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameLength, true);
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
