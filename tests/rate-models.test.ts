import { describe, expect, it } from "vitest";
import {
  evaluateRationalRate,
} from "../src/tools/rate-performance/models/rationalCharacteristicTime";
import {
  getRateModel,
  listRateModels,
} from "../src/tools/rate-performance/models/registry";
import {
  evaluateTianRate,
  transitionRate,
} from "../src/tools/rate-performance/models/tianCharacteristicTime";
import {
  getRateReference,
  listRateReferences,
} from "../src/tools/rate-performance/references/rateReferences";

describe("Tian characteristic-time rate equation", () => {
  it("matches the published equation at representative rates", () => {
    expect(evaluateTianRate(1, { qM: 300, tau: 1, n: 1 }))
      .toBeCloseTo(300 * Math.exp(-1), 12);

    // Here (R tau)^n = 1e-4, so the equation gives about 0.9999 Q_M.
    expect(evaluateTianRate(1e-8, { qM: 300, tau: 1, n: 0.5 }))
      .toBeCloseTo(299.97, 10);
  });

  it("approaches Q_M in the low-rate limit", () => {
    expect(evaluateTianRate(1e-24, { qM: 300, tau: 1, n: 0.5 }))
      .toBeCloseTo(300, 8);
  });

  it("uses the published transition-rate definition", () => {
    expect(transitionRate({ tau: 2, n: 0.5 })).toBeCloseTo(0.125, 12);
    expect(transitionRate({ tau: 4, n: 1 })).toBeCloseTo(0.125, 12);
  });

  it("retains the high-rate Q_M (R tau)^(-n) / 2 asymptote", () => {
    const rate = 1e12;
    const parameters = { qM: 300, tau: 1, n: 0.5 };
    const approximation = parameters.qM * Math.pow(rate * parameters.tau, -parameters.n) / 2;
    const evaluated = evaluateTianRate(rate, parameters);

    expect(evaluated / approximation).toBeCloseTo(1, 6);
  });

  it("stays finite across extreme positive R tau", () => {
    const parameters = { qM: 300, tau: 1, n: 0.5 };
    const values = [
      evaluateTianRate(Number.MIN_VALUE, parameters),
      evaluateTianRate(Number.MAX_VALUE, parameters),
    ];

    expect(values.every(Number.isFinite)).toBe(true);
    expect(values.every((value) => value >= 0 && value <= parameters.qM)).toBe(true);
  });

  it("does not underflow a representable capacity when x rounds to the smallest subnormal", () => {
    const parameters = {
      qM: Number.MAX_VALUE,
      tau: 1,
      n: 1.048828125,
    };
    const evaluated = evaluateTianRate(Number.MAX_VALUE, parameters);
    const logHighRateApproximation = Math.log(parameters.qM)
      - parameters.n * Math.log(Number.MAX_VALUE)
      - Math.LN2;
    const approximation = Math.exp(logHighRateApproximation);

    expect(Number.isFinite(evaluated)).toBe(true);
    expect(evaluated).toBeGreaterThan(0);
    expect(evaluated / approximation).toBeCloseTo(1, 12);
  });

  it.each([
    [0, { qM: 300, tau: 1, n: 0.5 }],
    [-1, { qM: 300, tau: 1, n: 0.5 }],
    [Number.POSITIVE_INFINITY, { qM: 300, tau: 1, n: 0.5 }],
    [1, { qM: 0, tau: 1, n: 0.5 }],
    [1, { qM: 300, tau: 0, n: 0.5 }],
    [1, { qM: 300, tau: 1, n: Number.NaN }],
  ])("rejects invalid rate or parameters (%s, %o)", (rate, parameters) => {
    expect(() => evaluateTianRate(rate, parameters)).toThrow(RangeError);
  });

  it("rejects a transition rate below the representable positive range", () => {
    expect(() => transitionRate({ tau: 1, n: Number.MIN_VALUE }))
      .toThrow(RangeError);
  });
});

