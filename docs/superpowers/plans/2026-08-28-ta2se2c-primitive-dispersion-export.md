# Ta2Se2C Five-Atom Primitive Dispersion Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export a 15-branch, band-structure-style phonon dispersion from the completed Ta2Se2C five-atom force cache without running any new force calculation.

**Architecture:** Add one isolated pure-post-processing helper beside the existing five-atom Gamma workflow. It reconstructs force constants with `ase.phonons.Phonons(calc=None)`, samples the established hexagonal path, and atomically writes CSV, SVG, and provenance JSON outputs; it never changes the completed Gamma result.

**Tech Stack:** Python 3.9+, ASE 3.22.1, NumPy 1.22.3, standard-library `csv/json/hashlib/pathlib`, `unittest`, MetaCentrum `py-gpaw/24.1.0` module environment.

## Global Constraints

- Use only `TMCC-0007` in `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35`.
- Reuse `input/final_relaxed.cif` and all 31 non-empty files under `work/cache/phonon` from job `23360639.pbs-m1.metacentrum.cz`.
- Use `1 x 1 x 1`, 5 atoms, displacement `0.01 Angstrom`, `method="standard"`, `symmetrize=3`, and `acoustic=True`.
- Use path `GMKGALHA,LM,KH` with 241 points and export all 15 branches in THz.
- Every output must say `1x1x1 primitive-cell approximation`; Gamma-external frequencies are not convergence evidence.
- Do not run GPAW forces, MPI, `qsub`, or a local GPAW calculation.
- Do not modify the completed `gamma_phonon_results.json`, earlier 40-atom results, database, or website.

---

### Task 1: Post-processing contracts and pure exporters

**Files:**
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/export_primitive_dispersion.py`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/tests/test_export_primitive_dispersion.py`

**Interfaces:**
- Produces: `validate_inputs(root: Path) -> dict[str, object]`
- Produces: `write_band_csv(path: Path, qpoints, distances, frequencies_thz) -> None`
- Produces: `render_dispersion_svg(distances, frequencies_thz, special_x, labels) -> str`
- Produces: `build_metadata(inputs, frequencies_thz) -> dict[str, object]`
- Produces: `run(root: Path = ROOT) -> dict[str, object]`

- [ ] **Step 1: Write failing contract and exporter tests**

Create `test_export_primitive_dispersion.py` with tests that import the helper by path and assert:

```python
class PrimitiveDispersionExportTests(unittest.TestCase):
    def test_contract_is_five_atom_approximation(self):
        self.assertEqual(export.BAND_PATH, "GMKGALHA,LM,KH")
        self.assertEqual(export.BAND_POINTS, 241)
        self.assertEqual(export.SUPERCELL, (1, 1, 1))
        self.assertEqual(export.EXPECTED_CACHE_COUNT, 31)
        self.assertIn("1x1x1 primitive-cell approximation", export.WARNING)

    def test_csv_contains_qpoint_distance_and_fifteen_modes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "band.csv"
            frequencies = [[-0.01] + list(range(1, 15)), [0.02] + list(range(1, 15))]
            export.write_band_csv(path, [[0, 0, 0], [0.5, 0, 0]], [0.0, 1.0], frequencies)
            rows = list(csv.reader(path.open()))
            self.assertEqual(len(rows), 3)
            self.assertEqual(len(rows[0]), 20)
            self.assertEqual(float(rows[1][5]), -0.01)

    def test_svg_and_metadata_are_explicitly_approximate(self):
        frequencies = [[-0.01] + list(range(1, 15)), [0.02] + list(range(1, 15))]
        svg = export.render_dispersion_svg([0.0, 1.0], frequencies, [0.0, 1.0], ["G", "M"])
        metadata = export.build_metadata({"cache_count": 31}, frequencies)
        self.assertIn(export.WARNING, svg)
        self.assertTrue(metadata["primitive_cell_approximation"])
        self.assertNotIn("dynamically_stable", metadata)
        self.assertNotIn("gamma_stable", metadata)

    def test_source_has_no_force_or_submission_entry_point(self):
        source = export.MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("calc=None", source)
        self.assertNotIn("phonons.run()", source)
        self.assertNotIn("qsub", source)
        self.assertNotIn("GPAW(", source)
```

- [ ] **Step 2: Run tests and confirm the expected RED state**

Run:

