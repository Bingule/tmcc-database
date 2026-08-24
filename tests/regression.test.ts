import { describe, expect, it } from "vitest";
import { linearRegression } from "../src/lib/regression";

describe("linearRegression", () => {
  it("fits an exact straight line", () => {
    expect(linearRegression([
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 7 }
    ])).toEqual({ slope: 2, intercept: 1, rSquared: 1, pointCount: 3 });
  });

  it("filters non-finite pairs and reports the retained point count", () => {
    const result = linearRegression([
      { x: 1, y: 3 },
      { x: Number.NaN, y: 4 },
      { x: 2, y: Number.POSITIVE_INFINITY },
      { x: 3, y: 7 }
    ]);

    expect(result).toEqual({ slope: 2, intercept: 1, rSquared: 1, pointCount: 2 });
  });

  it("returns null with fewer than two finite pairs", () => {
    expect(linearRegression([{ x: 1, y: 2 }])).toBeNull();
    expect(linearRegression([{ x: Number.NaN, y: 2 }, { x: 1, y: Number.NaN }])).toBeNull();
  });

  it("returns null when x has zero variance", () => {
    expect(linearRegression([{ x: 2, y: 1 }, { x: 2, y: 4 }, { x: 2, y: 9 }])).toBeNull();
  });

  it("assigns R squared 1 to an exact constant-y fit", () => {
    expect(linearRegression([{ x: -2, y: 4 }, { x: 0, y: 4 }, { x: 8, y: 4 }])).toEqual({
      slope: 0,
      intercept: 4,
      rSquared: 1,
      pointCount: 3
    });
  });

  it("keeps finite results for very large coordinates when the fit is finite", () => {
    const result = linearRegression([
      { x: -1e300, y: -1e300 },
      { x: 0, y: 0 },
      { x: 1e300, y: 1e300 }
    ]);

    expect(result).toEqual({ slope: 1, intercept: 0, rSquared: 1, pointCount: 3 });
    expect(Object.values(result ?? {}).every(Number.isFinite)).toBe(true);
  });

  it("returns null instead of non-finite coefficients when the fitted slope overflows", () => {
    expect(linearRegression([
      { x: 0, y: 0 },
      { x: Number.MIN_VALUE, y: Number.MAX_VALUE }
    ])).toBeNull();
  });
});
