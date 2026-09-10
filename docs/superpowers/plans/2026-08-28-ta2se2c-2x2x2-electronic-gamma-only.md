# Ta2Se2C 2x2x2 Electronic Gamma-Only Phonon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run one isolated Ta2Se2C finite-displacement phonon calculation with a `2 x 2 x 2` force supercell and true electronic Gamma-only sampling, then export a full phonon dispersion.

**Architecture:** Clone the already successful Ta2Se2C `2 x 2 x 2` ASE/GPAW workflow into a new result directory and change only the electronic k-point input and provenance. Preserve the same final relaxed structure, finite displacement, force-constant reconstruction, q path, q mesh, PBS environment, and recoverable cache behavior.

**Tech Stack:** Python 3.9, ASE 3.22.1, GPAW 24.1.0, PBE/PW 520 eV, PBS, 32 MPI ranks.

## Global Constraints

- Material: `TMCC-0007`, `Ta2Se2C-Pbar3m1` only.
- Source structure SHA256: `8d39cde64ae3d1989e78296151017654e49d81b4fef061e09e717cc8b3cf4b36`.
- Do not relax the structure.
- Force supercell: `(2, 2, 2)`, 40 atoms.
- Electronic sampling: exactly `kpts=(1, 1, 1)`; do not use a density dictionary.
- Phonon sampling: full path `GMKGALHA,LM,KH`, 241 points, plus the established q mesh.
- Displacement: `0.01 Angstrom`; 30 displaced-force calculations plus one equilibrium reference.
- GPAW: PBE, PW 520 eV, FermiDirac 0.05 eV, symmetry off, density convergence `5e-7`.
- PBS: 32 CPUs, 32 GB RAM, 24 hours, `OMP_NUM_THREADS=1`.
- New remote directory: `~/tmcc-database/Ta2Se2C-Pbar3m1/phonon_gamma_electronic_2x2x2`.
- Do not overwrite existing 2x2x2, k-density 3.5, primitive Gamma, mechanical, electronic, database, or website results.
- The user explicitly authorized submission of this single job; submit exactly once after remote preflight.

---

### Task 1: Isolated Gamma-only workflow contract

