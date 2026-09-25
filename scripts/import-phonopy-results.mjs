import { readFile, stat, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TOTALS = { complete: 347, stable: 24, unstable: 323, pending: 9 };

function inside(root, relative) {
  if (typeof relative !== "string" || path.isAbsolute(relative)) throw new Error("Invalid source path");
  const resolved = path.resolve(root, relative);
  if (resolved === path.resolve(root) || !resolved.startsWith(path.resolve(root) + path.sep))
    throw new Error("Source path escapes root");
  return resolved;
}

async function requireNonempty(file) {
  if ((await stat(file)).size <= 0) throw new Error(`Empty source file: ${file}`);
}

function parseBandCsv(text, materialId, bandPath) {
  const lines = text.trim().split(/\r?\n/);
  const header = "segment,point,distance,q_x,q_y,q_z,branch,frequency_thz";
  if (lines.shift()?.trim() !== header) throw new Error(`Unexpected band CSV header for ${materialId}`);
  const segments = new Map();
  for (const line of lines) {
    const fields = line.split(",").map(Number);
    if (fields.length !== 8 || fields.some((value) => !Number.isFinite(value)))
      throw new Error(`Invalid band CSV row for ${materialId}`);
    const [segment, point, distance, qx, qy, qz, branch, frequency] = fields;
    if (!Number.isInteger(segment) || !Number.isInteger(point) || !Number.isInteger(branch))
      throw new Error(`Noninteger segment, point or branch for ${materialId}`);
    if (!segments.has(segment)) segments.set(segment, { qpoints: new Map(), branches: new Map() });
    const group = segments.get(segment);
    const qpoint = [point, distance, qx, qy, qz];
    const previous = group.qpoints.get(point);
    if (previous && JSON.stringify(previous) !== JSON.stringify(qpoint))
      throw new Error(`Inconsistent q-point for ${materialId}`);
    group.qpoints.set(point, qpoint);
    if (!group.branches.has(branch)) group.branches.set(branch, new Map());
    if (group.branches.get(branch).has(point)) throw new Error(`Duplicate band point for ${materialId}`);
    group.branches.get(branch).set(point, frequency);
  }
  if (segments.size === 0) throw new Error(`No band points for ${materialId}`);
  return {
    material_id: materialId, unit: "THz", band_path: bandPath ?? null,
    segments: [...segments.entries()].sort(([a], [b]) => a - b).map(([segment, group]) => {
      const points = [...group.qpoints.keys()].sort((a, b) => a - b);
      const branches = [...group.branches.entries()].sort(([a], [b]) => a - b).map(([branch, frequencies]) => {
        if (frequencies.size !== points.length) throw new Error(`Incomplete band branch for ${materialId}`);
        return { branch, frequencies: points.map((point) => frequencies.get(point)) };
      });
      return { segment, qpoints: points.map((point) => group.qpoints.get(point)), branches };
    })
  };
}

async function atomicWrite(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, value);
  await rename(temporary, file);
}

export async function runImport({
  manifestPath, sourceRoot, dataRoot, publicRoot, dryRun = false, expectedTotals = DEFAULT_TOTALS
}) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(manifest.rows)) throw new Error("Manifest rows missing");
  const seen = new Set();
  const writes = [];
  const totals = { complete: 0, stable: 0, unstable: 0, pending: 0 };
  for (const row of manifest.rows) {
    const id = row.material_id;
    if (typeof id !== "string" || !/^TMCC-\d{4,}$/.test(id) || seen.has(id))
      throw new Error(`Duplicate or invalid material ID: ${id}`);
    seen.add(id);
    const materialPath = inside(dataRoot, id + ".json");
    const material = JSON.parse(await readFile(materialPath, "utf8"));
    if (material.material_id !== id || material.mechanical?.mechanically_stable !== true ||
        material.structure?.space_group_symbol !== "P-3m1")
      throw new Error(`Not a mechanically stable P-phase material: ${id}`);
    if (!row.verified_complete) {
      totals.pending++;
      continue;
    }
    const resultPath = inside(sourceRoot, row.source);
    const result = JSON.parse(await readFile(resultPath, "utf8"));
    const minimum = result.minimum_frequency_thz;
    if (result.material_id !== id || result.status !== "complete" ||
        result.phonon_calculated !== true || !Number.isFinite(minimum) ||
        result.imaginary_mode_tolerance_thz !== 0.2 ||
        Math.abs(minimum - row.minimum_frequency_thz) > 1e-8)
      throw new Error(`Incomplete or mismatched Phonopy result: ${id}`);
    const sourceDir = path.dirname(resultPath);
    const files = result.files ?? {};
    for (const key of ["force_constants", "qmesh_frequencies", "band_data"]) {
      await requireNonempty(inside(sourceDir, files[key]));
    }
    const stable = minimum >= -0.2;
    if (result.dynamically_stable !== null && result.dynamically_stable !== stable)
      throw new Error(`Source stability conflicts with frequency: ${id}`);
    const band = parseBandCsv(await readFile(inside(sourceDir, files.band_data), "utf8"), id, result.calculation?.band_path);
    const note = result.dynamically_stable === null
      ? "Source classification null; classified from completed full-q minimum frequency using -0.2 THz tolerance."
      : undefined;
    const phonons = {
      ...material.phonons,
      phonon_calculated: true,
      dynamically_stable: stable,
      minimum_frequency_thz: minimum,
      maximum_imaginary_frequency_thz: result.maximum_imaginary_frequency_thz ?? null,
      imaginary_mode_tolerance_thz: 0.2,
      band_data: `/phonons/${id}.json`,
      calculation: result.calculation,
      provenance: {
        ...result.provenance,
        source_result_path: row.source,
        classification_source: note ? "completed_phonon_frequency_override" : "phonopy_result"
      },
      ...(note ? { classification_note: note } : {})
    };
    writes.push({
      materialPath,
      materialText: JSON.stringify({ ...material, phonons }, null, 2) + "\n",
      bandPath: path.join(publicRoot, "phonons", id + ".json"),
      bandText: JSON.stringify(band) + "\n"
    });
    totals.complete++;
    totals[stable ? "stable" : "unstable"]++;
  }
  if (Object.keys(totals).some((key) => totals[key] !== expectedTotals[key]))
    throw new Error(`Phonopy count mismatch: ${JSON.stringify(totals)}`);
  if (!dryRun) {
    for (const entry of writes) {
      await atomicWrite(entry.bandPath, entry.bandText);
      const old = await readFile(entry.materialPath, "utf8");
      if (old !== entry.materialText) await atomicWrite(entry.materialPath, entry.materialText);
    }
  }
  return totals;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).flatMap((arg, i, all) =>
    arg.startsWith("--") && arg !== "--dry-run" ? [[arg.slice(2), all[i + 1]]] : []));
  runImport({
    manifestPath: args.manifest, sourceRoot: args["source-root"],
    dataRoot: args["data-root"] ?? "data/materials", publicRoot: args["public-root"] ?? "public",
    dryRun: process.argv.includes("--dry-run")
  }).then((totals) => console.log(JSON.stringify(totals))).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
