import { describe, expect, it } from "vitest";
import { makeColumnPairs, parseScanRateList } from "../src/lib/cvImport";

describe("parseScanRateList", () => {
  it("parses comma, semicolon, newline, and whitespace delimiters", () => {
    expect(parseScanRateList("0.2, 0.4; 0.6\n0.8 1")).toEqual([0.2, 0.4, 0.6, 0.8, 1]);
  });

  it("rejects fewer than three scan rates", () => {
    expect(() => parseScanRateList("1, 2")).toThrowError(
      expect.objectContaining({ code: "insufficientSeries" }),
    );
  });

  it("rejects more than twenty scan rates", () => {
    expect(() => parseScanRateList(Array.from({ length: 21 }, (_, i) => i + 1).join(","))).toThrowError(
      expect.objectContaining({ code: "tooManySeries" }),
    );
  });

  it("rejects duplicate scan rates", () => {
    expect(() => parseScanRateList("1,2,2")).toThrowError(
      expect.objectContaining({ code: "duplicateScanRate" }),
    );
  });

  it("rejects non-positive scan rates", () => {
    expect(() => parseScanRateList("1,0,3")).toThrowError(
      expect.objectContaining({ code: "invalidScanRate" }),
    );
  });

  it.each(["1x", "Infinity", "1e999", "１"])("rejects non-ASCII or non-finite token %s", (token) => {
    expect(() => parseScanRateList(`1,2,${token}`)).toThrowError(
      expect.objectContaining({ code: "invalidScanRate" }),
    );
  });
});

describe("makeColumnPairs", () => {
  it("makes shared-potential pairs by column position", () => {
    expect(makeColumnPairs(["E", "I1", "I2"], { layout: "sharedPotential", headerMode: "header" })).toEqual([
      { potentialColumn: 0, currentColumn: 1, potentialHeader: "E", currentHeader: "I1" },
      { potentialColumn: 0, currentColumn: 2, potentialHeader: "E", currentHeader: "I2" },
    ]);
  });

  it("rejects an incomplete paired-potential-current layout", () => {
    expect(() => makeColumnPairs(["E1", "I1", "E2"], { layout: "pairedPotentialCurrent", headerMode: "header" })).toThrowError(
      expect.objectContaining({ code: "oddPairColumnCount" }),
    );
  });
});
