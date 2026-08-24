import { describe, expect, it } from "vitest";
import { atomicWeights } from "../src/lib/atomicWeights";
import { calculateMolarMass, FormulaError, parseFormula } from "../src/lib/chemistry";

function expectFormulaError(formula: string, code: FormulaError["code"], detail?: string) {
  expect(() => parseFormula(formula)).toThrow(FormulaError);
  try {
    parseFormula(formula);
  } catch (error) {
    expect(error).toBeInstanceOf(FormulaError);
    const formulaError = error as FormulaError;
    expect(formulaError.code).toBe(code);
    expect(formulaError.message).toBe(code);
    if (detail !== undefined) expect(formulaError.detail).toBe(detail);
  }
}

function expectMolarMassError(formula: string, detail: string) {
  expect(() => calculateMolarMass(formula)).toThrow(FormulaError);
  try {
    calculateMolarMass(formula);
  } catch (error) {
    expect(error).toBeInstanceOf(FormulaError);
    const formulaError = error as FormulaError;
    expect(formulaError.code).toBe("invalidFormula");
    expect(formulaError.message).toBe("invalidFormula");
    expect(formulaError.detail).toBe(detail);
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

  it("interprets ASCII points between digits as decimal counts", () => {
    expect(Object.fromEntries(parseFormula("H0.5H2O"))).toEqual({ H: 2.5, O: 1 });
    expect(Object.fromEntries(parseFormula("CuSO4.5H2O"))).toEqual({ Cu: 1, S: 1, O: 5.5, H: 2 });
  });

  it("rejects unsupported or malformed formulas with explicit error codes", () => {
    expectFormulaError("", "emptyFormula");
    expectFormulaError("CuSO4·5H2O", "unsupportedHydrate", "·");
    expectFormulaError("CuSO4•5H2O", "unsupportedHydrate", "•");
    expectFormulaError("H2O.", "unsupportedHydrate");
    expectFormulaError("H.2O", "unsupportedHydrate");
    expectFormulaError("H2.O", "unsupportedHydrate");
    expectFormulaError("Xx2O", "unknownElement", "Xx");
    expectFormulaError("Ca()2", "invalidFormula");
    expectFormulaError("Ca(OH2", "invalidFormula");
    expectFormulaError("Ca)OH", "invalidFormula");
    expectFormulaError("2H2O", "invalidFormula");
    expectFormulaError("H(2O)", "invalidFormula");
    expectFormulaError("H0O", "invalidFormula");
    expectFormulaError("H-2O", "invalidFormula");
    expectFormulaError("H2O!", "invalidFormula");
  });

  it("rejects finite counts whose nested multiplication overflows", () => {
    const largeFiniteCount = `1${"0".repeat(308)}`;
    expectFormulaError(`(H${largeFiniteCount})${largeFiniteCount}`, "invalidFormula");
  });

  it("rejects finite repeated counts whose aggregation overflows", () => {
    const largeFiniteCount = `1${"0".repeat(308)}`;
    expectFormulaError(`H${largeFiniteCount}H${largeFiniteCount}`, "invalidFormula");
  });
});

describe("molar mass calculation", () => {
  it("contains conventional atomic weights for every recognized element", () => {
    expect(Object.keys(atomicWeights)).toHaveLength(118);
    expect(atomicWeights.Og).toBe(294);
  });

  it("uses the NIST June 2024 bracketed mass numbers for radioactive elements", () => {
    expect(Object.fromEntries(Object.entries(atomicWeights).filter(([element]) => [
      "Tc", "Pm", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og"
    ].includes(element)))).toEqual({
      Tc: 98, Pm: 145, Po: 209, At: 210, Rn: 222, Fr: 223, Ra: 226, Ac: 227,
      Np: 237, Pu: 244, Am: 243, Cm: 247, Bk: 247, Cf: 251, Es: 252, Fm: 257,
      Md: 258, No: 259, Lr: 262, Rf: 267, Db: 268, Sg: 271, Bh: 270, Hs: 277,
      Mt: 278, Ds: 281, Rg: 282, Cn: 285, Nh: 286, Fl: 289, Mc: 289, Lv: 293,
      Ts: 294, Og: 294
    });
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

  it("rejects molar-mass calculations that overflow an element mass or total mass", () => {
    const oneTimesTenToThe308 = `1${"0".repeat(308)}`;
    const oneTimesTenToThe307 = `1${"0".repeat(307)}`;

    expectMolarMassError(`Li${oneTimesTenToThe308}`, "elementMass");
    expectMolarMassError(`H${oneTimesTenToThe308}C${oneTimesTenToThe307}`, "molarMass");
  });

  it("keeps a near-limit one-element mass percentage finite", () => {
    const nearLimitCount = `17${"0".repeat(307)}`;
    const result = calculateMolarMass(`H${nearLimitCount}`);

    expect(Number.isFinite(result.molarMass)).toBe(true);
    expect(Number.isFinite(result.elements[0].massPercent)).toBe(true);
    expect(result.elements[0].massPercent).toBe(100);
  });
});
