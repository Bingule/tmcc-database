import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const bundleRoot = path.resolve(root, process.argv[2] ?? "");

if (!bundleRoot || !fs.existsSync(bundleRoot)) {
  console.error("Usage: node scripts/import-website-bundles.mjs <bundle-root>");
  process.exit(1);
}

const materialsDir = path.join(root, "data", "materials");
const publicDir = path.join(root, "public");
const srcDataFile = path.join(root, "src", "data", "materials.ts");

const imported = [];
const skipped = [];

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeRecord(record) {
  const normalized = { ...record };
  if (normalized.material_type === "intercalated") {
    normalized.material_type = "tm_intercalated";
  }
  if (normalized.slug) {
    normalized.slug = slugify(normalized.slug);
  }
  if (normalized.material_type === "tm_intercalated" && normalized.intercalation) {
    const intercalation = normalized.intercalation;
    normalized.intercalation = {
      intercalant: intercalation.intercalant ?? intercalation.element ?? null,
      x: intercalation.x ?? intercalation.amount ?? null,
      mode: intercalation.mode ?? "hetero",
      site: intercalation.site ?? null,
      ordering: intercalation.ordering ?? null,
      configuration: intercalation.configuration ?? "generated ordered approximant",
    };
  }
  const classification = classifyRecord(normalized);
  normalized.subclass = classification.subclass;
  normalized.structure_type = classification.structure_type;
  normalized.material_type = classification.material_type;
  return normalized;
}

function classifyRecord(record) {
  const formula = String(record.host?.formula ?? record.formula ?? "").replace(/\s/g, "");
  if (/2(?:S|Se|Te)2N/.test(formula)) {
    return { subclass: "TMCDC", structure_type: "M2X2N", material_type: record.material_type };
  }
  if (/2(?:S|Se|Te)2C/.test(formula)) {
    return { subclass: "TMCDC", structure_type: "M2X2C", material_type: record.material_type };
  }
  if (/2N(?:S|Se|Te)/.test(formula)) {
    return {
      subclass: "TMCC",
      structure_type: "M2XN",
      material_type: record.material_type === "pristine" ? "m2xa" : record.material_type,
    };
  }
  if (/2C(?:S|Se|Te)/.test(formula)) {
    return {
      subclass: "TMCC",
      structure_type: "M2XA",
      material_type: record.material_type === "pristine" ? "m2xa" : record.material_type,
    };
  }
  return {
    subclass: record.subclass ?? "TMCC",
    structure_type: record.structure_type ?? "M2XA",
    material_type: record.material_type,
  };
}

function copyDirectoryContents(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryContents(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

for (const entry of fs.readdirSync(bundleRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const bundleDir = path.join(bundleRoot, entry.name);
  const materialPath = path.join(bundleDir, "material.json");
  if (!fs.existsSync(materialPath)) continue;

  const record = normalizeRecord(JSON.parse(fs.readFileSync(materialPath, "utf8")));
  const materialId = record.material_id || entry.name;
  const destinationMaterial = path.join(materialsDir, `${materialId}.json`);

  if (fs.existsSync(destinationMaterial)) {
    skipped.push(materialId);
    continue;
  }

  fs.writeFileSync(destinationMaterial, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  copyDirectoryContents(path.join(bundleDir, "figures"), path.join(publicDir, "figures", materialId));
  copyDirectoryContents(path.join(bundleDir, "structures"), path.join(publicDir, "structures", materialId));
  imported.push(materialId);
}

const materialFiles = fs
  .readdirSync(materialsDir)
  .filter((file) => /^TMCC-\d+\.json$/.test(file))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const imports = materialFiles
  .map((file) => {
    const id = path.basename(file, ".json");
    const variableName = id.replace(/-/g, "");
    return `import ${variableName} from "../../data/materials/${id}.json";`;
  })
  .join("\n");

const variables = materialFiles
  .map((file) => path.basename(file, ".json").replace(/-/g, ""))
  .join(",\n  ");

const content = `${imports}

import type { MaterialRecord } from "../lib/types";

export const materials = [
  ${variables}
] as MaterialRecord[];
`;

fs.writeFileSync(srcDataFile, content, "utf8");

console.log(JSON.stringify({ imported: imported.length, skipped: skipped.length, importedIds: imported }, null, 2));
