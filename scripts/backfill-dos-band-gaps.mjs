import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const materialDir = path.join(root, "data", "materials");

const DOS_THRESHOLD_FRACTION = 1e-4;
const DOS_THRESHOLD_MIN = 1e-5;
const EF_WINDOW_EV = 0.03;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function readDos(file) {
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const header = lines.shift()?.split(",") ?? [];
  const energyIndex = header.findIndex((name) => /energy/i.test(name));
  const totalIndices = header
    .map((name, index) => ({ name, index }))
    .filter(({ name }) => /^total/i.test(name))
    .map(({ index }) => index);

  if (energyIndex < 0 || totalIndices.length === 0) return [];

  return lines
    .map((line) => line.split(",").map(Number))
    .filter((row) => row.length > energyIndex && Number.isFinite(row[energyIndex]))
    .map((row) => ({
      energy: row[energyIndex],
      dos: totalIndices.reduce((sum, index) => sum + Math.abs(Number.isFinite(row[index]) ? row[index] : 0), 0)
    }))
    .sort((a, b) => a.energy - b.energy);
}

function deriveGapFromDos(points) {
  if (points.length === 0) return null;
  const maxDos = Math.max(...points.map((point) => point.dos));
  const threshold = Math.max(DOS_THRESHOLD_MIN, maxDos * DOS_THRESHOLD_FRACTION);
  const nearEf = points.filter((point) => Math.abs(point.energy) <= EF_WINDOW_EV);

  if (nearEf.some((point) => point.dos > threshold)) {
    return 0;
  }

  const occupied = points.filter((point) => point.energy < 0 && point.dos > threshold).pop();
  const unoccupied = points.find((point) => point.energy > 0 && point.dos > threshold);

  if (!occupied || !unoccupied) return null;
  return Math.max(0, unoccupied.energy - occupied.energy);
}

function isMissingGap(material) {
  const gap = material.electronic?.band_gap;
  return gap == null || gap.value == null || gap.value === "";
}

let updated = 0;

for (const entry of fs.readdirSync(materialDir).sort()) {
  if (!/^TMCC-\d+\.json$/.test(entry)) continue;

  const file = path.join(materialDir, entry);
  const material = readJson(file);
  if (!isMissingGap(material)) continue;
  if (!material.files?.dos) continue;

  const dosFile = path.join(root, "public", material.files.dos.replace(/^\//, ""));
  if (!fs.existsSync(dosFile)) continue;

  const gap = deriveGapFromDos(readDos(dosFile));
  if (gap == null) continue;

  material.electronic ??= {};
  material.electronic.band_gap = {
    value: Number(gap.toFixed(6)),
    unit: "eV"
  };
  material.electronic.electronic_character = gap <= 0.001 ? "metallic (DOS-derived)" : "gapped (DOS-derived)";
  material.electronic.band_gap_source = "DOS-derived from exported GPAW DOS near Ef";
  writeJson(file, material);
  updated += 1;
}

console.log(`Backfilled DOS-derived band gaps for ${updated} material record(s).`);
