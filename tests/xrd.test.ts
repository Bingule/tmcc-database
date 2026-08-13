import { describe, expect, it } from "vitest";
import { chartDimensions, clampWavelength, makeAxisTicks } from "../src/components/XrdViewer";
import { parseCifStructure } from "../src/lib/crystal";
import { exportPairDistributionCsv, exportXrdCsv, simulatePairDistribution, simulateXrdPattern } from "../src/lib/xrd";

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

describe("XRD simulation", () => {
  it("generates normalized powder peaks from parsed CIF structure", () => {
    const structure = parseCifStructure(nb2s2cCif);
    const pattern = simulateXrdPattern(structure, {
      wavelength: 1.5406,
      minTwoTheta: 5,
      maxTwoTheta: 80
    });

    expect(pattern.peaks.length).toBeGreaterThan(0);
    expect(pattern.points.length).toBeGreaterThan(100);
    expect(Math.max(...pattern.peaks.map((peak) => peak.intensity))).toBeCloseTo(100);
    expect(pattern.peaks.every((peak) => peak.twoTheta >= 5 && peak.twoTheta <= 80)).toBe(true);
  });

  it("exports simulated pattern points as CSV", () => {
    const structure = parseCifStructure(nb2s2cCif);
    const pattern = simulateXrdPattern(structure, {
      wavelength: 1.5406,
      minTwoTheta: 10,
      maxTwoTheta: 20
    });

    const csv = exportXrdCsv(pattern.points);

    expect(csv.startsWith("two_theta_deg,intensity")).toBe(true);
    expect(csv.split("\n").length).toBe(pattern.points.length + 1);
  });

  it("generates a pair distribution function tied to wavelength and two-theta range", () => {
    const structure = parseCifStructure(nb2s2cCif);
    const pdf = simulatePairDistribution(structure, {
      wavelength: 1.5406,
      minTwoTheta: 5,
      maxTwoTheta: 90,
      rMin: 1,
      rMax: 8
    });

    expect(pdf.length).toBeGreaterThan(100);
    expect(pdf[0].r).toBeGreaterThanOrEqual(1);
    expect(pdf[pdf.length - 1].r).toBeLessThanOrEqual(8);
    expect(Math.max(...pdf.map((point) => point.intensity))).toBeCloseTo(100);
    expect(Math.min(...pdf.map((point) => point.intensity))).toBeLessThan(0);
  });

  it("exports pair distribution points as CSV", () => {
    const structure = parseCifStructure(nb2s2cCif);
    const pdf = simulatePairDistribution(structure, {
      wavelength: 1.5406,
      minTwoTheta: 5,
      maxTwoTheta: 90,
      rMin: 0,
      rMax: 4
    });

    const csv = exportPairDistributionCsv(pdf);

    expect(csv.startsWith("r_angstrom,G_r_reduced")).toBe(true);
    expect(csv.split("\n").length).toBe(pdf.length + 1);
  });

  it("uses taller chart dimensions and denser x-axis ticks", () => {
    expect(chartDimensions.standard.height).toBe(270);
    expect(chartDimensions.compact.height).toBe(225);
    expect(makeAxisTicks(5, 90).length).toBeGreaterThanOrEqual(7);
  });

  it("accepts synchrotron-style short custom XRD wavelengths inside the viewer range", () => {
    expect(clampWavelength(0.1609)).toBe(0.1609);
    expect(clampWavelength(0.01)).toBe(0.05);
    expect(clampWavelength(1.2345)).toBe(1.2345);
    expect(clampWavelength(3.1)).toBe(2.5);
  });
});
