import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { renderWithI18n, withI18n } from "./i18n-test-utils";
import {
  getSelectorMatches,
  intercalantOptions,
  intercalantConcentrationOptions,
  MaterialSelector
} from "../src/components/MaterialSelector";
import { materials } from "../src/data/materials";
import { getConfigurationTranslationKey } from "../src/i18n/displayLabels";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

  it("translates known generated configuration descriptions without changing scientific identifiers", async () => {
    const generated = materials.find((material) => material.material_id === "TMCC-10001");
    if (!generated) throw new Error("TMCC-10001 fixture not found");
    localStorage.setItem("tmcc-language", "zh");
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(withI18n(
        <MaterialSelector materials={materials} selectedId={generated.material_id} onSelect={() => undefined} />
      ));
    });
    const intercalatedButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "插层 TMCC/TMCDC");
    await act(async () => intercalatedButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const configurationInput = [...container.querySelectorAll("label")]
      .find((label) => label.querySelector("span")?.textContent === "构型")
      ?.querySelector("input");
    expect(configurationInput?.value).toBe("生成的 R-3m 基准构型");
    expect(configurationInput?.value).not.toContain("generated");
    expect(getConfigurationTranslationKey("config01")).toBeNull();

    await act(async () => root.unmount());
    localStorage.clear();
  });
});