```powershell
& 'C:\Users\ThinkPad\AppData\Local\Programs\Python\Python313\python.exe' -m unittest discover -s 'cluster_calculations\Ta2Se2C-Pbar3m1\phonon_gamma_primitive_k35\tests' -p 'test_export_primitive_dispersion.py' -v
```

Expected: import failure because `export_primitive_dispersion.py` does not yet exist.

- [ ] **Step 3: Implement constants, validation, and atomic pure writers**

Implement the helper with these exact constants and validation rules:

```python
ROOT = Path(__file__).resolve().parent
STRUCTURE = ROOT / "input" / "final_relaxed.cif"
CACHE_NAME = ROOT / "work" / "cache" / "phonon"
BAND_CSV = ROOT / "work" / "primitive_phonon_band.csv"
DISPERSION_SVG = ROOT / "work" / "primitive_phonon_dispersion.svg"
METADATA_JSON = ROOT / "work" / "primitive_dispersion_metadata.json"
EXPECTED_SHA256 = "8d39cde64ae3d1989e78296151017654e49d81b4fef061e09e717cc8b3cf4b36"
SOURCE_JOB_ID = "23360639.pbs-m1.metacentrum.cz"
SUPERCELL = (1, 1, 1)
DISPLACEMENT_ANGSTROM = 0.01
BAND_PATH = "GMKGALHA,LM,KH"
BAND_POINTS = 241
EXPECTED_CACHE_COUNT = 31
EV_TO_THZ = 241.7989242084918
WARNING = "1x1x1 primitive-cell approximation; Gamma-external frequencies are not converged full-BZ evidence"
```

`validate_inputs()` must check the exact structure hash and recursively require exactly 31 `cache.*.json` files, each with size greater than zero. `write_band_csv()` must atomically write columns `point_index,qx,qy,qz,path_coordinate,mode_1_thz,...,mode_15_thz`. `render_dispersion_svg()` must draw 15 polylines, a solid zero line, a dashed `-0.2 THz` line, special-point guides and labels, and the warning. `build_metadata()` must record the source job, checksum, cache count, 5 atoms, supercell, path, 241 points, 15 branches, minimum and maximum frequency, output paths, and `primitive_cell_approximation: true`; it must contain no stability classification.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run:

```powershell
& 'C:\Users\ThinkPad\AppData\Local\Programs\Python\Python313\python.exe' -m unittest discover -s 'cluster_calculations\Ta2Se2C-Pbar3m1\phonon_gamma_primitive_k35\tests' -p 'test_export_primitive_dispersion.py' -v
```

Expected: four tests pass with `OK`.

---

### Task 2: ASE reconstruction from the completed cache

**Files:**
- Modify: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/export_primitive_dispersion.py`
- Modify: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/tests/test_export_primitive_dispersion.py`

**Interfaces:**
- Consumes: the pure exporters and validation functions from Task 1.
- Produces: `calculate_band(root: Path) -> tuple[object, object, object, object, list[str]]`
- Produces: `run(root: Path = ROOT) -> dict[str, object]`

- [ ] **Step 1: Add a failing source-level reconstruction test**

Add:

```python
def test_reconstruction_uses_existing_cache_only(self):
    source = export.MODULE_PATH.read_text(encoding="utf-8")
    self.assertIn("Phonons(atoms, calc=None", source)
    self.assertIn('phonons.read(method="standard", symmetrize=3, acoustic=True)', source)
    self.assertIn("atoms.cell.bandpath(BAND_PATH, npoints=BAND_POINTS)", source)
    self.assertIn("phonons.band_structure(band.kpts, verbose=False)", source)
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
& 'C:\Users\ThinkPad\AppData\Local\Programs\Python\Python313\python.exe' -m unittest discover -s 'cluster_calculations\Ta2Se2C-Pbar3m1\phonon_gamma_primitive_k35\tests' -p 'test_export_primitive_dispersion.py' -v
```

Expected: failure because `calculate_band()` and the exact ASE reconstruction calls are absent.

- [ ] **Step 3: Implement cache-only band reconstruction and orchestration**

Implement `calculate_band()` with this data flow:

