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
    if (typeof unitValue.value === "number") {
      return formatNumber(unitValue.value);
    }
    return String(unitValue.value);
  }

  if (typeof value === "number") {
    return formatNumber(value);
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

export function getFormationEnergyPerAtom(material: MaterialRecord) {
  const explicit = material.thermodynamics.formation_energy_per_atom;
  const explicitValue = readNumericValue(explicit);
  if (explicitValue !== null) return explicitValue;

  const formationEnergy = material.thermodynamics.formation_energy;
  const value = readNumericValue(formationEnergy);
  if (value === null) return null;
  const unit = readUnit(formationEnergy);
  if (unit === "eV/atom") return value;
  if (unit !== "eV/formula" && unit !== "eV/f.u.") return null;
  const atomsPerFormula = countAtomsInFormula(material.formula);
  return atomsPerFormula ? value / atomsPerFormula : null;
}

export function getFormationEnergyPerAtomLabel(material: MaterialRecord) {
  const value = getFormationEnergyPerAtom(material);
  return value === null ? "-" : formatNumber(value);
}

export function getCellVolume(material: MaterialRecord) {
  const explicit = readNumericValue(material.structure.cell_volume);
  if (explicit !== null) return explicit;

  const lattice = material.structure.lattice_parameters as Record<string, unknown> | undefined;
  const angles = material.structure.angles as Record<string, unknown> | undefined;
  const a = readNumericValue(lattice?.a);
  const b = readNumericValue(lattice?.b);
  const c = readNumericValue(lattice?.c);
  const alpha = readNumericValue(angles?.alpha);
  const beta = readNumericValue(angles?.beta);
  const gamma = readNumericValue(angles?.gamma);
  if ([a, b, c, alpha, beta, gamma].some((value) => value === null)) return null;

  const alphaRad = degreesToRadians(alpha as number);
  const betaRad = degreesToRadians(beta as number);
  const gammaRad = degreesToRadians(gamma as number);
  const factor = 1 + 2 * Math.cos(alphaRad) * Math.cos(betaRad) * Math.cos(gammaRad)
    - Math.cos(alphaRad) ** 2 - Math.cos(betaRad) ** 2 - Math.cos(gammaRad) ** 2;
  if (factor <= 0) return null;
  return (a as number) * (b as number) * (c as number) * Math.sqrt(factor);
}

export function getCellVolumeLabel(material: MaterialRecord) {
  const value = getCellVolume(material);
  return value === null ? "-" : formatNumber(value);
}

export function getDensity(material: MaterialRecord) {
  const explicit = readNumericValue(material.structure.density);
  if (explicit !== null) return explicit;
  const volume = getCellVolume(material);
  const sites = material.structure.atomic_sites;
  if (!volume || !Array.isArray(sites) || sites.length === 0) return null;

  let mass = 0;
  for (const site of sites) {
    if (!site || typeof site !== "object") return null;
    const { element, occupancy } = site as { element?: unknown; occupancy?: unknown };
    if (typeof element !== "string" || !(element in ATOMIC_MASSES)) return null;
    const siteOccupancy = typeof occupancy === "number" ? occupancy : 1;
    mass += ATOMIC_MASSES[element] * siteOccupancy;
  }
  return mass * ATOMIC_MASS_DENSITY_FACTOR / volume;
}

export function getDensityLabel(material: MaterialRecord) {
  const value = getDensity(material);
  return value === null ? "-" : formatNumber(value);
}

export function getMechanicalStabilityLabel(material: MaterialRecord) {
  const stable = material.mechanical.mechanically_stable;
  if (stable === true) return "Stable";
  if (stable === false) return "Unstable";
  return "Pending";
}

export function getSubclassLabel(material: MaterialRecord) {
  return material.subclass ?? inferSubclass(material);
}

export function getStructureTypeLabel(material: MaterialRecord) {
  return material.structure_type ?? inferStructureType(material);
}

export function getIntercalantLabel(material: MaterialRecord) {
  return material.intercalation?.intercalant ?? "-";
}

export function getNumberOfSitesLabel(material: MaterialRecord) {
  return getSitesPerCellLabel(material);
}

export function getPhononStabilityLabel(material: MaterialRecord) {
  const dynamicallyStable = material.phonons?.dynamically_stable;
  if (dynamicallyStable === true) return "Stable";
  if (dynamicallyStable === false) return "Unstable";
  return "Pending";
}

function inferSubclass(material: MaterialRecord) {
  return inferStructureType(material).startsWith("M2X2") ? "TMCDC" : "TMCC";
}

function inferStructureType(material: MaterialRecord) {
  if (material.material_type === "m2xa") return "M2XA";
  const formula = material.host?.formula ?? material.formula;
  const suffix = material.host?.anion === "N" ? "N" : "C";
  const chalcogenCount = countElementInFormula(formula, material.host?.chalcogen);
  return chalcogenCount === 2 ? `M2X2${suffix}` : `M2X${suffix}`;
}

function countElementInFormula(formula: string, element: string | undefined) {
  if (!element) return 0;
  const pattern = /([A-Z][a-z]?)(\d+(?:\.\d+)?)?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(formula)) !== null) {
    if (match[1] === element) return match[2] ? Number(match[2]) : 1;
  }
  return 0;
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

