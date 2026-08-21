import { describe, expect, it } from "vitest";
import {
  filterMaterialsByElementSet,
  formatPropertyValue,
  formatFormulaParts,
  getSpaceGroupLabel,
  getElementsFromFormula,
  getLatticeSettingLabel,
  getCellVolume,
  getDensity,
  getFormationEnergyPerAtom,
  getMechanicalStabilityLabel,
  getMaterialStats,
  getUnavailableLabel,
  makeIntercalatedFormula,
  makePristineFormula,
  makeSingleChalcogenFormula,
  findMaterialsByComposition,
  makeElectronicDownloadFilename,
  makeStructureDownloadFilename
} from "../src/lib/materials";
import type { MaterialRecord } from "../src/lib/types";

const baseMaterial = {
  family: "TMCC",
  subclass: "TMCDC",
  structure_type: "M2X2C",
  experimental_status: null,
  calculation_status: "not_calculated",
  structure: {},
  thermodynamics: {},
  phonons: {},
  mechanical: {},
  electronic: {},
  energy_storage: {},
  files: {},
  provenance: {}
} satisfies Partial<MaterialRecord>;

describe("formula formatting", () => {
  it("splits formula digits and decimal concentrations into subscript parts", () => {
    expect(formatFormulaParts("V0.25Nb2S2C")).toEqual([
      { text: "V", subscript: false },
      { text: "0.25", subscript: true },
      { text: "Nb", subscript: false },
      { text: "2", subscript: true },
      { text: "S", subscript: false },
      { text: "2", subscript: true },
      { text: "C", subscript: false }
    ]);
  });
});

describe("missing value labels", () => {
  it("distinguishes null scientific values from unavailable files", () => {
    expect(getUnavailableLabel(null, "scientific")).toBe("-");
    expect(getUnavailableLabel(null, "file")).toBe("Not available");
    expect(getUnavailableLabel(0, "scientific")).toBe("0");
  });

  it("formats unit-value objects without rendering object text", () => {
    expect(formatPropertyValue({ value: -0.42, unit: "eV/formula" })).toBe("-0.42");
    expect(formatPropertyValue({ value: null, unit: "eV/atom" })).toBe("-");
    expect(formatPropertyValue(undefined)).toBe("-");
  });
});

describe("derived material properties", () => {
  const material = {
    ...baseMaterial,
    material_id: "TMCC-9999",
    slug: "c-test-cell",
    material_type: "pristine",
    formula: "C",
    host: { formula: "C", metal: "Nb", chalcogen: "S", anion: "C" },
    intercalation: null,
    structure: {
      lattice_parameters: {
        a: { value: 2, unit: "angstrom" },
        b: { value: 2, unit: "angstrom" },
        c: { value: 2, unit: "angstrom" }
      },
      angles: {
        alpha: { value: 90, unit: "degree" },
        beta: { value: 90, unit: "degree" },
        gamma: { value: 90, unit: "degree" }
      },
      atomic_sites: [{ element: "C", occupancy: 1 }]
    },
    thermodynamics: {
      formation_energy: { value: -2, unit: "eV/formula" }
    }
  } as MaterialRecord;

  it("computes cell volume and density from the final cell and atomic sites", () => {
    expect(getCellVolume(material)).toBeCloseTo(8);
    expect(getDensity(material)).toBeCloseTo(2.493, 3);
  });

  it("normalizes formation energy to eV per atom", () => {
    expect(getFormationEnergyPerAtom(material)).toBe(-2);
  });

  it("keeps mechanical stability tri-state and independent of elastic constants", () => {
    expect(getMechanicalStabilityLabel({ ...material, mechanical: { mechanically_stable: true } })).toBe("Stable");
    expect(getMechanicalStabilityLabel({ ...material, mechanical: { mechanically_stable: false } })).toBe("Unstable");
    expect(getMechanicalStabilityLabel({ ...material, mechanical: { elastic_constants: { C11: 100 } } })).toBe("Pending");
  });
});

