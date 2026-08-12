import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { intercalantOptions, intercalantConcentrationOptions, MaterialSelector } from "../src/components/MaterialSelector";
import { materials } from "../src/data/materials";

describe("MaterialSelector", () => {
  it("does not render the formula preview card", () => {
    const markup = renderToStaticMarkup(
      <MaterialSelector materials={materials} selectedId="TMCC-0001" onSelect={() => undefined} />
    );

    expect(markup).not.toContain("Preview");
    expect(markup).not.toContain("formula-preview");
  });

  it("supports all intercalants and the one-third concentration option", () => {
    expect(intercalantOptions[0]).toBe("All");
    expect(intercalantOptions).toContain("Fe");
    expect(intercalantConcentrationOptions).toEqual(["All", "0.125", "0.25", "1/3", "0.5", "1"]);
  });
});