```python
atoms = read(root / "input" / "final_relaxed.cif")
atoms.pbc = (True, True, True)
if len(atoms) != 5:
    raise ValueError(f"expected 5 atoms, found {len(atoms)}")
band = atoms.cell.bandpath(BAND_PATH, npoints=BAND_POINTS)
phonons = Phonons(atoms, calc=None, supercell=SUPERCELL,
                  delta=DISPLACEMENT_ANGSTROM,
                  name=str(root / "work" / "cache" / "phonon"))
phonons.read(method="standard", symmetrize=3, acoustic=True)
frequencies_thz = np.asarray(
    phonons.band_structure(band.kpts, verbose=False), dtype=float
) * EV_TO_THZ
distances, special_x, labels = band.get_linear_kpoint_axis()
return band.kpts, distances, frequencies_thz, special_x, labels
```

`run()` must validate first, call `calculate_band()`, require shape `(241, 15)`, atomically write all three outputs, and return the metadata. The CLI has only one command, `export`; `python export_primitive_dispersion.py export` calls `run()`. It must not accept a force-calculation command.

- [ ] **Step 4: Run all five-atom tests and the previous regression suites**

Run:

```powershell
$py='C:\Users\ThinkPad\AppData\Local\Programs\Python\Python313\python.exe'
& $py -m unittest discover -s 'cluster_calculations\Ta2Se2C-Pbar3m1\phonon_gamma_primitive_k35\tests' -v
& $py -m unittest discover -s 'cluster_calculations\Ta2Se2C-Pbar3m1\phonon_test_2x2x2\tests' -v
& $py -m unittest discover -s 'cluster_calculations\Ta2Se2C-Pbar3m1\phonon_validation_k35_delta001\tests' -v
```

Expected: every suite reports `OK`; no test invokes ASE/GPAW force evaluation.

---

### Task 3: Remote post-processing and result verification

**Files:**
- Upload: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/export_primitive_dispersion.py`
- Generate remotely and download:
  - `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/downloaded_from_metacentrum/23360639/work/primitive_phonon_band.csv`
  - `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/downloaded_from_metacentrum/23360639/work/primitive_phonon_dispersion.svg`
  - `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/downloaded_from_metacentrum/23360639/work/primitive_dispersion_metadata.json`

**Interfaces:**
- Consumes: Task 2 helper and the completed remote cache.
- Produces: three verified, locally available export artifacts.

- [ ] **Step 1: Record immutable-result checksums and upload only the helper**

Record SHA256 for local and remote `gamma_phonon_results.json`, then upload `export_primitive_dispersion.py` to:

```text
~/tmcc-database/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/
```

Do not upload or alter cache files.

- [ ] **Step 2: Run serial remote post-processing without PBS or MPI**

Run through SSH:

```bash
cd ~/tmcc-database/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35
source /etc/profile.d/30_meta_modules.sh
module load py-gpaw
gpaw python export_primitive_dispersion.py export
```

Expected: exit code zero and three non-empty `work/primitive_*` files. There is no `qsub`, `mpirun`, or force calculation.

- [ ] **Step 3: Download the three outputs into the existing independent job snapshot**

Download only the three new files into:

```text
cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/downloaded_from_metacentrum/23360639/work/
```

- [ ] **Step 4: Verify scientific and provenance contracts**

Check:

```powershell
$d='cluster_calculations\Ta2Se2C-Pbar3m1\phonon_gamma_primitive_k35\downloaded_from_metacentrum\23360639\work'
$rows=Import-Csv "$d\primitive_phonon_band.csv"
$meta=Get-Content -Raw "$d\primitive_dispersion_metadata.json" | ConvertFrom-Json
[PSCustomObject]@{
  Rows=$rows.Count
  Columns=$rows[0].PSObject.Properties.Count
  Branches=$meta.branches
  Approximation=$meta.primitive_cell_approximation
  CacheCount=$meta.cache_count
  SourceJob=$meta.source_job_id
  SvgBytes=(Get-Item "$d\primitive_phonon_dispersion.svg").Length
}
```

Expected: `Rows=241`, `Columns=20`, `Branches=15`, `Approximation=True`, `CacheCount=31`, source job `23360639.pbs-m1.metacentrum.cz`, and nonzero SVG size. Confirm the completed Gamma-result SHA256 is unchanged and the metadata has no `dynamically_stable` or `gamma_stable` key.

- [ ] **Step 5: Present the SVG and report the limitation**

Show the local SVG and report its minimum frequency, but state explicitly that it is a `1x1x1 primitive-cell approximation`; only the previously completed 40-atom calculation can support a full-Brillouin-zone stability classification.

The calculation directories are intentionally ignored result storage. Do not force-add generated scripts or outputs to Git, and do not touch the unrelated untracked Nb2S2C plan.
