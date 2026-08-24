import { describe, expect, it } from "vitest";
import { renderWithI18n } from "./i18n-test-utils";
import {
  getSelectorMatches,
  intercalantOptions,
  intercalantConcentrationOptions,
  MaterialSelector
} from "../src/components/MaterialSelector";
import { materials } from "../src/data/materials";

describe("MaterialSelector", () => {
  it("does not render the formula preview card", () => {
    const markup = renderWithI18n(
      <MaterialSelector materials={materials} selectedId="TMCC-0001" onSelect={() => undefined} />
    );

    expect(markup).not.toContain("Preview");
    expect(markup).not.toContain("formula-preview");
  });

  it("renders available structures as compact inline options", () => {
    const markup = renderWithI18n(
      <MaterialSelector materials={materials} selectedId="TMCC-0001" onSelect={() => undefined} />
    );

    expect(markup).toContain("structure-options compact-inline");
    expect(markup).toContain("structure-option-meta");
  });

  it("supports all intercalants and the one-third concentration option", () => {
    expect(intercalantOptions[0]).toBe("All");
    expect(intercalantOptions).toContain("Fe");
    expect(intercalantConcentrationOptions).toEqual(["All", "0.125", "0.25", "1/3", "0.5", "1"]);
  });

  it("matches intercalated materials from host and intercalant filters", () => {
    expect(getSelectorMatches(materials, "intercalated", "Nb", "S", "C", "Cu", "0.5").map((item) => item.material_id)).toEqual([
      "TMCC-0009"
    ]);
  });

  it("matches non-vdWs M2XA materials from the third selector mode", () => {
    expect(getSelectorMatches(materials, "single_chalcogen", "Nb", "S", "C").map((item) => item.material_id)).toEqual([
      "TMCC-0011",
      "TMCC-20019"
    ]);
  });
});
