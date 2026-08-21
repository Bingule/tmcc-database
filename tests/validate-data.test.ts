import { describe, expect, it } from "vitest";
import { validateMaterialRecords } from "../src/lib/validation";
import type { MaterialRecord } from "../src/lib/types";

const validMaterial: MaterialRecord = {
  material_id: "TMCC-0001",
  slug: "nb2s2c-p-3m1",
  family: "TMCC",
  material_type: "pristine",
  subclass: "TMCDC",
  structure_type: "M2X2C",
  formula: "Nb2S2C",
  host: {
    formula: "Nb2S2C",
    metal: "Nb",
    chalcogen: "S",
    anion: "C"
  },
  intercalation: null,
  experimental_status: null,
  calculation_status: "not_calculated",
  structure: {},
  thermodynamics: {},
  phonons: {},
  mechanical: {},
  electronic: {},
  energy_storage: {},
  files: {
    cif: null,
    poscar: null
  },
  provenance: {}
};

describe("material validation", () => {
  it("accepts a pristine placeholder with null scientific values", () => {
    expect(validateMaterialRecords([validMaterial]).valid).toBe(true);
  });

  it("rejects duplicate material IDs", () => {
    const result = validateMaterialRecords([validMaterial, validMaterial]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Duplicate material_id: TMCC-0001");
  });

  it("rejects duplicate slugs separately from permanent IDs", () => {
    const result = validateMaterialRecords([
      validMaterial,
      { ...validMaterial, material_id: "TMCC-0002" }
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Duplicate slug: nb2s2c-p-3m1");
  });

  it("rejects obsolete stacking metadata", () => {
    const result = validateMaterialRecords([
      {
        ...validMaterial,
        host: { ...validMaterial.host, stacking: "P" }
      } as unknown as MaterialRecord
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("host stacking must not be used");
  });

  it("rejects invalid transition metal symbols", () => {
    const result = validateMaterialRecords([
      {
        ...validMaterial,
        material_id: "TMCC-0002",
        slug: "xx2s2c-p-3m1",
        formula: "Xx2S2C",
        host: { ...validMaterial.host, metal: "Xx", formula: "Xx2S2C" }
      }
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("Invalid host metal");
  });

  it("accepts every supported A-site element", () => {
    const supportedAnions = ["C", "N", "P", "As", "Sb", "Bi", "Si", "Ge", "Sn", "Pb", "B", "Al", "Ga", "In"] as const;
    const records = supportedAnions.map((anion, index) => ({
      ...validMaterial,
      material_id: `TMCC-${String(index + 1).padStart(4, "0")}`,
      slug: `nb2s2${anion.toLowerCase()}-p-3m1`,
      formula: `Nb2S2${anion}`,
      structure_type: anion === "C" ? "M2X2C" as const : anion === "N" ? "M2X2N" as const : "M2X2A" as const,
      host: { ...validMaterial.host, formula: `Nb2S2${anion}`, anion }
    }));

    expect(validateMaterialRecords(records).valid).toBe(true);
  });

  it("accepts TMCDC as the M2X2C subclass under the TMCC family", () => {
    expect(validateMaterialRecords([validMaterial]).errors).not.toContain("TMCC-0001: invalid subclass");
    expect(validateMaterialRecords([validMaterial]).errors).not.toContain("TMCC-0001: invalid structure_type");
  });

  it("rejects unsupported A-site elements", () => {
    const result = validateMaterialRecords([
      {
        ...validMaterial,
        material_id: "TMCC-0002",
        slug: "nb2s2o-p-3m1",
        formula: "Nb2S2O",
          host: { ...validMaterial.host, formula: "Nb2S2O", anion: "O" }
      } as unknown as MaterialRecord
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("invalid A-site element");
  });

  it("rejects an intercalated record without intercalation metadata", () => {
    const result = validateMaterialRecords([
      {
        ...validMaterial,
        material_id: "TMCC-0002",
        slug: "v0-25-nb2s2c-fe-config01",
        material_type: "tm_intercalated"
      }
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toContain("requires intercalation metadata");
  });
});