describe("rational characteristic-time rate equation", () => {
  it("matches Q = Q_M / [1 + 2 (R tau)^n]", () => {
    expect(evaluateRationalRate(1, { qM: 300, tau: 1, n: 1 })).toBeCloseTo(100, 12);
  });

  it("has stable finite low- and high-rate limits", () => {
    const parameters = { qM: 300, tau: 1, n: 0.5 };
    const lowRate = evaluateRationalRate(Number.MIN_VALUE, parameters);
    const highRate = evaluateRationalRate(Number.MAX_VALUE, parameters);

    expect(lowRate).toBe(300);
    expect(Number.isFinite(highRate)).toBe(true);
    expect(highRate).toBeGreaterThanOrEqual(0);
    expect(highRate).toBeLessThan(lowRate);
  });

  it("retains the high-rate Q_M / [2 (R tau)^n] asymptote", () => {
    const rate = 1e12;
    const parameters = { qM: 300, tau: 1, n: 0.5 };
    const approximation = parameters.qM / (2 * Math.pow(rate * parameters.tau, parameters.n));
    const evaluated = evaluateRationalRate(rate, parameters);

    expect(evaluated / approximation).toBeCloseTo(1, 6);
  });

  it.each([
    [Number.NaN, { qM: 300, tau: 1, n: 0.5 }],
    [1, { qM: -1, tau: 1, n: 0.5 }],
    [1, { qM: 300, tau: Number.POSITIVE_INFINITY, n: 0.5 }],
    [1, { qM: 300, tau: 1, n: 0 }],
  ])("rejects invalid rate or parameters (%s, %o)", (rate, parameters) => {
    expect(() => evaluateRationalRate(rate, parameters)).toThrow(RangeError);
  });
});

describe("rate-model registry validation gate", () => {
  it("registers only the two literature-validated equations as executable", () => {
    const validated = listRateModels().filter((model) => model.status === "validated");

    expect(validated.map((model) => model.id)).toEqual([
      "tian-characteristic-time",
      "rational-characteristic-time",
    ]);
    expect(validated.every((model) => typeof model.fit === "function")).toBe(true);
    expect(getRateModel("tian-characteristic-time")?.fit?.(1, {
      qM: 300,
      tau: 1,
      n: 1,
    })).toBeCloseTo(300 * Math.exp(-1), 12);
  });

  it("keeps every unverified equation pending and non-executable", () => {
    const pending = listRateModels().filter((model) => model.status === "pending-validation");

    expect(pending.map((model) => model.id)).toEqual([
      "peukert-type",
      "exponential",
      "power-law",
      "wong-type",
      "heubner-type",
    ]);
    expect(pending.every((model) => model.fit === undefined)).toBe(true);
    expect(pending.every((model) => model.validationNote.length > 0)).toBe(true);
  });

  it("centralizes equations, parameter provenance, assumptions, limitations, and references", () => {
    for (const model of listRateModels()) {
      expect(model.equation.length).toBeGreaterThan(0);
      expect(model.assumptions.length).toBeGreaterThan(0);
      expect(model.limitations.length).toBeGreaterThan(0);
    }

    for (const id of ["tian-characteristic-time", "rational-characteristic-time"] as const) {
      const model = getRateModel(id);
      expect(model?.independentVariable.symbol).toBe("R");
      expect(model?.parameters.map((parameter) => [parameter.id, parameter.type])).toEqual([
        ["qM", "fitted"],
        ["tau", "fitted"],
        ["n", "fitted"],
      ]);
      expect(model?.parameters.every((parameter) => parameter.unit.length > 0)).toBe(true);
      expect(model?.referenceIds.length).toBeGreaterThan(0);
    }

    expect(getRateModel("not-a-model")).toBeUndefined();
  });

  it("limits the rational model to the first capacity-decay plateau", () => {
    const limitations = getRateModel("rational-characteristic-time")?.limitations.join(" ") ?? "";

    expect(limitations).toContain("conventional capacity plateau");
    expect(limitations).toContain("first capacity-decay regime");
    expect(limitations).toContain("second high-rate decay");
    expect(limitations).toContain("two-term model");
  });
});

