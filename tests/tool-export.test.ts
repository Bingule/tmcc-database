import { describe, expect, it } from "vitest";
import { rowsToCsv } from "../src/lib/toolExport";

describe("shared CSV export", () => {
  it("neutralizes spreadsheet formulas and control-character prefixes in string cells", () => {
    const csv = rowsToCsv(["value"], [
      ["=SUM(1,1)"], [" +CMD"], ["\tDDE"], ["\rDDE"], ["safe"], [-2],
    ]);

    expect(csv).toContain("\"'=SUM(1,1)\"");
    expect(csv).toContain("' +CMD");
    expect(csv).toContain("\"'\tDDE\"");
    expect(csv).toContain("\"'\rDDE\"");
    expect(csv).toContain("\r\nsafe\r\n-2");
  });
});
