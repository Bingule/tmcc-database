import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MaterialDetail } from "../src/components/MaterialDetail";
import { materials } from "../src/data/materials";

describe("MaterialDetail", () => {
  it("renders crystal structure beside a separate XRD and PDF panel", () => {
    const markup = renderToStaticMarkup(<MaterialDetail material={materials[0]} />);

    expect(markup).not.toContain("<h3>Overview</h3>");
    expect(markup).toContain("<h3>Crystal Structure</h3>");
    expect(markup).toContain("<h3>XRD / PDF</h3>");
    expect(markup).toContain(">CIF</a>");
    expect(markup).toContain(">POSCAR</a>");
    expect(markup).toContain("Simulated XRD");
    expect(markup).toContain("2theta min");
    expect(markup).toContain("Radiation");
    expect(markup).toContain("Wavelength (Angstrom)");
    expect(markup).toContain("Export CSV");
    expect(markup).toContain("Pair Distribution Function");
    expect(markup).toContain("r min");
    expect(markup).toContain("r max");
    expect(markup).toContain("Export PDF CSV");
    expect(markup).not.toContain("Strongest peaks");
  });

  it("renders DOS and band structure inside the XRD/PDF panel", () => {
    const markup = renderToStaticMarkup(<MaterialDetail material={materials[0]} />);

    expect(markup).not.toContain("<h3>DOS / Band Structure</h3>");
    expect(markup).toContain("Density of states");
    expect(markup).toContain("Band structure");
    expect(markup).toContain("<strong>-</strong>");
    expect(markup.indexOf("<h3>XRD / PDF</h3>")).toBeLessThan(markup.indexOf("Density of states"));
    expect(markup.indexOf("Density of states")).toBeLessThan(markup.indexOf("<h3>Thermodynamics</h3>"));
  });

  it("shows the real available calculation settings for Nb2S2C P-3m1", () => {
    const markup = renderToStaticMarkup(<MaterialDetail material={materials[0]} />);

    expect(markup).toContain("Plane-wave cutoff");
    expect(markup).toContain("520 eV");
    expect(markup).toContain("K-points");
    expect(markup).toContain("density 2.5, gamma");
    expect(markup).toContain("Calculation date");
    expect(markup).toContain("2026-08-13");
  });

  it("formats k-point density settings from rerun calculations", () => {
    const material = {
      ...materials[0],
      provenance: {
        ...materials[0].provenance,
        k_points: { density: 2.5, gamma: true }
      }
    };
    const markup = renderToStaticMarkup(<MaterialDetail material={material} />);

    expect(markup).toContain("density 2.5, gamma");
  });

  it("renders atomic sites from Nb2S2C P-3m1 structure data", () => {
    const markup = renderToStaticMarkup(<MaterialDetail material={materials[0]} />);

    expect(markup).toContain("Atomic sites");
    expect(markup).toContain("Nb1");
    expect(markup).toContain("0.66667");
    expect(markup).toContain("C1");
  });

  it("renders geometric layer thickness and vdW gap from the structure", () => {
    const markup = renderToStaticMarkup(<MaterialDetail material={materials[0]} />);

    expect(markup).toContain("Layer thickness");
    expect(markup).toContain("5.637 Å");
    expect(markup).toContain("van der Waals gap");
    expect(markup).toContain("2.91 Å");
  });

  it("renders derived crystal and normalized thermodynamic properties", () => {
    const material = {
      ...materials[0],
      thermodynamics: {
        ...materials[0].thermodynamics,
        formation_energy: { value: -1.25, unit: "eV/formula" },
        energy_above_hull: { value: 0.012, unit: "eV/atom" }
      },
      mechanical: { mechanically_stable: true }
    };
    const markup = renderToStaticMarkup(<MaterialDetail material={material} />);

    expect(markup).toContain("Cell volume (Å³)");
    expect(markup).toContain("Density (g/cm³)");
    expect(markup).toContain("E_DFT / f.u.");
    expect(markup).toContain("E_form (eV/atom)");
    expect(markup).toContain("-0.25");
    expect(markup).toContain("E_hull (eV/atom)");
    expect(markup).not.toContain("DFT total energy");
    expect(markup).toContain("Mechanical stability");
    expect(markup).toContain("Stable");
  });

  it("shows pending mechanical stability without inferring it from elastic constants", () => {
    const material = {
      ...materials[0],
      mechanical: { elastic_constants: { C11: 100 } }
    };
    const markup = renderToStaticMarkup(<MaterialDetail material={material} />);

    expect(markup).toContain("Mechanical stability");
    expect(markup).toContain("Pending");
  });

  it("shows the rhombohedral setting note for R-3m materials", () => {
    const material = materials.find((item) => item.material_id === "TMCC-0002") ?? materials[1];
    const markup = renderToStaticMarkup(<MaterialDetail material={material} />);

    expect(markup).toContain("Structure type");
    expect(markup).toContain("trigonal");
    expect(markup).toContain("Lattice setting");
    expect(markup).toContain("rhombohedral setting (hexagonal axes)");
  });

  it("reports the per-layer thickness for R-3m hexagonal cells", () => {
    const material = materials.find((item) => item.material_id === "TMCC-0002") ?? materials[1];
    const markup = renderToStaticMarkup(<MaterialDetail material={material} />);

    expect(markup).toContain("5.629");
    expect(markup).not.toContain("22.614");
  });
});