function readUnit(value: unknown) {
  if (!value || typeof value !== "object" || !("unit" in value)) return null;
  const unit = (value as { unit?: unknown }).unit;
  return typeof unit === "string" ? unit : null;
}

function degreesToRadians(value: number) {
  return value * Math.PI / 180;
}

const ATOMIC_MASS_DENSITY_FACTOR = 1.6605390666;
const ATOMIC_MASSES: Record<string, number> = {
  Li: 6.94, B: 10.81, C: 12.011, N: 14.007, Na: 22.98976928, Mg: 24.305,
  Al: 26.9815385, Si: 28.085, P: 30.973761998, S: 32.06, K: 39.0983, Ca: 40.078,
  Sc: 44.955908, Ti: 47.867, V: 50.9415, Cr: 51.9961, Mn: 54.938044, Fe: 55.845,
  Co: 58.933194, Ni: 58.6934, Cu: 63.546, Zn: 65.38, Ga: 69.723, Ge: 72.63,
  As: 74.921595, Se: 78.971, Y: 88.90584, Zr: 91.224, Nb: 92.90637, Mo: 95.95,
  Tc: 98, Ru: 101.07, Rh: 102.9055, Pd: 106.42, Ag: 107.8682, Cd: 112.414,
  In: 114.818, Sn: 118.71, Sb: 121.76, Te: 127.6, Hf: 178.49, Ta: 180.94788,
  W: 183.84, Re: 186.207, Os: 190.23, Ir: 192.217, Pt: 195.084, Au: 196.966569,
  Hg: 200.592, Pb: 207.2, Bi: 208.9804
};

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
    tmcdc: materials.filter((material) => getSubclassLabel(material) === "TMCDC" && material.material_type !== "tm_intercalated").length,
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
      getStructureTypeLabel(material).startsWith("M2X2") &&
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
  const suffix = kind === "cif" ? "cif" : "POSCAR";
  const baseName = makeMaterialSpaceGroupBaseName(material);

  return `${baseName}.${suffix}`;
}

export function makeElectronicDownloadFilename(material: MaterialRecord, kind: "dos" | "band") {
  const suffix = kind === "dos" ? "DOS.csv" : "Band-Structure.csv";
  return `${makeMaterialSpaceGroupBaseName(material)}-${suffix}`;
}

function makeMaterialSpaceGroupBaseName(material: MaterialRecord) {
  const spaceGroup = String(getSpaceGroupSymbol(material) ?? "structure");
  return `${material.formula}-${spaceGroup}`
    .replace(/[^A-Za-z0-9.-]+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "");
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

  const selected = [...new Set(selectedElements)];

  return materials.filter((material) => {
    const elements = getElementsFromFormula(material.formula);
    if (mode === "only") {
      return selected.every((element) => elements.includes(element));
    }

    return selected.every((element) => elements.includes(element));
  });
}
