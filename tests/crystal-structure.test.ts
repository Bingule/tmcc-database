import { describe, expect, it } from "vitest";
import { formatParameterGroup, parseCifStructure } from "../src/lib/crystal";

const nb2s2cCif = `
data_image0
_chemical_formula_structural       Nb2S2C
_cell_length_a       3.269
_cell_length_b       3.269
_cell_length_c       8.547
_cell_angle_alpha    90
_cell_angle_beta     90
_cell_angle_gamma    120

loop_
  _atom_site_type_symbol
  _atom_site_label
  _atom_site_symmetry_multiplicity
  _atom_site_fract_x
  _atom_site_fract_y
  _atom_site_fract_z
  _atom_site_occupancy
  Nb  Nb1       1.0  0.66667  0.33334  0.86111  1.0000
  Nb  Nb2       1.0  0.33333  0.66666  0.13889  1.0000
  S   S1        1.0  0.66666  0.33333  0.32960  1.0000
  S   S2        1.0  0.33334  0.66667  0.67040  1.0000
  C   C1        1.0  0.00000  0.00000  0.00000  1.0000
`;

describe("CIF structure parsing", () => {
  it("parses Nb2S2C cell parameters and fractional atoms", () => {
    const structure = parseCifStructure(nb2s2cCif);

    expect(structure.cell.a).toBeCloseTo(3.269);
    expect(structure.cell.gamma).toBeCloseTo(120);
    expect(structure.atoms).toHaveLength(5);
    expect(structure.atoms.map((atom) => atom.element)).toEqual(["Nb", "Nb", "S", "S", "C"]);
  });

  it("formats grouped lattice parameters without object text", () => {
    expect(
      formatParameterGroup({
        a: { value: 3.269, unit: "angstrom" },
        b: { value: 3.269, unit: "angstrom" },
        c: { value: 8.547, unit: "angstrom" }
      })
    ).toBe("a=3.269 Å, b=3.269 Å, c=8.547 Å");
  });
});

describe("crystal parameter display precision", () => {
  it("rounds floating point lattice and angle artifacts for display", () => {
    expect(
      formatParameterGroup({
        a: { value: 3.271, unit: "angstrom" },
        b: { value: 3.2709999999999995, unit: "angstrom" },
        c: { value: 25.478, unit: "angstrom" }
      })
    ).toContain("b=3.271");

    expect(
      formatParameterGroup({
        alpha: { value: 90, unit: "degree" },
        beta: { value: 90, unit: "degree" },
        gamma: { value: 119.99999999999999, unit: "degree" }
      })
    ).toContain("gamma=120");
  });
});
