import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const materialDir = path.join(root, "data", "materials");

const transitionMetals = new Set([
  "Sc",
  "Ti",
  "V",
  "Cr",
  "Mn",
  "Fe",
  "Co",
  "Ni",
  "Cu",
  "Zn",
  "Y",
  "Zr",
  "Nb",
  "Mo",
  "Tc",
  "Ru",
  "Rh",
  "Pd",
  "Ag",
  "Cd",
  "Hf",
  "Ta",
  "W",
  "Re",
  "Os",
  "Ir",
  "Pt",
  "Au",
  "Hg"
]);
const chalcogens = new Set(["S", "Se", "Te"]);
const anions = new Set(["C", "N", "P", "As", "Sb", "Bi", "Si", "Ge", "Sn", "Pb", "B", "Al", "Ga", "In"]);
const calculationStatuses = new Set(["not_calculated", "calculation_in_progress", "calculated"]);
const experimentalStatuses = new Set(["unknown", "experimental", "not_reported", "computational"]);

function readMaterials() {
  return fs
    .readdirSync(materialDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(materialDir, file), "utf8")));
}

function validate(records) {
  const errors = [];
  const materialIds = new Set();
  const slugs = new Set();

  for (const record of records) {
    if (!record.material_id) {
      errors.push("Material is missing material_id");
    } else if (!/^TMCC-\d{4,}$/.test(record.material_id)) {
      errors.push(`${record.material_id}: material_id must use TMCC-0001 style accession format`);
    } else if (materialIds.has(record.material_id)) {
      errors.push(`Duplicate material_id: ${record.material_id}`);
    }
    materialIds.add(record.material_id);

    if (!record.slug) {
      errors.push(`${record.material_id}: slug is required`);
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug)) {
      errors.push(`${record.material_id}: slug must be lowercase ASCII words separated by hyphens`);
    } else if (slugs.has(record.slug)) {
      errors.push(`Duplicate slug: ${record.slug}`);
    }
    slugs.add(record.slug);

    if (record.family !== "TMCC") errors.push(`${record.material_id}: family must be TMCC`);
    if (!["pristine", "tm_intercalated", "m2xa"].includes(record.material_type)) {
      errors.push(`${record.material_id}: invalid material_type`);
    }
    if (!record.formula || !/^[A-Z][A-Za-z0-9.]*$/.test(record.formula)) {
      errors.push(`${record.material_id}: invalid chemical formula`);
    }
    if (!transitionMetals.has(record.host?.metal)) {
      errors.push(`${record.material_id}: invalid host metal ${record.host?.metal}`);
    }
    if (!chalcogens.has(record.host?.chalcogen)) {
      errors.push(`${record.material_id}: invalid chalcogen ${record.host?.chalcogen}`);
    }
    if (!anions.has(record.host?.anion)) {
      errors.push(`${record.material_id}: invalid A-site element ${record.host?.anion}`);
    }
    if ("stacking" in (record.host ?? {})) errors.push(`${record.material_id}: host stacking must not be used`);
    if (!calculationStatuses.has(record.calculation_status)) {
      errors.push(`${record.material_id}: invalid calculation_status`);
    }
    if (record.experimental_status !== null && !experimentalStatuses.has(record.experimental_status)) {
      errors.push(`${record.material_id}: invalid experimental_status`);
    }
    if (record.material_type === "pristine" && record.intercalation !== null) {
      errors.push(`${record.material_id}: pristine material must not include intercalation metadata`);
    }
    if (record.material_type === "tm_intercalated" && !record.intercalation) {
      errors.push(`${record.material_id}: tm_intercalated material requires intercalation metadata`);
    }

    for (const [key, value] of Object.entries(record.files ?? {})) {
      if (value === null || value === undefined) continue;
      if (typeof value !== "string" || !value.startsWith("/structures/") && !value.startsWith("/figures/")) {
        errors.push(`${record.material_id}: file ${key} must point under /structures/ or /figures/`);
      }
      const absolutePath = path.join(root, "public", value.replace(/^\//, ""));
      if (!fs.existsSync(absolutePath)) {
        errors.push(`${record.material_id}: referenced file does not exist: ${value}`);
      }
    }
  }

  return errors;
}

const records = readMaterials();
const errors = validate(records);

if (errors.length > 0) {
  console.error(`TMCC data validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`TMCC data validation passed for ${records.length} material record(s).`);
