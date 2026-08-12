import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { MaterialExplorer } from "../src/components/MaterialExplorer";
import type { MaterialRecord } from "../src/lib/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const baseMaterial = {
  family: "TMCC",
  material_type: "pristine",
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
    const markup = renderToStaticMarkup(
      <MaterialExplorer
        materials={makeMaterials(12)}
        selectedId="TMCC-0001"
        onSelect={() => undefined}
        elementSearch={{ elements: [], mode: "only" }}
      />
    );

    expect(countRows(markup)).toBe(5);
    expect(markup).toContain("TMCC-0005");
    expect(markup).not.toContain("TMCC-0006");
    expect(markup).not.toContain(".....");
    expect(markup).toContain("Rows per page");
    expect(markup).toContain("<button type=\"button\" class=\"active\">5</button>");
    expect(markup).toContain("<button type=\"button\" class=\"\">10</button>");
    expect(markup).toContain("<button type=\"button\" class=\"\">20</button>");
    expect(markup).toContain("<button type=\"button\" class=\"\">50</button>");
  });

  it("shows the next page of materials when requested", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MaterialExplorer
          materials={makeMaterials(12)}
          selectedId="TMCC-0001"
          onSelect={() => undefined}
          elementSearch={{ elements: [], mode: "only" }}
        />
      );
    });

    expect(container.textContent).toContain("TMCC-0005");
    expect(container.textContent).not.toContain("TMCC-0006");

    const nextButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Next");
    await act(async () => {
      nextButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("TMCC-0006");
    expect(container.textContent).toContain("TMCC-0010");
    expect(container.textContent).not.toContain("TMCC-0005");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("uses pagination for matching materials after an element-table search", () => {
    const markup = renderToStaticMarkup(
      <MaterialExplorer
        materials={makeMaterials(12)}
        selectedId="TMCC-0001"
        onSelect={() => undefined}
        elementSearch={{ elements: ["C"], mode: "at_least" }}
      />
    );

    expect(countRows(markup)).toBe(5);
    expect(markup).not.toContain("TMCC-0012");
  });

  it("renders long property units on a separate header line", () => {
    const markup = renderToStaticMarkup(
      <MaterialExplorer
        materials={makeMaterials(1)}
        selectedId="TMCC-0001"
        onSelect={() => undefined}
        elementSearch={{ elements: [], mode: "only" }}
      />
    );

    expect(markup).toContain("<span>DFT Energy</span><small class=\"column-unit\">eV/f.u.</small>");
    expect(markup).toContain("<span>Formation Energy</span><small class=\"column-unit\">eV/formula</small>");
    expect(markup).toContain("<span>Energy Above Hull</span><small class=\"column-unit\">eV/atom</small>");
    expect(markup).toContain("<span>Band Gap</span><small class=\"column-unit\">eV</small>");
  });

  it("shows DFT energy per formula unit and dashes for missing table values", () => {
    const markup = renderToStaticMarkup(
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
              formation_energy: { value: null, unit: "eV/formula" }
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
    expect(markup).toContain("<td>-</td>");
    expect(markup).not.toContain("Not calculated");
  });

  it("labels sites as sites per cell", () => {
    const markup = renderToStaticMarkup(
      <MaterialExplorer
        materials={makeMaterials(1)}
        selectedId="TMCC-0001"
        onSelect={() => undefined}
        elementSearch={{ elements: [], mode: "only" }}
      />
    );

    expect(markup).toContain("<th>Sites/cell</th>");
  });

  it("uses a scoped class for materials-table alignment", () => {
    const markup = renderToStaticMarkup(
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
    const markup = renderToStaticMarkup(
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
});
