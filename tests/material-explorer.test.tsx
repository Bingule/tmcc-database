import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { MaterialExplorer } from "../src/components/MaterialExplorer";
import type { MaterialRecord } from "../src/lib/types";
import { renderWithI18n, withI18n } from "./i18n-test-utils";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const baseMaterial = {
  family: "TMCC",
  material_type: "pristine",
  subclass: "TMCDC",
  structure_type: "M2X2C",
  experimental_status: null,
  calculation_status: "not_calculated",
  host: { formula: "Nb2S2C", metal: "Nb", chalcogen: "S", anion: "C" },
  intercalation: null,
  structure: { crystal_system: "trigonal", space_group_symbol: "P-3m1" },
  thermodynamics: {},
  phonons: {},
  mechanical: {},
  electronic: {},
  energy_storage: {},
  files: {},
  provenance: {}
} satisfies Partial<MaterialRecord>;

function makeMaterials(count: number): MaterialRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return {
      ...baseMaterial,
      material_id: `TMCC-${String(number).padStart(4, "0")}`,
      slug: `nb2s2c-test-${number}`,
      formula: "Nb2S2C"
    } as MaterialRecord;
  });
}

function countRows(markup: string) {
  return (markup.match(/<tr/g) ?? []).length - 1;
}

describe("MaterialExplorer", () => {
  it("paginates default materials without an ellipsis row", () => {
    const markup = renderWithI18n(
      <MaterialExplorer
        materials={makeMaterials(12)}
        selectedId="TMCC-0001"
        onSelect={() => undefined}
        elementSearch={{ elements: [], mode: "only" }}
      />
    );

    expect(countRows(markup)).toBe(10);
    expect(markup).toContain("TMCC-0010");
    expect(markup).not.toContain("TMCC-0011");
    expect(markup).not.toContain(".....");
    expect(markup).toContain("Rows per page");
    expect(markup).not.toContain(">5</button>");
    expect(markup).toContain("<button type=\"button\" class=\"active\">10</button>");
    expect(markup).toContain("<button type=\"button\" class=\"\">20</button>");
    expect(markup).toContain("<button type=\"button\" class=\"\">50</button>");
  });

  it("shows the next page of materials when requested", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(withI18n(
        <MaterialExplorer
          materials={makeMaterials(12)}
          selectedId="TMCC-0001"
          onSelect={() => undefined}
          elementSearch={{ elements: [], mode: "only" }}
        />
      ));
    });

    expect(container.textContent).toContain("TMCC-0010");
    expect(container.textContent).not.toContain("TMCC-0011");

    const nextButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Next");
    await act(async () => {
      nextButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("TMCC-0011");
    expect(container.textContent).toContain("TMCC-0012");
    expect(container.textContent).not.toContain("TMCC-0010");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("sorts table rows by a clicked column header and toggles direction", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const materials = [
      {
        ...baseMaterial,
        material_id: "TMCC-0001",
        slug: "zr2te2c-p-3m1",
        formula: "Zr2Te2C"
      },
      {
        ...baseMaterial,
        material_id: "TMCC-0002",
        slug: "hf2te2c-p-3m1",
        formula: "Hf2Te2C"
      },
      {
        ...baseMaterial,
        material_id: "TMCC-0003",
        slug: "nb2s2c-p-3m1",
        formula: "Nb2S2C"
      }
    ] as MaterialRecord[];

    await act(async () => {
      root.render(withI18n(
        <MaterialExplorer
          materials={materials}
          selectedId="TMCC-0001"
          onSelect={() => undefined}
          elementSearch={{ elements: [], mode: "only" }}
        />
      ));
    });

    const firstMaterialId = () => container.querySelector("tbody tr td button")?.textContent;
    expect(firstMaterialId()).toBe("TMCC-0001");

    const formulaHeader = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Formula"));
    await act(async () => {
      formulaHeader?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(firstMaterialId()).toBe("TMCC-0002");

    await act(async () => {
      formulaHeader?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(firstMaterialId()).toBe("TMCC-0001");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("uses pagination for matching materials after an element-table search", () => {
    const markup = renderWithI18n(
      <MaterialExplorer
        materials={makeMaterials(12)}
        selectedId="TMCC-0001"
        onSelect={() => undefined}
        elementSearch={{ elements: ["C"], mode: "at_least" }}
      />
    );

    expect(countRows(markup)).toBe(10);
    expect(markup).not.toContain("TMCC-0012");
  });

  it("asks for a more specific element search when more than 1000 records match", () => {
    const markup = renderWithI18n(
      <MaterialExplorer
        materials={makeMaterials(1001)}
        selectedId="TMCC-0001"
        onSelect={() => undefined}
        elementSearch={{ elements: ["Nb"], mode: "only" }}
      />
    );

    expect(markup).toContain("More than 1000 matching materials");
    expect(markup).toContain("Please add more elements or filters");
    expect(markup).not.toContain("materials-table");
    expect(markup).not.toContain("<td><button");
  });

  it("renders long property units on a separate header line", () => {
    const markup = renderWithI18n(
      <MaterialExplorer
        materials={makeMaterials(1)}
        selectedId="TMCC-0001"
        onSelect={() => undefined}
        elementSearch={{ elements: [], mode: "only" }}
      />
    );

    expect(markup).toContain("<span class=\"column-heading-text\"><span>E_DFT</span><small class=\"column-unit\">eV/f.u.</small></span>");
    expect(markup).toContain("<span class=\"column-heading-text\"><span>E_form</span><small class=\"column-unit\">eV/atom</small></span>");
    expect(markup).toContain("<span>Mech. Stab.</span>");
    expect(markup).not.toContain("<span>E_hull</span>");
    expect(markup).not.toContain("<span>Phonon</span>");
    expect(markup).toContain("<span class=\"column-heading-text\"><span>Band Gap</span><small class=\"column-unit\">eV</small></span>");
  });

  it("links calculated mechanical stability and leaves pending results as text", () => {
    const stableMaterial = {
      ...baseMaterial,
      material_id: "TMCC-0001",
      slug: "nb2s2c-p-3m1",
      formula: "Nb2S2C",
      mechanical: { mechanically_stable: true }
    } as MaterialRecord;
    const pendingMaterial = {
      ...baseMaterial,
      material_id: "TMCC-0002",
      slug: "nb2s2c-r-3m",
      formula: "Nb2S2C",
      mechanical: {}
    } as MaterialRecord;
    const markup = renderWithI18n(
      <MaterialExplorer
        materials={[stableMaterial, pendingMaterial]}
        selectedId="TMCC-0001"
        onSelect={() => undefined}
        elementSearch={{ elements: [], mode: "only" }}
      />
    );

    expect(markup).toContain('href="/?material=nb2s2c-p-3m1#mechanical-properties">Stable</a>');
    expect(markup).toContain("<td>Pending</td>");
    expect(markup).not.toContain('href="/?material=nb2s2c-r-3m#mechanical-properties"');
  });

  it("shows DFT energy per formula unit and dashes for missing table values", () => {
    const markup = renderWithI18n(
      <MaterialExplorer
        materials={[
          {
            ...baseMaterial,
            material_id: "TMCC-0001",
            slug: "nb2s2c-p-3m1",
            formula: "Nb2S2C",
            structure: {
              ...baseMaterial.structure,
              atomic_sites: [{}, {}, {}, {}, {}]
            },
            thermodynamics: {
              total_energy: { value: -42.63717309249796, unit: "eV/cell" },
              formation_energy: { value: -1.25, unit: "eV/formula" },
              energy_above_hull: { value: null, unit: "eV/atom" }
            },
            electronic: { band_gap: { value: null, unit: "eV" } }
          } as MaterialRecord
        ]}
        selectedId="TMCC-0001"
        onSelect={() => undefined}
        elementSearch={{ elements: [], mode: "only" }}
      />
    );

    expect(markup).toContain("-42.637173");
    expect(markup).toContain("-0.25");
    expect(markup).toContain("<td>-</td>");
    expect(markup).not.toContain("Not calculated");
  });

  it("labels sites as sites per cell", () => {
    const markup = renderWithI18n(
      <MaterialExplorer
        materials={makeMaterials(1)}
        selectedId="TMCC-0001"
        onSelect={() => undefined}
        elementSearch={{ elements: [], mode: "only" }}
      />
    );

    expect(markup).toContain("<span>Sites/cell</span>");
  });

  it("shows structure type and TMCC subclass columns", () => {
    const markup = renderWithI18n(
      <MaterialExplorer
        materials={makeMaterials(1)}
        selectedId="TMCC-0001"
        onSelect={() => undefined}
        elementSearch={{ elements: [], mode: "only" }}
      />
    );

    expect(markup).toContain("<span>Structure Type</span>");
    expect(markup).toContain("<span>Subclass</span>");
    expect(markup).toContain("<td><span class=\"cell-stack\"><span>trigonal</span></span></td>");
    expect(markup).toContain("<td>TMCDC</td>");
    expect(markup).toContain("<span>Intercalant</span>");
  });

  it("filters rows by the summary-card category selection", () => {
    const materials = [
      {
        ...baseMaterial,
        material_id: "TMCC-0001",
        slug: "nb2s2c-p-3m1",
        formula: "Nb2S2C",
        subclass: "TMCDC",
        material_type: "pristine"
      },
      {
        ...baseMaterial,
        material_id: "TMCC-0009",
        slug: "cu0-5-nb2s2c-p-3m1",
        formula: "Cu0.5Nb2S2C",
        subclass: "TMCDC",
        material_type: "tm_intercalated",
        intercalation: { intercalant: "Cu" }
      },
      {
        ...baseMaterial,
        material_id: "TMCC-0011",
        slug: "nb2cs-p63mmc",
        formula: "Nb2CS",
        subclass: "TMCC",
        material_type: "m2xa",
        structure_type: "M2XA"
      }
    ] as MaterialRecord[];

    const markup = renderWithI18n(
      <MaterialExplorer
        materials={materials}
        selectedId="TMCC-0001"
        onSelect={() => undefined}
        elementSearch={{ elements: [], mode: "only" }}
        categoryFilter="intercalated"
      />
    );

    expect(markup).toContain("<span>Category</span>");
    expect(markup).toContain("Intercalated TMCC/TMCDC");
    const tableBody = markup.match(/<tbody>(.*)<\/tbody>/s)?.[1] ?? "";
    expect(tableBody).toContain("TMCC-0009");
    expect(tableBody).not.toContain("TMCC-0001");
    expect(tableBody).not.toContain("TMCC-0011");
  });

  it("uses a scoped class for materials-table alignment", () => {
    const markup = renderWithI18n(
      <MaterialExplorer
        materials={makeMaterials(1)}
        selectedId="TMCC-0001"
        onSelect={() => undefined}
        elementSearch={{ elements: [], mode: "only" }}
      />
    );

    expect(markup).toContain("<table class=\"materials-table\">");
  });

  it("shows pristine atomic site count per cell in the Sites/cell column", () => {
    const markup = renderWithI18n(
      <MaterialExplorer
        materials={[
          {
            ...baseMaterial,
            material_id: "TMCC-0001",
            slug: "nb2s2c-p-3m1",
            formula: "Nb2S2C",
            structure: {
              ...baseMaterial.structure,
              atomic_sites: [
                { label: "Nb1", element: "Nb" },
                { label: "Nb2", element: "Nb" },
                { label: "S1", element: "S" },
                { label: "S2", element: "S" },
                { label: "C1", element: "C" }
              ]
            }
          } as MaterialRecord
        ]}
        selectedId="TMCC-0001"
        onSelect={() => undefined}
        elementSearch={{ elements: [], mode: "only" }}
      />
    );

    expect(markup).toContain("<td>5</td>");
    expect(markup).not.toContain("Nb1, Nb2, S1, S2, C1");
  });

  it("keeps R-3m entries as separate TMCDC structural records", () => {
    const markup = renderWithI18n(
      <MaterialExplorer
        materials={[
          {
            ...baseMaterial,
            material_id: "TMCC-0002",
            slug: "nb2s2c-r-3m",
            formula: "Nb2S2C",
            structure: {
              ...baseMaterial.structure,
              space_group_symbol: "R-3m"
            }
          } as MaterialRecord
        ]}
        selectedId="TMCC-0002"
        onSelect={() => undefined}
        elementSearch={{ elements: [], mode: "only" }}
      />
    );

    expect(markup).toContain("R3\u0305m");
    expect(markup).toContain("trigonal");
    expect(markup).toContain("rhombohedral setting");
    expect(markup).not.toContain("rhombohedral setting (hexagonal axes)");
    expect(markup).toContain("TMCDC");
    expect(markup).not.toContain("2H");
    expect(markup).not.toContain("3R");
  });
});
