import type { FormulaPart, MaterialRecord } from "./types";

export function formatFormulaParts(formula: string): FormulaPart[] {
  const parts: FormulaPart[] = [];
  const pattern = /([A-Z][a-z]?)(\d+(?:\.\d+)?)?/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(formula)) !== null) {
    parts.push({ text: match[1], subscript: false });
    if (match[2]) {
      parts.push({ text: match[2], subscript: true });
    }
  }

  return parts.length > 0 ? parts : [{ text: formula, subscript: false }];
}

export function getUnavailableLabel(value: unknown, kind: "scientific" | "file" = "scientific") {
  if (value === null || value === undefined || value === "") {
    return kind === "file" ? "Not available" : "-";
  }

  return String(value);
}

export function formatPropertyValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "object" && "value" in value) {
    const unitValue = value as { value?: unknown };
    if (unitValue.value === null || unitValue.value === undefined || unitValue.value === "") {
      return "-";
    }
    return String(unitValue.value);
  }

  return String(value);
}

export function getSitesPerCellLabel(material: MaterialRecord) {
  const sites = material.structure.atomic_sites;
  if (Array.isArray(sites) && sites.length > 0) {
    return String(sites.length);
  }

  return "-";
}

export function getDftEnergyPerFormulaUnitLabel(material: MaterialRecord) {
  const totalEnergy = readNumericValue(material.thermodynamics.total_energy);
  if (totalEnergy === null) return "-";
  const formulaUnits = getFormulaUnitsPerCell(material);
  if (!formulaUnits) return "-";
  return formatNumber(totalEnergy / formulaUnits);
}

function getFormulaUnitsPerCell(material: MaterialRecord) {
  const sites = material.structure.atomic_sites;
  if (!Array.isArray(sites) || sites.length === 0) return null;
  const atomsPerFormula = countAtomsInFormula(material.formula);
  if (!atomsPerFormula) return null;
  return sites.length / atomsPerFormula;
}

function countAtomsInFormula(formula: string) {
  let total = 0;
  const pattern = /([A-Z][a-z]?)(\d+(?:\.\d+)?)?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(formula)) !== null) {
    total += match[2] ? Number(match[2]) : 1;
  }
  return total > 0 ? total : null;
}

function readNumericValue(value: unknown) {
  if (!value || typeof value !== "object" || !("value" in value)) return null;
  const unitValue = value as { value?: unknown };
  return typeof unitValue.value === "number" ? unitValue.value : null;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

export function getMaterialStats(materials: MaterialRecord[]) {
  const compositions = new Set(materials.map((material) => material.formula));
  const experimental = materials.filter((material) => material.experimental_status === "experimental");
  const calculated = materials.filter((material) => material.calculation_status === "calculated");
  const inProgress = materials.filter(
    (material) => material.calculation_status === "calculation_in_progress"
  );
  const dynamicallyStable = materials.filter(
    (material) => material.phonons && material.phonons.dynamically_stable === true
  );

  return {
    totalCompositions: compositions.size,
    totalStructures: materials.length,
    vdwsTmcc: materials.filter((material) => material.material_type === "pristine").length,
    intercalatedTmcc: materials.filter((material) => material.material_type === "tm_intercalated").length,
    nonVdwsM2xa: materials.filter((material) => material.material_type === "m2xa").length,
    experimentallySynthesized: experimental.length,
    computationallyPredicted: calculated.length,
    dynamicallyStable: dynamicallyStable.length,
    calculationsInProgress: inProgress.length
  };
}

export function makePristineFormula(metal: string, chalcogen: string, anion: string) {
  return `${metal}2${chalcogen}2${anion}`;
}

export function makeIntercalatedFormula(
  intercalant: string,
  concentration: string,
  metal: string,
  chalcogen: string,
  anion: string
) {
  return `${intercalant}${concentration}${makePristineFormula(metal, chalcogen, anion)}`;
}

export function makeSingleChalcogenFormula(metal: string, chalcogen: string, anion: string) {
  return `${metal}2${chalcogen}${anion}`;
}

export function findMaterialsByComposition(
  materials: MaterialRecord[],
  metal: string,
  chalcogen: string,
  anion: string
) {
  return materials.filter(
    (material) =>
      material.material_type === "pristine" &&
      material.host.metal === metal &&
      material.host.chalcogen === chalcogen &&
      material.host.anion === anion
  );
}

export function getSpaceGroupSymbol(material: MaterialRecord) {
  return material.structure.space_group_symbol ?? material.structure.space_group ?? null;
}

export function getLatticeSettingLabel(material: MaterialRecord) {
  const normalized = String(getSpaceGroupSymbol(material) ?? "").replace(/\s+/g, "").toUpperCase();
  if (normalized.startsWith("R")) {
    return "rhombohedral setting (hexagonal axes)";
  }

  return null;
}

export function getSpaceGroupLabel(symbol: unknown) {
  if (symbol === null || symbol === undefined || symbol === "") {
    return "-";
  }

  return String(symbol).replace("-3", "3\u0305");
}

export function makeStructureDownloadFilename(material: MaterialRecord, kind: "cif" | "poscar") {
  const spaceGroup = String(getSpaceGroupSymbol(material) ?? "structure");
  const suffix = kind === "cif" ? "cif" : "POSCAR";
  const baseName = `${material.formula}-${spaceGroup}`
    .replace(/[^A-Za-z0-9.-]+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "");

  return kind === "cif" ? `${baseName}.${suffix}` : `${baseName}.${suffix}`;
}

export type ElementSearchMode = "only" | "at_least";

export function getElementsFromFormula(formula: string) {
  const elements: string[] = [];
  const pattern = /[A-Z][a-z]?/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(formula)) !== null) {
    if (!elements.includes(match[0])) {
      elements.push(match[0]);
    }
  }

  return elements;
}

export function filterMaterialsByElementSet(
  materials: MaterialRecord[],
  selectedElements: string[],
  mode: ElementSearchMode
) {
  if (selectedElements.length === 0) {
    return materials;
  }

  const selected = [...selectedElements].sort();

  return materials.filter((material) => {
    const elements = getElementsFromFormula(material.formula).sort();
    if (mode === "only") {
      return elements.length === selected.length && selected.every((element, index) => element === elements[index]);
    }

    return selected.every((element) => elements.includes(element));
  });
}