describe("element search", () => {
  it("matches materials that contain any selected subset of elements", () => {
    const materials: MaterialRecord[] = [
      {
        ...baseMaterial,
        material_id: "TMCC-0001",
        slug: "nb2s2c-p-3m1",
        material_type: "pristine",
        formula: "Nb2S2C",
        host: { formula: "Nb2S2C", metal: "Nb", chalcogen: "S", anion: "C" },
        intercalation: null
      } as MaterialRecord,
      {
        ...baseMaterial,
        material_id: "TMCC-0011",
        slug: "nb2sc-p63mmc",
        material_type: "m2xa",
        subclass: "TMCC",
        structure_type: "M2XA",
        formula: "Nb2SC",
        host: { formula: "Nb2SC", metal: "Nb", chalcogen: "S", anion: "C" },
        intercalation: null
      } as MaterialRecord,
      {
        ...baseMaterial,
        material_id: "TMCC-0021",
        slug: "ta2te2n-p-3m1",
        material_type: "pristine",
        formula: "Ta2Te2N",
        host: { formula: "Ta2Te2N", metal: "Ta", chalcogen: "Te", anion: "N" },
        intercalation: null
      } as MaterialRecord
    ];

    expect(filterMaterialsByElementSet(materials, ["Nb"], "only").map((item) => item.material_id)).toEqual([
      "TMCC-0001",
      "TMCC-0011"
    ]);
    expect(filterMaterialsByElementSet(materials, ["Nb", "S"], "only").map((item) => item.material_id)).toEqual([
      "TMCC-0001",
      "TMCC-0011"
    ]);
    expect(filterMaterialsByElementSet(materials, ["Nb", "S", "C"], "only").map((item) => item.material_id)).toEqual([
      "TMCC-0001",
      "TMCC-0011"
    ]);
  });
});

describe("database statistics", () => {
  it("calculates record counts from materials rather than constants", () => {
    const materials: MaterialRecord[] = [
      {
        ...baseMaterial,
        material_id: "TMCC-0001",
        slug: "nb2s2c-p-3m1",
        material_type: "pristine",
        formula: "Nb2S2C",
        host: { formula: "Nb2S2C", metal: "Nb", chalcogen: "S", anion: "C" },
        intercalation: null
      } as MaterialRecord,
      {
        ...baseMaterial,
        material_id: "TMCC-0009",
        slug: "v0-25-nb2s2c-fe-config01",
        material_type: "tm_intercalated",
        formula: "V0.25Nb2S2C",
        host: { formula: "Nb2S2C", metal: "Nb", chalcogen: "S", anion: "C" },
        intercalation: {
          intercalant: "V",
          x: 0.25,
          mode: "hetero",
          site: null,
          ordering: null,
          configuration: "config01"
        }
      } as MaterialRecord,
      {
        ...baseMaterial,
        material_id: "TMCC-0011",
        slug: "nb2sc-p63mmc",
        material_type: "m2xa",
        subclass: "TMCC",
        structure_type: "M2XA",
        formula: "Nb2SC",
        host: { formula: "Nb2SC", metal: "Nb", chalcogen: "S", anion: "C" },
        intercalation: null
      } as MaterialRecord
    ];

    expect(getMaterialStats(materials)).toMatchObject({
      totalCompositions: 3,
      totalStructures: 3,
      tmcdc: 1,
      intercalatedTmcc: 1,
      nonVdwsM2xa: 1,
      calculationsInProgress: 0
    });
  });
});

