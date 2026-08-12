import { describe, expect, it } from "vitest";
import { periodicTableElements, transitionMetals } from "../src/lib/statuses";

describe("periodic table data", () => {
  it("includes the full periodic table, not only transition metals", () => {
    expect(periodicTableElements).toHaveLength(118);
    expect(periodicTableElements.some((element) => element.symbol === "H")).toBe(true);
    expect(periodicTableElements.some((element) => element.symbol === "C")).toBe(true);
    expect(periodicTableElements.some((element) => element.symbol === "Og")).toBe(true);
  });

  it("keeps transition-metal host eligibility separate from rendering all elements", () => {
    expect(transitionMetals).toContain("Nb");
    expect(transitionMetals).toContain("Ta");
    expect(transitionMetals).not.toContain("C");
  });
});
