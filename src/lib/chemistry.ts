import { atomicWeights } from "./atomicWeights";

export type FormulaErrorCode = "emptyFormula" | "unsupportedHydrate" | "unknownElement" | "invalidFormula";

export class FormulaError extends Error {
  code: FormulaErrorCode;
  detail?: string;

  constructor(code: FormulaErrorCode, detail?: string) {
    super(detail ?? code);
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
  if (containsHydrateSeparator(formula)) {
    throw new FormulaError("unsupportedHydrate", "Hydrate separators are not supported");
  }

  let cursor = 0;

  const parsePositiveCount = () => {
    if (!isDigit(formula[cursor])) return 1;

    const start = cursor;
    while (isDigit(formula[cursor])) cursor += 1;
    if (formula[cursor] === ".") {
      cursor += 1;
      if (!isDigit(formula[cursor])) throw invalidFormula("A decimal count requires digits after its decimal point");
      while (isDigit(formula[cursor])) cursor += 1;
    }

    const count = Number(formula.slice(start, cursor));
    if (!Number.isFinite(count) || count <= 0) throw invalidFormula("Element counts must be positive finite numbers");
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
    for (const [element, count] of source) {
      target.set(element, (target.get(element) ?? 0) + count * multiplier);
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
      throw invalidFormula(`Unexpected token '${token}'`);
    }

    if (itemCount === 0) throw invalidFormula("Groups cannot be empty");
    if (stopToken) {
      if (cursor >= formula.length) throw invalidFormula("Unmatched opening parenthesis");
      cursor += 1;
    }
    return group;
  };

  const parsed = parseGroup();
  if (cursor !== formula.length) throw invalidFormula(`Unexpected trailing token '${formula[cursor]}'`);
  return parsed;
}

export function calculateMolarMass(formula: string): MolarMassResult {
  const composition = parseFormula(formula);
  const elements = [...composition].map(([element, count]) => {
    const atomicWeight = atomicWeights[element];
    return { element, count, atomicWeight, mass: count * atomicWeight, massPercent: 0 };
  });
  const molarMass = elements.reduce((total, element) => total + element.mass, 0);

  return {
    formula,
    molarMass,
    elements: elements.map((element) => ({
      ...element,
      massPercent: 100 * element.mass / molarMass
    }))
  };
}

function containsHydrateSeparator(formula: string) {
  // A period is also valid inside a fractional count. The conventional ASCII
  // hydrate spelling is nevertheless unambiguous when it introduces water.
  if (/\.\d+H2O(?:$|[A-Z(])/.test(formula)) return true;
  for (let index = 0; index < formula.length; index += 1) {
    if (formula[index] === "·") return true;
    if (formula[index] !== ".") continue;
    if (!isDigit(formula[index - 1]) || !isDigit(formula[index + 1])) return true;
  }
  return false;
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