describe("structure identity", () => {
  it("finds all structures for a composition without using stacking", () => {
    const materials: MaterialRecord[] = [
      {
        ...baseMaterial,
        material_id: "TMCC-0001",
        slug: "nb2s2c-p-3m1",
        material_type: "pristine",
        formula: "Nb2S2C",
        host: { formula: "Nb2S2C", metal: "Nb", chalcogen: "S", anion: "C" },
        structure: { space_group_symbol: "P-3m1" },
        intercalation: null
      } as MaterialRecord,
      {
        ...baseMaterial,
        material_id: "TMCC-0002",
        slug: "nb2s2c-r-3m",
        material_type: "pristine",
        formula: "Nb2S2C",
        host: { formula: "Nb2S2C", metal: "Nb", chalcogen: "S", anion: "C" },
        structure: { space_group_symbol: "R-3m" },
        intercalation: null
      } as MaterialRecord
    ];

    expect(findMaterialsByComposition(materials, "Nb", "S", "C").map((item) => item.material_id)).toEqual([
      "TMCC-0001",
      "TMCC-0002"
    ]);
  });

  it("renders barred space-group labels from ASCII symbols", () => {
    expect(getSpaceGroupLabel("P-3m1")).toBe("P3\u0305m1");
    expect(getSpaceGroupLabel("R-3m")).toBe("R3\u0305m");
    expect(getSpaceGroupLabel(null)).toBe("-");
  });

  it("labels R-centered trigonal space groups with their rhombohedral setting", () => {
    const material = {
      ...baseMaterial,
      material_id: "TMCC-0002",
      slug: "nb2s2c-r-3m",
      material_type: "pristine",
      formula: "Nb2S2C",
      host: { formula: "Nb2S2C", metal: "Nb", chalcogen: "S", anion: "C" },
      structure: { space_group_symbol: "R-3m" },
      intercalation: null
    } as MaterialRecord;

    expect(getLatticeSettingLabel(material)).toBe("rhombohedral setting (hexagonal axes)");
  });

  it("creates material and space-group download filenames", () => {
    const material = {
      ...baseMaterial,
      material_id: "TMCC-0001",
      slug: "nb2s2c-p-3m1",
      material_type: "pristine",
      formula: "Nb2S2C",
      host: { formula: "Nb2S2C", metal: "Nb", chalcogen: "S", anion: "C" },
      structure: { space_group_symbol: "P-3m1" },
      intercalation: null
    } as MaterialRecord;

    expect(makeStructureDownloadFilename(material, "cif")).toBe("Nb2S2C-P-3m1.cif");
    expect(makeStructureDownloadFilename(material, "poscar")).toBe("Nb2S2C-P-3m1.POSCAR");
    expect(makeElectronicDownloadFilename(material, "dos")).toBe("Nb2S2C-P-3m1-DOS.csv");
    expect(makeElectronicDownloadFilename(material, "band")).toBe("Nb2S2C-P-3m1-Band-Structure.csv");
  });
});

describe("formula generation", () => {
  it("generates pristine formulas with an explicit C or N anion site", () => {
    expect(makePristineFormula("Nb", "S", "C")).toBe("Nb2S2C");
    expect(makePristineFormula("Nb", "S", "N")).toBe("Nb2S2N");
  });

  it("generates intercalated and single-chalcogen preview formulas", () => {
    expect(makeIntercalatedFormula("Fe", "0.25", "Nb", "S", "C")).toBe("Fe0.25Nb2S2C");
    expect(makeSingleChalcogenFormula("Nb", "S", "C")).toBe("Nb2SC");
  });
});

describe("element search", () => {
  it("extracts unique elements from formula strings", () => {
    expect(getElementsFromFormula("V0.25Nb2S2C")).toEqual(["V", "Nb", "S", "C"]);
  });

  it("filters materials by exact or inclusive selected element sets", () => {
    const materials: MaterialRecord[] = [
      {
        ...baseMaterial,
        material_id: "TMCC-0001",
        slug: "nb2s2c-p-3m1",
        material_type: "pristine",
        formula: "Nb2S2C",
        host: { formula: "Nb2S2C", metal: "Nb", chalcogen: "S", anion: "C" },
        intercalation: null
      } as MaterialRecord,
      {
        ...baseMaterial,
        material_id: "TMCC-0005",
        slug: "ta2se2c-p-3m1",
        material_type: "pristine",
        formula: "Ta2Se2C",
        host: { formula: "Ta2Se2C", metal: "Ta", chalcogen: "Se", anion: "C" },
        intercalation: null
      } as MaterialRecord
    ];

    expect(filterMaterialsByElementSet(materials, ["Nb", "S", "C"], "only").map((item) => item.material_id)).toEqual([
      "TMCC-0001"
    ]);
    expect(filterMaterialsByElementSet(materials, ["C"], "at_least").map((item) => item.material_id)).toEqual([
      "TMCC-0001",
      "TMCC-0005"
    ]);
  });
});

