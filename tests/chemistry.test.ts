import { describe, expect, it } from "vitest";
import { atomicWeights } from "../src/lib/atomicWeights";
import { calculateMolarMass, FormulaError, parseFormula } from "../src/lib/chemistry";

function expectFormulaError(formula: string, code: FormulaError["code"]) {
  expect(() => parseFormula(formula)).toThrow(FormulaError);
  try {
    parseFormula(formula);
  } catch (error) {
    expect(error).toBeInstanceOf(FormulaError);
    expect((error as FormulaError).code).toBe(code);
  }
}

describe("chemical formula parser", () => {
  it.each([
    ["H2O", { H: 2, O: 1 }],
    ["Nb2S2C", { Nb: 2, S: 2, C: 1 }],
    ["FeMo2S4", { Fe: 1, Mo: 2, S: 4 }],
    ["Li1.2Mn0.54Ni0.13Co0.13O2", { Li: 1.2, Mn: 0.54, Ni: 0.13, Co: 0.13, O: 2 }],
    ["Ca(OH)2", { Ca: 1, O: 2, H: 2 }],
    ["Fe2(SO4)3", { Fe: 2, S: 3, O: 12 }],
    ["K4(ON(SO3)2)2", { K: 4, O: 14, N: 2, S: 4 }]
  ])("parses %s", (formula, expected) => {
    expect(Object.fromEntries(parseFormula(formula))).toEqual(expected);
  });

  it("combines repeated elements while retaining their first occurrence order", () => {
    expect([...parseFormula("CH3COOH")]).toEqual([["C", 2], ["H", 4], ["O", 2]]);
  });

  it("rejects unsupported or malformed formulas with explicit error codes", () => {
    expectFormulaError("", "emptyFormula");
    expectFormulaError("CuSO4·5H2O", "unsupportedHydrate");
    expectFormulaError("CuSO4.5H2O", "unsupportedHydrate");
    expectFormulaError("H2O.", "unsupportedHydrate");
    expectFormulaError("Xx2O", "unknownElement");
    expectFormulaError("Ca()2", "invalidFormula");
    expectFormulaError("Ca(OH2", "invalidFormula");
    expectFormulaError("Ca)OH", "invalidFormula");
    expectFormulaError("2H2O", "invalidFormula");
    expectFormulaError("H(2O)", "invalidFormula");
    expectFormulaError("H0O", "invalidFormula");
    expectFormulaError("H-2O", "invalidFormula");
    expectFormulaError("H2O!", "invalidFormula");
  });
});

describe("molar mass calculation", () => {
  it("contains conventional atomic weights for every recognized element", () => {
    expect(Object.keys(atomicWeights)).toHaveLength(118);
    expect(atomicWeights.Og).toBe(294);
  });

  it("calculates total mass and per-element contributions", () => {
    const water = calculateMolarMass("H2O");

    expect(water.molarMass).toBeCloseTo(18.015, 2);
    expect(water.elements).toEqual([
      expect.objectContaining({ element: "H", count: 2, atomicWeight: 1.008, mass: 2.016 }),
      expect.objectContaining({ element: "O", count: 1, atomicWeight: 15.999, mass: 15.999 })
    ]);
    expect(water.elements.reduce((sum, element) => sum + element.massPercent, 0)).toBeCloseTo(100, 10);
  });

  it("supports grouped formulas", () => {
    expect(calculateMolarMass("Ca(OH)2").molarMass).toBeCloseTo(74.09, 1);
  });
});
