import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runImport } from "../scripts/import-phonopy-results.mjs";

let root = "";
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

async function setup() {
  root = await mkdtemp(path.join(tmpdir(), "phonopy-import-"));
  const dataRoot = path.join(root, "materials");
  const sourceRoot = path.join(root, "source");
  const publicRoot = path.join(root, "public");
  await Promise.all([dataRoot, sourceRoot, publicRoot].map((p) => mkdir(p, { recursive: true })));
  const rows = [-0.2, -0.200001, null].map((minimum_frequency_thz, i) => ({
    material_id: `TMCC-000${i + 1}`, material: `M2S2C-Pbar3m1`,
    source: `${i}/phonopy_results.json`, verified_complete: i < 2, minimum_frequency_thz
  }));
  const manifestPath = path.join(root, "manifest.json");
  await writeFile(manifestPath, JSON.stringify({ rows }));
  for (const [i, row] of rows.entries()) {
    await writeFile(path.join(dataRoot, row.material_id + ".json"), JSON.stringify({
      material_id: row.material_id, structure: { space_group_symbol: "P-3m1" },
      mechanical: { mechanically_stable: true }, phonons: {}, electronic: { band_gap: 0 }
    }));
    if (i === 2) continue;
    const dir = path.join(sourceRoot, String(i));
    await mkdir(path.join(dir, "work"), { recursive: true });
    for (const file of ["force_constants.npy", "qmesh_frequencies.npz"])
      await writeFile(path.join(dir, "work", file), "nonempty");
    await writeFile(path.join(dir, "work", "phonopy_band.csv"),
      "segment,point,distance,q_x,q_y,q_z,branch,frequency_thz\n1,0,0,0,0,0,1,0\n1,1,1,0.5,0,0,1,1\n");
    await writeFile(path.join(dir, "phonopy_results.json"), JSON.stringify({
      material_id: row.material_id, status: "complete", phonon_calculated: true,
      dynamically_stable: i === 1 ? null : true, minimum_frequency_thz: row.minimum_frequency_thz,
      imaginary_mode_tolerance_thz: 0.2, calculation: { supercell: [2, 2, 2] },
      files: { force_constants: "work/force_constants.npy", qmesh_frequencies: "work/qmesh_frequencies.npz", band_data: "work/phonopy_band.csv" },
      provenance: { metacentrum_job_id: "123.pbs" }
    }));
  }
  return { manifestPath, sourceRoot, dataRoot, publicRoot, expectedTotals: { complete: 2, stable: 1, unstable: 1, pending: 1 } };
}

it("imports complete results with boundary, override, pending and idempotence", async () => {
  const options = await setup();
  expect(await runImport(options)).toEqual(options.expectedTotals);
  const file = path.join(options.dataRoot, "TMCC-0001.json");
  const first = await readFile(file, "utf8");
  const stable = JSON.parse(first);
  expect(stable.phonons.dynamically_stable).toBe(true);
  expect(stable.phonons.band_data).toBe("/phonons/TMCC-0001.json");
  expect(stable.electronic.band_gap).toBe(0);
  const band = JSON.parse(await readFile(path.join(options.publicRoot, "phonons", "TMCC-0001.json"), "utf8"));
  expect(band.segments[0].qpoints).toEqual([[0, 0, 0, 0, 0], [1, 1, 0.5, 0, 0]]);
  expect(band.segments[0].branches[0]).toEqual({ branch: 1, frequencies: [0, 1] });
  const unstable = JSON.parse(await readFile(path.join(options.dataRoot, "TMCC-0002.json"), "utf8"));
  expect(unstable.phonons.dynamically_stable).toBe(false);
  expect(unstable.phonons.classification_note).toMatch(/null/i);
  const pending = JSON.parse(await readFile(path.join(options.dataRoot, "TMCC-0003.json"), "utf8"));
  expect(pending.phonons).toEqual({});
  await runImport(options);
  expect(await readFile(file, "utf8")).toBe(first);
});

it("rejects incorrect totals without updating materials", async () => {
  const options = await setup();
  await expect(runImport({ ...options, expectedTotals: { complete: 3, stable: 1, unstable: 1, pending: 0 } })).rejects.toThrow(/count/i);
  const material = JSON.parse(await readFile(path.join(options.dataRoot, "TMCC-0001.json"), "utf8"));
  expect(material.phonons).toEqual({});
});