**Files:**
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_electronic_2x2x2/tests/test_phonon_workflow.py`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_electronic_2x2x2/phonon_workflow.py`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_electronic_2x2x2/input/final_relaxed.cif`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_electronic_2x2x2/phonon_results.json`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_electronic_2x2x2/phonon_summary.txt`

**Interfaces:**
- Produces: `ELECTRONIC_KPOINTS = (1, 1, 1)`.
- Produces: existing `phonon_workflow.py run` CLI and recoverable `work/cache/phonon` contract.

- [ ] **Step 1: Write the failing isolation and physics tests**

Tests must import the absent new module and assert:

```python
self.assertEqual(workflow.ELECTRONIC_KPOINTS, (1, 1, 1))
self.assertEqual(workflow.SUPERCELL, (2, 2, 2))
self.assertEqual(workflow.SUPERCELL_ATOMS, 40)
self.assertEqual(workflow.DISPLACEMENT_ANGSTROM, 0.01)
self.assertEqual(workflow.BAND_PATH, "GMKGALHA,LM,KH")
self.assertEqual(workflow.EXPECTED_STRUCTURE_SHA256, "8d39cde64ae3d1989e78296151017654e49d81b4fef061e09e717cc8b3cf4b36")
self.assertEqual(result["calculation"]["k_points"], {"mode": "gamma_only", "grid": [1, 1, 1]})
self.assertFalse(result["phonon_calculated"])
self.assertIsNone(result["dynamically_stable"])
self.assertIn("kpts=ELECTRONIC_KPOINTS", source)
self.assertNotIn('kpts={"density"', source)
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
& 'C:\Users\ThinkPad\AppData\Local\Programs\Python\Python313\python.exe' -m unittest discover -s 'cluster_calculations\Ta2Se2C-Pbar3m1\phonon_gamma_electronic_2x2x2\tests' -v
```

Expected: import failure because the new workflow does not exist.

- [ ] **Step 3: Clone the proven 2x2x2 workflow and change only the intended contract**

Copy the established `phonon_test_2x2x2/phonon_workflow.py`, final CIF, and pending result templates into the isolated directory. Apply these exact changes:

```python
ELECTRONIC_KPOINTS = (1, 1, 1)
WORKFLOW_ID = "tmcc-single-material-phonon-electronic-gamma-only-v1"
```

Use:

```python
kpts=ELECTRONIC_KPOINTS
```

and serialize:

```python
"k_points": {"mode": "gamma_only", "grid": list(ELECTRONIC_KPOINTS)}
```

Keep all force, path, q-mesh, validation, SVG, and recovery behavior unchanged. Pending templates must say `phonon_calculated: false`, `dynamically_stable: null`, and contain no prior job ID.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run the exact command from Step 2.

Expected: all new tests pass with `OK`.

---

### Task 2: PBS contract and full regression

**Files:**
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_electronic_2x2x2/run_pbs_phonon_gamma_only_2x2x2_32.sh`
- Modify: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_electronic_2x2x2/tests/test_phonon_workflow.py`

**Interfaces:**
- Produces: one non-submitting PBS script that runs `phonon_workflow.py run` with 32 MPI ranks.

- [ ] **Step 1: Add a failing PBS test**

Assert the script contains:

```text
#PBS -l select=1:ncpus=32:mem=32gb
#PBS -l walltime=24:00:00
export OMP_NUM_THREADS=1
mpirun -np "$NP" gpaw python phonon_workflow.py run
```

and does not contain `qsub`.

- [ ] **Step 2: Run the test and confirm RED because the PBS file is absent**

Run the Task 1 focused-test command.

- [ ] **Step 3: Create the minimal PBS script using the established module and PAW setup initialization**

Use job name `Ta2Se2C-gammaK-222`, the existing `/etc/profile.d/30_meta_modules.sh`, `module load py-gpaw`, and `/auto/brno2/home/bingu/mypawy/gpaw-setups-0.9.20000`. Echo `Electronic k-points=Gamma only (1x1x1)` and the recoverable-cache behavior before launching MPI.

- [ ] **Step 4: Run all relevant tests and PBS syntax validation**

Run the new suite plus the existing baseline, k-density 3.5, and primitive Gamma suites with `unittest`, then run Git Bash `bash -n` on the new PBS script. Expected: every suite reports `OK` and syntax validation exits zero.

---

### Task 3: Remote preflight and one authorized submission

**Files:**
- Upload the new isolated workflow directory excluding local tests.
- Remote outputs will remain under `~/tmcc-database/Ta2Se2C-Pbar3m1/phonon_gamma_electronic_2x2x2`.

**Interfaces:**
- Consumes: tested workflow, PBS script, exact final structure, and pending templates.
- Produces: one PBS job ID.

- [ ] **Step 1: Create the remote directory and prove no old `work/` exists**

Use SSH to create only the isolated directory and fail preflight if `work/` already exists.

- [ ] **Step 2: Upload the five required files and final CIF**

Upload `phonon_workflow.py`, PBS script, pending JSON, pending summary, and `input/final_relaxed.cif`.

- [ ] **Step 3: Run remote no-force preflight**

Verify GPAW 24.1.0, ASE 3.22.1, exact structure checksum, five primitive atoms, `2 x 2 x 2`/40 atoms, true `kpts=(1,1,1)`, 31 expected force records, full band path, PBS resources, script syntax, and absence of `work/`.

- [ ] **Step 4: Submit exactly once**

Run:

```bash
cd ~/tmcc-database/Ta2Se2C-Pbar3m1/phonon_gamma_electronic_2x2x2
qsub run_pbs_phonon_gamma_only_2x2x2_32.sh
```

Capture the returned job ID. Do not run `qsub` again.

- [ ] **Step 5: Start read-only monitoring**

Create a heartbeat that watches the returned job ID, 31 cache records, GPAW/PBS logs, and final dispersion outputs. On completion, download to an independent `downloaded_from_metacentrum/<job-number>` directory and report only this Gamma-only result without the comparison analysis the user declined.

The calculation directory is intentionally ignored result storage. Do not force-add it to Git and do not modify the unrelated untracked Nb2S2C plan.