describe("verified rate references", () => {
  it("contains complete verified metadata for every approved DOI record", () => {
    expect(listRateReferences()).toEqual([
      {
        id: "tian-2019-rate-performance",
        authors: [
          "Ruiyuan Tian",
          "Sang-Hoon Park",
          "Paul J. King",
          "Graeme Cunningham",
          "João Coelho",
          "Valeria Nicolosi",
          "Jonathan N. Coleman",
        ],
        title: "Quantifying the factors limiting rate performance in battery electrodes",
        journal: "Nature Communications",
        year: 2019,
        volume: "10",
        articleNumber: "1933",
        doi: "10.1038/s41467-019-09792-9",
        url: "https://doi.org/10.1038/s41467-019-09792-9",
        role: "primary-model-source",
      },
      {
        id: "tian-2020-chronoamperometry",
        authors: [
          "Ruiyuan Tian",
          "Paul J. King",
          "João Coelho",
          "Sang-Hoon Park",
          "Dominik V. Horvath",
          "Valeria Nicolosi",
          "Colm O'Dwyer",
          "Jonathan N. Coleman",
        ],
        title: "Using chronoamperometry to rapidly measure and quantitatively analyse rate-performance in battery electrodes",
        journal: "Journal of Power Sources",
        year: 2020,
        volume: "468",
        articleNumber: "228220",
        doi: "10.1016/j.jpowsour.2020.228220",
        url: "https://doi.org/10.1016/j.jpowsour.2020.228220",
        role: "primary-model-source",
      },
      {
        id: "coleman-tian-2020-model-review",
        authors: ["Jonathan N. Coleman", "Ruiyuan Tian"],
        title: "Developing models to fit capacity–rate data in battery systems",
        journal: "Current Opinion in Electrochemistry",
        year: 2020,
        volume: "21",
        pages: "1-6",
        doi: "10.1016/j.coelec.2019.12.003",
        url: "https://doi.org/10.1016/j.coelec.2019.12.003",
        role: "review",
      },
      {
        id: "heubner-2018-master-curve",
        authors: [
          "C. Heubner",
          "J. Seeba",
          "T. Liebmann",
          "A. Nickol",
          "S. Börner",
          "M. Fritsch",
          "K. Nikolowski",
          "M. Wolter",
          "M. Schneider",
          "A. Michaelis",
        ],
        title: "Semi-empirical master curve concept describing the rate capability of lithium insertion electrodes",
        journal: "Journal of Power Sources",
        year: 2018,
        volume: "380",
        pages: "83-91",
        doi: "10.1016/j.jpowsour.2018.01.077",
        url: "https://doi.org/10.1016/j.jpowsour.2018.01.077",
        role: "candidate-model-source",
      },
      {
        id: "heubner-2018-chronoamperometry",
        authors: [
          "C. Heubner",
          "C. Lämmel",
          "A. Nickol",
          "T. Liebmann",
          "M. Schneider",
          "A. Michaelis",
        ],
        title: "Comparison of chronoamperometric response and rate-performance of porous insertion electrodes: Towards an accelerated rate capability test",
        journal: "Journal of Power Sources",
        year: 2018,
        volume: "397",
        pages: "11-15",
        doi: "10.1016/j.jpowsour.2018.06.087",
        url: "https://doi.org/10.1016/j.jpowsour.2018.06.087",
        role: "chronoamperometry-context",
      },
    ]);
  });

  it("keeps candidate Heubner provenance distinct from validated equations", () => {
    expect(getRateModel("heubner-type")).toMatchObject({
      status: "pending-validation",
      referenceIds: ["heubner-2018-master-curve"],
    });
    expect(getRateModel("heubner-type")?.fit).toBeUndefined();
    expect(getRateReference("heubner-2018-chronoamperometry")?.doi)
      .toBe("10.1016/j.jpowsour.2018.06.087");
  });
});
