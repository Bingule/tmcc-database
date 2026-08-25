import { describe, expect, it, vi } from "vitest";

const { readXlsxFileSpy } = vi.hoisted(() => ({ readXlsxFileSpy: vi.fn() }));

vi.mock("read-excel-file/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("read-excel-file/browser")>();
  readXlsxFileSpy.mockImplementation(actual.default);
  return { ...actual, default: readXlsxFileSpy };
});
import {
  CvParseError,
  MAX_CELLS,
  MAX_COLUMNS,
  MAX_FILE_BYTES,
  MAX_ROWS,
  MAX_SHEETS,
  MAX_XLSX_COMPRESSION_RATIO,
  MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES,
  MAX_XLSX_TOTAL_UNCOMPRESSED_BYTES,
  MAX_XLSX_WORKSHEETS,
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

async function expectAsyncParseError(
  action: () => Promise<unknown>,
  code: CvParseErrorCode,
  detail?: Record<string, unknown>
) {
  try {
    await action();
    throw new Error("expectedCvParseError");
  } catch (error) {
    expect(error).toBeInstanceOf(CvParseError);
    expect((error as CvParseError).code).toBe(code);
    if (detail) expect((error as CvParseError).detail).toMatchObject(detail);
  }
}

describe("parseDelimitedCv", () => {
  it("constructs shared-potential pairs from the selected header layout", () => {
    const table = parseDelimitedCv("E\tI1\tI2\n0\t1\t2\n1\t3\t4", {
      layout: "sharedPotential",
      headerMode: "header"
    });

    expect(table.pairs.map((pair) => [pair.potentialColumn, pair.currentColumn])).toEqual([[0, 1], [0, 2]]);
  });

  it("generates shared-potential headers when the first row is data", () => {
    const table = parseDelimitedCv("0\t1\t2\n1\t3\t4", {
      layout: "sharedPotential",
      headerMode: "data"
    });

    expect(table.headers).toEqual(["X", "Y1", "Y2"]);
    expect(table.rows).toHaveLength(2);
  });

  it("rejects delimited tables that exceed row, column, or cell resource limits", () => {
    expectParseError(() => parseDelimitedCv(Array.from({ length: MAX_ROWS + 1 }, (_, index) => index === 0 ? "Potential,1" : `${index},1`).join("\n")), "resourceLimitExceeded", { resource: "rows", limit: MAX_ROWS });
    const wideHeader = ["Potential", ...Array.from({ length: MAX_COLUMNS }, (_, index) => String(index + 1))].join(",");
    expectParseError(() => parseDelimitedCv(`${wideHeader}\n${Array.from({ length: MAX_COLUMNS + 1 }, () => "1").join(",")}`), "resourceLimitExceeded", { resource: "columns", limit: MAX_COLUMNS });
    const width = 201;
    const rows = Math.floor(MAX_CELLS / width) + 2;
    const header = ["Potential", ...Array.from({ length: width - 1 }, (_, index) => String(index + 1))].join(",");
    const data = Array.from({ length: width }, () => "1").join(",");
    expectParseError(() => parseDelimitedCv([header, ...Array.from({ length: rows - 1 }, () => data)].join("\n")), "resourceLimitExceeded", { resource: "cells", limit: MAX_CELLS });
  }, 30_000);
  it("parses quote-aware comma CSV into positional shared-potential pairs with compatibility rate hints", () => {
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

  it("prefers a structurally valid whitespace table over malformed delimiter punctuation", () => {
    const table = parseDelimitedCv("Potential;foo Current 2\n0 10 20\n1 11 21");

    expect(table.headers).toEqual(["Potential;foo", "Current", "2"]);
    expect(table.currentColumns.map((column) => column.header)).toEqual(["Current", "2"]);
  });

  it.each([
    [
      "comma",
      [
        "Potential,1,2,Notes",
        "0,10,20,a;b;c;d;e;f;g",
        "1,11,21,h;i;j;k;l;m;n"
      ].join("\n"),
      ["Potential", "1", "2", "Notes"]
    ],
    [
      "semicolon",
      [
        "Potential;1;2;Notes",
        "0;10;20;a,b,c,d,e,f,g",
        "1;11;21;h,i,j,k,l,m,n"
      ].join("\n"),
      ["Potential", "1", "2", "Notes"]
    ]
  ])("chooses the %s delimiter from row structure and selected layout instead of punctuation counts", (
    _name,
    text,
    headers
  ) => {
    const table = parseDelimitedCv(text);

    expect(table.headers).toEqual(headers);
    expect(table.rows[0]).toHaveLength(4);
    expect(table.currentColumns.map((column) => column.header)).toEqual(["1", "2", "Notes"]);
  });

  it("uses the selected shared-potential column positions without inferring header names", () => {
    expect(parseDelimitedCv("E (V),1,2\n0,10,20\n1,11,21").potentialColumn).toBe(0);
    expect(parseDelimitedCv("电位,1,2\n0,10,20\n1,11,21").potentialColumn).toBe(0);
    expect(parseDelimitedCv("Temperature,Current 1 mV/s\n0,10\n1,11").pairs).toEqual([
      { potentialColumn: 0, currentColumn: 1, potentialHeader: "Temperature", currentHeader: "Current 1 mV/s" }
    ]);
  });

  it("retains only valid dot-decimal compatibility rate hints without filtering positional columns", () => {
    const table = parseDelimitedCv([
      'Potential,"1,5 mV/s","1..5 mV/s","1.5.2 mV/s","1.5 mV/s",2',
      "0,10,20,30,40,50",
      "1,11,21,31,41,51"
    ].join("\n"));

    expect(table.currentColumns).toEqual([
      { column: 1, header: "1,5 mV/s", inferredScanRate: null },
      { column: 2, header: "1..5 mV/s", inferredScanRate: null },
      { column: 3, header: "1.5.2 mV/s", inferredScanRate: null },
      { column: 4, header: "1.5 mV/s", inferredScanRate: 1.5 },
      { column: 5, header: "2", inferredScanRate: 2 }
    ]);
  });

  it("rejects empty input, unclosed quotes, and malformed row widths while preserving positional columns", () => {
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
    expect(parseDelimitedCv("Potential,Time\n0,0\n1,1").pairs).toHaveLength(1);
  });
});

describe("confirmCvSeries", () => {
  it("confirms independent paired-potential-current ranges by position", () => {
    const table = parseDelimitedCv(
      "E1,I1,E2,I2\n0,10,0.1,20\n1,11,1.1,21\n,,2.1,22",
      { layout: "pairedPotentialCurrent", headerMode: "header" }
    );

    expect(confirmCvSeries(table, [1, 5])).toEqual([
      { label: "I1", scanRate: 1, points: [{ potential: 0, current: 10 }, { potential: 1, current: 11 }] },
      {
        label: "I2",
        scanRate: 5,
        points: [{ potential: 0.1, current: 20 }, { potential: 1.1, current: 21 }, { potential: 2.1, current: 22 }]
      }
    ]);
  });

  it("rejects incomplete paired rows instead of coercing a blank cell to zero", () => {
    const table = parseDelimitedCv("E1,I1,E2,I2\n0,10,0,20\n1,,1,21\n2,12,2,22", {
      layout: "pairedPotentialCurrent",
      headerMode: "header"
    });

    expectParseError(() => confirmCvSeries(table, [1, 5]), "malformedFile", {
      reason: "incompletePairRow",
      row: 3,
      potentialColumn: 0,
      currentColumn: 1
    });
  });

  it("requires two complete points for every paired series", () => {
    const table = parseDelimitedCv("E1,I1,E2,I2\n0,10,0,20\n,,1,21\n,,2,22", {
      layout: "pairedPotentialCurrent",
      headerMode: "header"
    });

    expectParseError(() => confirmCvSeries(table, [1, 5]), "insufficientSeries", {
      reason: "pointCount",
      header: "I1",
      pointCount: 1
    });
  });

  it("reports paired scan-rate count mismatches with expected and actual counts", () => {
    const table = parseDelimitedCv("E1,I1,E2,I2\n0,10,0,20\n1,11,1,21", {
      layout: "pairedPotentialCurrent",
      headerMode: "header"
    });

    expectParseError(() => confirmCvSeries(table, [1]), "scanRateCountMismatch", { expected: 2, actual: 1 });
  });

  it("uses confirmed rates for positional pairs when compatibility rate hints are absent", () => {
    const table = parseDelimitedCv("Potential,Current,Current\n0,10,20\n1,11,21");
    expect(table.currentColumns.map((item) => item.inferredScanRate)).toEqual([null, null]);

    expect(confirmCvSeries(table, [2, 5])).toEqual([
      { label: "Current", scanRate: 2, points: [{ potential: 0, current: 10 }, { potential: 1, current: 11 }] },
      { label: "Current", scanRate: 5, points: [{ potential: 0, current: 20 }, { potential: 1, current: 21 }] }
    ]);
  });

  it("blocks missing, duplicate, zero, negative, and non-finite confirmed rates", () => {
    const table = parseDelimitedCv("Potential,1,2\n0,10,20\n1,11,21");
    expectParseError(() => confirmCvSeries(table, [1]), "scanRateCountMismatch", { expected: 2, actual: 1 });
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
  it("rejects oversized files and workbooks with too many sheets before table processing", async () => {
    const oversized = new File(["Potential,1,2\n0,1,2"], "large.csv");
    Object.defineProperty(oversized, "size", { value: MAX_FILE_BYTES + 1 });
    await expectAsyncParseError(() => parseCvFile(oversized), "resourceLimitExceeded", { resource: "fileBytes", limit: MAX_FILE_BYTES });

    const sheets = Array.from({ length: MAX_SHEETS + 1 }, (_, index) => ({ name: `S${index}`, rows: [["Potential", "1", "2"], [0, 1, 2], [1, 2, 3]] }));
    await expectAsyncParseError(() => parseCvFile(makeWorkbookFile(sheets, "many-sheets.xlsx")), "resourceLimitExceeded", { resource: "zipWorksheets", limit: MAX_SHEETS });
  });

  it("rejects XLSX compression bombs and excessive worksheet declarations in central-directory preflight", async () => {
    const ratioBomb = makeDeclaredZip([{ name: "xl/worksheets/sheet1.xml", compressed: 1, uncompressed: MAX_XLSX_COMPRESSION_RATIO + 1 }]);
    await expectAsyncParseError(() => parseCvFile(new File([ratioBomb], "ratio.xlsx")), "resourceLimitExceeded", { resource: "zipCompressionRatio", limit: MAX_XLSX_COMPRESSION_RATIO });

    const singleBomb = makeDeclaredZip([{ name: "xl/sharedStrings.xml", compressed: 1_000_000, uncompressed: MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES + 1 }]);
    await expectAsyncParseError(() => parseCvFile(new File([singleBomb], "single.xlsx")), "resourceLimitExceeded", { resource: "zipEntryBytes", limit: MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES });

    const totalBomb = makeDeclaredZip(Array.from({ length: 3 }, (_, index) => ({ name: `xl/media/item${index}.bin`, compressed: 1_000_000, uncompressed: Math.floor(MAX_XLSX_TOTAL_UNCOMPRESSED_BYTES / 3) + 1 })));
    await expectAsyncParseError(() => parseCvFile(new File([totalBomb], "total.xlsx")), "resourceLimitExceeded", { resource: "zipTotalBytes", limit: MAX_XLSX_TOTAL_UNCOMPRESSED_BYTES });

    const worksheetBomb = makeDeclaredZip(Array.from({ length: MAX_XLSX_WORKSHEETS + 1 }, (_, index) => ({ name: `xl/worksheets/sheet${index}.xml`, compressed: 0, uncompressed: 0 })));
    await expectAsyncParseError(() => parseCvFile(new File([worksheetBomb], "worksheets.xlsx")), "resourceLimitExceeded", { resource: "zipWorksheets", limit: MAX_XLSX_WORKSHEETS });
  });

  it("rejects ZIP64 sentinels and malformed central-directory signatures before XLSX decompression", async () => {
    const zip64 = makeDeclaredZip([{ name: "xl/workbook.xml", compressed: 1, uncompressed: 1 }], { zip64: true });
    await expectAsyncParseError(() => parseCvFile(new File([zip64], "zip64.xlsx")), "resourceLimitExceeded", { resource: "zip64" });

    const malformed = new Uint8Array(makeDeclaredZip([{ name: "xl/workbook.xml", compressed: 1, uncompressed: 1 }]));
    new DataView(malformed.buffer).setUint32(30, 0x12345678, true);
    await expectAsyncParseError(() => parseCvFile(new File([malformed], "bad-central.xlsx")), "malformedFile", { reason: "invalidXlsx" });
  });
  it("parses CSV and TXT File objects through the shared delimited parser", async () => {
    const csv = new File(["Potential,1,2\n0,10,20\n1,11,21"], "example.csv", { type: "text/csv" });
    const txt = new File(["Potential\t1\t2\n0\t10\t20\n1\t11\t21"], "example.txt", { type: "text/plain" });

    await expect(parseCvFile(csv)).resolves.toMatchObject({ potentialColumn: 0 });
    await expect(parseCvFile(txt)).resolves.toMatchObject({ potentialColumn: 0 });
  });

  it("reads a valid XLSX File through the read-excel-file browser API", async () => {
    const table = await parseCvFile(makeMinimalXlsxFile());

    expect(table).toMatchObject({
      headers: ["Potential", "1 mV/s", "Current 5 mV s-1"],
      rows: [[0, 10, 50], [1, 11, 51]],
      potentialColumn: 0,
      currentColumns: [
        { column: 1, header: "1 mV/s", inferredScanRate: 1 },
        { column: 2, header: "Current 5 mV s-1", inferredScanRate: 5 }
      ]
    });
  });

  it("ignores a false EOCD signature inside a legal ZIP comment and finds the real EOCD", async () => {
    const base = makeMinimalXlsxFile();
    const archive = await readFileBuffer(base);
    const commented = addZipComment(archive, new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...Array(18).fill(0)]));
    readXlsxFileSpy.mockResolvedValueOnce([{
      name: "CV",
      data: [["Potential", "1", "2"], [0, 1, 2], [1, 2, 3]]
    }]);
    await expect(parseCvFile(new File([commented], "commented.xlsx"))).resolves.toMatchObject({ potentialColumn: 0 });
    expect(readXlsxFileSpy).toHaveBeenCalledWith(expect.any(ArrayBuffer));
  });

  it("skips a description sheet and selects the first useful CV sheet in workbook order", async () => {
    const file = makeWorkbookFile([
      { name: "Read me", rows: [["TMCC CV workbook"], ["Data is on the next sheet"]] },
      {
        name: "CV data",
        rows: [
          ["Potential", "1 mV/s", "2 mV/s"],
          [0, 10, 20],
          [1, 11, 21]
        ]
      }
    ], "multi-sheet.xlsx");

    const table = await parseCvFile(file);

    expect(table.headers).toEqual(["Potential", "1 mV/s", "2 mV/s"]);
    expect(table.rows).toEqual([[0, 10, 20], [1, 11, 21]]);
  });

  it("selects the first XLSX sheet that satisfies explicit paired headerless options", async () => {
    const file = makeWorkbookFile([
      {
        name: "Shared columns",
        rows: [[0, 10, 20], [1, 11, 21]]
      },
      {
        name: "Paired columns",
        rows: [[0, 10, 0.1, 20], [1, 11, 1.1, 21], [null, null, 2.1, 22]]
      }
    ], "paired-headerless.xlsx");
    const options = { layout: "pairedPotentialCurrent", headerMode: "data" } as const;

    const table = await parseCvFile(file, options);

    expect(table.headers).toEqual(["X1", "Y1", "X2", "Y2"]);
    expect(table.rows).toEqual([[0, 10, 0.1, 20], [1, 11, 1.1, 21], [null, null, 2.1, 22]]);
    expect(table.pairs).toEqual([
      { potentialColumn: 0, currentColumn: 1, potentialHeader: "X1", currentHeader: "Y1" },
      { potentialColumn: 2, currentColumn: 3, potentialHeader: "X2", currentHeader: "Y2" }
    ]);
    expect(confirmCvSeries(table, [1, 5])).toEqual([
      { label: "Y1", scanRate: 1, points: [{ potential: 0, current: 10 }, { potential: 1, current: 11 }] },
      {
        label: "Y2",
        scanRate: 5,
        points: [{ potential: 0.1, current: 20 }, { potential: 1.1, current: 21 }, { potential: 2.1, current: 22 }]
      }
    ]);
  });

  it("reports a stable error when no workbook sheet contains a useful CV table", async () => {
    const file = makeWorkbookFile([
      { name: "Read me", rows: [["TMCC CV workbook"]] },
      { name: "Empty", rows: [] }
    ], "no-useful-sheet.xlsx");

    await expectAsyncParseError(() => parseCvFile(file), "malformedFile", {
      reason: "usefulSheetMissing",
      fileName: "no-useful-sheet.xlsx",
      sheetCount: 2
    });
  });

  it("explicitly rejects legacy .xls files and wraps malformed XLSX files", async () => {
    await expectAsyncParseError(
      () => parseCvFile(new File(["legacy"], "legacy.xls", { type: "application/vnd.ms-excel" })),
      "malformedFile"
    );
    await expectAsyncParseError(
      () => parseCvFile(new File(["not a zip"], "broken.xlsx")),
      "malformedFile",
      { reason: "invalidXlsx", fileName: "broken.xlsx" }
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
  return makeWorkbookFile([{
    name: "CV",
    rows: [
      ["Potential", "1 mV/s", "Current 5 mV s-1"],
      [0, 10, 50],
      [1, 11, 51]
    ]
  }], "cv-wide.xlsx");
}

function readFileBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function addZipComment(buffer: ArrayBuffer, comment: Uint8Array) {
  const original = new Uint8Array(buffer);
  const result = new Uint8Array(original.length + comment.length);
  result.set(original);
  result.set(comment, original.length);
  new DataView(result.buffer).setUint16(original.length - 2, comment.length, true);
  return result.buffer;
}

function makeWorkbookFile(
  sheets: Array<{ name: string; rows: Array<Array<string | number | null>> }>,
  fileName: string
) {
  const sheetOverrides = sheets.map((_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join("");
  const workbookSheets = sheets.map((sheet, index) =>
    `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  ).join("");
  const workbookRelationships = sheets.map((_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  ).join("");
  const entries: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        ${sheetOverrides}
      </Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets>${workbookSheets}</sheets>
      </workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        ${workbookRelationships}
      </Relationships>`
  };
  sheets.forEach((sheet, index) => {
    entries[`xl/worksheets/sheet${index + 1}.xml`] = makeSheetXml(sheet.rows);
  });
  const archive = makeStoredZip(Object.entries(entries));
  return new File([archive], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

function makeSheetXml(rows: Array<Array<string | number | null>>) {
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      if (value === null) return "";
      const reference = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
      return typeof value === "number"
        ? `<c r="${reference}"><v>${value}</v></c>`
        : `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
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

function makeDeclaredZip(entries: Array<{ name: string; compressed: number; uncompressed: number }>, options: { zip64?: boolean } = {}) {
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
  view.setUint16(offset + 8, options.zip64 ? 0xffff : entries.length, true);
  view.setUint16(offset + 10, options.zip64 ? 0xffff : entries.length, true);
  view.setUint32(offset + 12, options.zip64 ? 0xffffffff : centralSize, true);
  view.setUint32(offset + 16, options.zip64 ? 0xffffffff : 30, true);
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
