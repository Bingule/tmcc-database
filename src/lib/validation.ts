import { anions, calculationStatuses, chalcogens, experimentalStatuses, transitionMetals } from "./statuses";
import type { MaterialRecord } from "./types";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

const requiredFilePrefixes = ["/structures/", "/figures/"];

export function validateMaterialRecords(materials: MaterialRecord[]): ValidationResult {
  const errors: string[] = [];
  const materialIds = new Set<string>();
  const slugs = new Set<string>();

  for (const material of materials) {
    if (!material.material_id) {
      errors.push("Material is missing material_id");
    } else if (!/^TMCC-\d{4,}$/.test(material.material_id)) {
      errors.push(`${material.material_id}: material_id must use TMCC-0001 style accession format`);
    } else if (materialIds.has(material.material_id)) {
      errors.push(`Duplicate material_id: ${material.material_id}`);
    }
    materialIds.add(material.material_id);

    if (!material.slug) {
      errors.push(`${material.material_id}: slug is required`);
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(material.slug)) {
      errors.push(`${material.material_id}: slug must be lowercase ASCII words separated by hyphens`);
    } else if (slugs.has(material.slug)) {
      errors.push(`Duplicate slug: ${material.slug}`);
    }
    slugs.add(material.slug);

    if (material.family !== "TMCC") {
      errors.push(`${material.material_id}: family must be TMCC`);
    }

    if (!["pristine", "tm_intercalated", "m2xa"].includes(material.material_type)) {
      errors.push(`${material.material_id}: invalid material_type`);
    }

    if (!material.formula || !/^[A-Z][A-Za-z0-9.]*$/.test(material.formula)) {
      errors.push(`${material.material_id}: invalid chemical formula`);
    }

    if (!transitionMetals.includes(material.host?.metal)) {
      errors.push(`${material.material_id}: Invalid host metal ${material.host?.metal}`);
    }

    if (!chalcogens.includes(material.host?.chalcogen)) {
      errors.push(`${material.material_id}: invalid chalcogen ${material.host?.chalcogen}`);
    }

    if (!anions.includes(material.host?.anion)) {
      errors.push(`${material.material_id}: invalid A-site element ${material.host?.anion}`);
    }

    if ("stacking" in (material.host ?? {})) {
      errors.push(`${material.material_id}: host stacking must not be used`);
    }

    if (!calculationStatuses.includes(material.calculation_status)) {
      errors.push(`${material.material_id}: invalid calculation_status`);
    }

    if (
      material.experimental_status !== null &&
      !experimentalStatuses.includes(material.experimental_status)
    ) {
      errors.push(`${material.material_id}: invalid experimental_status`);
    }

    if ((material.material_type === "pristine" || material.material_type === "m2xa") && material.intercalation !== null) {
      errors.push(`${material.material_id}: non-intercalated material must not include intercalation metadata`);
    }

    if (material.material_type === "tm_intercalated") {
      if (!material.intercalation) {
        errors.push(`${material.material_id}: tm_intercalated material requires intercalation metadata`);
      } else {
        if (!transitionMetals.includes(material.intercalation.intercalant)) {
          errors.push(`${material.material_id}: invalid intercalant ${material.intercalation.intercalant}`);
        }
        if (typeof material.intercalation.x !== "number" || material.intercalation.x <= 0) {
          errors.push(`${material.material_id}: intercalation x must be a positive number`);
        }
        if (!["self", "hetero"].includes(material.intercalation.mode)) {
          errors.push(`${material.material_id}: invalid intercalation mode`);
        }
        if (!material.intercalation.configuration) {
          errors.push(`${material.material_id}: configuration id is required`);
        }
      }
    }

    validateNoBareZeroForMissingData(material, errors);
    validateUnitValues(material, errors);
    validateFileReferences(material, errors);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function validateNoBareZeroForMissingData(material: MaterialRecord, errors: string[]) {
  const groups = [
    material.structure,
    material.thermodynamics,
    material.phonons,
    material.mechanical,
    material.electronic,
    material.energy_storage
  ];

  for (const group of groups) {
    for (const [key, value] of Object.entries(group ?? {})) {
      if (value === undefined) {
        errors.push(`${material.material_id}: ${key} must use null rather than undefined`);
      }
    }
  }
}

function validateUnitValues(material: MaterialRecord, errors: string[]) {
  const groups = [material.thermodynamics, material.mechanical, material.electronic, material.energy_storage];

  for (const group of groups) {
    for (const [key, value] of Object.entries(group ?? {})) {
      if (value && typeof value === "object" && "value" in value) {
        const candidate = value as { value?: unknown; unit?: unknown };
        if (candidate.value !== null && typeof candidate.value !== "number") {
          errors.push(`${material.material_id}: ${key}.value must be numeric or null`);
        }
        if (typeof candidate.unit !== "string" || candidate.unit.length === 0) {
          errors.push(`${material.material_id}: ${key}.unit is required`);
        }
      }
    }
  }
}

function validateFileReferences(material: MaterialRecord, errors: string[]) {
  for (const [key, value] of Object.entries(material.files ?? {})) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value !== "string" || !requiredFilePrefixes.some((prefix) => value.startsWith(prefix))) {
      errors.push(`${material.material_id}: file ${key} must point under /structures/ or /figures/`);
    }
  }
}
