import { atomicWeights } from "./atomicWeights";

export type FormulaErrorCode = "emptyFormula" | "unsupportedHydrate" | "unknownElement" | "invalidFormula";

export class FormulaError extends Error {
  code: FormulaErrorCode;
  detail?: string;

  constructor(code: FormulaErrorCode, detail?: string) {
    super(code);
    this.name = "FormulaError";
    this.code = code;
    this.detail = detail;
  }
}

export interface ElementContribution {
  element: string;
  count: number;
  atomicWeight: number;
  mass: number;
  massPercent: number;
}

export interface MolarMassResult {
  formula: string;
  molarMass: number;
  elements: ElementContribution[];
}

export function parseFormula(formula: string): Map<string, number> {
  if (typeof formula !== "string" || formula.trim().length === 0) {
    throw new FormulaError("emptyFormula");
  }
  const hydrateSeparator = findHydrateSeparator(formula);
  if (hydrateSeparator) {
    throw new FormulaError("unsupportedHydrate", hydrateSeparator);
  }

  let cursor = 0;

  const parsePositiveCount = () => {
    if (!isDigit(formula[cursor])) return 1;

    const start = cursor;
    while (isDigit(formula[cursor])) cursor += 1;
    if (formula[cursor] === ".") {
      cursor += 1;
      if (!isDigit(formula[cursor])) throw invalidFormula("decimalCount");
      while (isDigit(formula[cursor])) cursor += 1;
    }

    const count = Number(formula.slice(start, cursor));
    assertPositiveFinite(count, "count");
    return count;
  };

  const parseElement = () => {
    const start = cursor;
    cursor += 1;
    if (isLowercase(formula[cursor])) cursor += 1;
    const element = formula.slice(start, cursor);
    if (!(element in atomicWeights)) {
      throw new FormulaError("unknownElement", element);
    }
    return element;
  };

  const merge = (target: Map<string, number>, source: Map<string, number>, multiplier = 1) => {
    assertPositiveFinite(multiplier, "multiplier");
    for (const [element, count] of source) {
      assertPositiveFinite(count, "count");
      const multipliedCount = count * multiplier;
      assertPositiveFinite(multipliedCount, "multipliedCount");
      const nextCount = (target.get(element) ?? 0) + multipliedCount;
      assertPositiveFinite(nextCount, "aggregatedCount");
      target.set(element, nextCount);
    }
  };

  const parseGroup = (stopToken?: ")"): Map<string, number> => {
    const group = new Map<string, number>();
    let itemCount = 0;

    while (cursor < formula.length && formula[cursor] !== stopToken) {
      const token = formula[cursor];
      if (isUppercase(token)) {
        const element = parseElement();
        merge(group, new Map([[element, parsePositiveCount()]]));
        itemCount += 1;
        continue;
      }
      if (token === "(") {
        cursor += 1;
        const nested = parseGroup(")");
        merge(group, nested, parsePositiveCount());
        itemCount += 1;
        continue;
      }
      throw invalidFormula(`token:${token}`);
    }

    if (itemCount === 0) throw invalidFormula("emptyGroup");
    if (stopToken) {
      if (cursor >= formula.length) throw invalidFormula("unmatchedOpenParenthesis");
      cursor += 1;
    }
    return group;
  };

  const parsed = parseGroup();
  if (cursor !== formula.length) throw invalidFormula(`trailingToken:${formula[cursor]}`);
  return parsed;
}

export function calculateMolarMass(formula: string): MolarMassResult {
  const composition = parseFormula(formula);
  const elements = [...composition].map(([element, count]) => {
    const atomicWeight = atomicWeights[element];
    assertPositiveFinite(count, "count");
    assertPositiveFinite(atomicWeight, "atomicWeight");
    const mass = count * atomicWeight;
    assertPositiveFinite(mass, "elementMass");
    return { element, count, atomicWeight, mass, massPercent: 0 };
  });
  const molarMass = elements.reduce((total, element) => {
    const nextTotal = total + element.mass;
    assertPositiveFinite(nextTotal, "molarMass");
    return nextTotal;
  }, 0);

  return {
    formula,
    molarMass,
    elements: elements.map((element) => {
      const massFraction = element.mass / molarMass;
      assertPositiveFinite(massFraction, "massFraction");
      const massPercent = massFraction * 100;
      assertPositiveFinite(massPercent, "massPercent");
      return { ...element, massPercent };
    })
  };
}

function findHydrateSeparator(formula: string) {
  for (let index = 0; index < formula.length; index += 1) {
    if (formula[index] === "·" || formula[index] === "•") return formula[index];
    if (formula[index] !== ".") continue;
    // A period between digits is a decimal count. It cannot be distinguished
    // from ASCII hydrate notation, so hydrate input must use a middle dot.
    if (!isDigit(formula[index - 1]) || !isDigit(formula[index + 1])) return formula[index];
  }
  return undefined;
}

function isDigit(value: string | undefined) {
  return value !== undefined && value >= "0" && value <= "9";
}

function isUppercase(value: string | undefined) {
  return value !== undefined && value >= "A" && value <= "Z";
}

function isLowercase(value: string | undefined) {
  return value !== undefined && value >= "a" && value <= "z";
}

function invalidFormula(detail: string): FormulaError {
  return new FormulaError("invalidFormula", detail);
}

function assertPositiveFinite(value: number, detail: string): asserts value is number {
  if (!Number.isFinite(value) || value <= 0) throw invalidFormula(detail);
}
