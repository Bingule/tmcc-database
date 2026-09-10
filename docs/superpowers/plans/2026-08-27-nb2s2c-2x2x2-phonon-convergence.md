# Nb2S2C 2×2×2 Phonon Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare and validate an isolated, resumable 40-atom 2×2×2 phonon convergence job for `Nb2S2C-Pbar3m1` without running GPAW locally or submitting the job before explicit authorization.

**Architecture:** Clone only the validated pilot workflow and final relaxed input into a sibling calculation directory, then change the fixed supercell metadata and PBS memory request. Keep every cache and output path relative to the new directory so the completed 2×2×1 pilot remains immutable.

**Tech Stack:** Python 3, ASE 3.22.1 Phonons, GPAW 24.1.0, unittest, PBS Pro, Bash, MetaCentrum modules.

## Global Constraints

- Use the byte-identical final relaxed structure from the completed 2×2×1 pilot; do not relax or regenerate it.
- Keep PBE, PW 520 eV, FermiDirac 0.05 eV, k-point density 2.5 with Gamma convention, displacement 0.01 Å, and imaginary tolerance 0.2 THz.
- Use a 2×2×2 supercell containing 40 atoms and 30 central-displacement force calculations plus one equilibrium reference.
- Request 32 CPUs, 32 GB RAM, and 24 hours walltime with `OMP_NUM_THREADS=1`.
- Do not modify database, website, other materials, or completed 2×2×1 results.
- Do not run GPAW locally and do not call `qsub` without explicit authorization.

---

### Task 1: Isolated workflow contract

**Files:**
- Create: `cluster_calculations/Nb2S2C-Pbar3m1/phonon_test_2x2x2/tests/test_phonon_workflow.py`
- Create: `cluster_calculations/Nb2S2C-Pbar3m1/phonon_test_2x2x2/phonon_workflow.py`

**Interfaces:**
- Consumes: the validated pilot module behavior and `input/final_relaxed.cif`.
- Produces: constants `SUPERCELL == (2, 2, 2)` and `SUPERCELL_ATOMS == 40`, plus the existing `build_initial_result()`, `remove_incomplete_cache_files()`, and `main()` interfaces.

- [ ] **Step 1: Create the isolated test first**

Add assertions that import the new module and require:

```python
self.assertEqual(phonon_workflow.SUPERCELL, (2, 2, 2))
self.assertEqual(phonon_workflow.SUPERCELL_ATOMS, 40)
result = phonon_workflow.build_initial_result()
self.assertEqual(result["calculation"]["supercell"], [2, 2, 2])
self.assertEqual(result["calculation"]["supercell_atoms"], 40)
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
python -m unittest discover -s cluster_calculations/Nb2S2C-Pbar3m1/phonon_test_2x2x2/tests -v
```

Expected: FAIL because the new workflow module or 2×2×2 constants do not yet exist.

- [ ] **Step 3: Create the minimal isolated workflow**

Copy the validated pilot implementation into the sibling directory and change only:

```python
SUPERCELL = (2, 2, 2)
SUPERCELL_ATOMS = 40
```

Keep `WORK_DIR`, `CACHE_DIR`, and result paths relative to the new script directory. Replace the old automatic-selection equality guard with a direct verification that the user-selected convergence supercell equals `(2, 2, 2)`; record the selection reason as c-axis convergence of the preliminary finite-q soft mode.

- [ ] **Step 4: Run the isolated tests and verify GREEN**

Run the unittest command from Step 2. Expected: all tests pass without importing or running GPAW.

### Task 2: Input identity and PBS resources

**Files:**
- Create: `cluster_calculations/Nb2S2C-Pbar3m1/phonon_test_2x2x2/input/final_relaxed.cif`
- Create: `cluster_calculations/Nb2S2C-Pbar3m1/phonon_test_2x2x2/run_pbs_phonon_2x2x2_32.sh`
- Modify: `cluster_calculations/Nb2S2C-Pbar3m1/phonon_test_2x2x2/tests/test_phonon_workflow.py`

**Interfaces:**
- Consumes: source checksum `f163134f37941041b9fc926ad249baac1e7644cf24c70d35e660dff28f118cce`.
- Produces: a PBS entry point invoking the isolated `phonon_workflow.py` with 32 MPI ranks.

- [ ] **Step 1: Add failing PBS and checksum tests**

Require the new PBS file to contain:

```text
#PBS -l select=1:ncpus=32:mem=32gb
#PBS -l walltime=24:00:00
NP="${PBS_NP:-32}"
export OMP_NUM_THREADS=1
mpirun -np "$NP" gpaw python phonon_workflow.py
```

Require SHA-256 of the new input to equal the source checksum.

- [ ] **Step 2: Run tests and verify RED**

Expected: FAIL because the new PBS file and input copy do not yet exist.

- [ ] **Step 3: Copy the validated input and create PBS script**

Use a byte-preserving copy for the CIF. Base PBS initialization on the successful pilot, including `module load py-gpaw`, `PYTHONNOUSERSITE=1`, PAW setup path, CPU-count guard, and no fixed `#PBS -o` so retries retain job-specific logs.

- [ ] **Step 4: Run tests and verify GREEN**

Expected: all isolated tests pass and the checksum is exact.

### Task 3: Result templates and complete submission preflight

**Files:**
- Create: `cluster_calculations/Nb2S2C-Pbar3m1/phonon_test_2x2x2/phonon_results.json`
- Create: `cluster_calculations/Nb2S2C-Pbar3m1/phonon_test_2x2x2/phonon_summary.txt`
- Modify: `cluster_calculations/Nb2S2C-Pbar3m1/phonon_test_2x2x2/tests/test_phonon_workflow.py`

**Interfaces:**
- Consumes: `build_initial_result()` and `write_summary()`.
- Produces: explicit `not_run` templates that become final output only on the cluster.

- [ ] **Step 1: Add failing template assertions**

Assert `status == "not_run"`, `phonon_calculated is False`, `dynamically_stable is None`, supercell `[2, 2, 2]`, 40 atoms, 30 displaced calculations, and database update `False`.

- [ ] **Step 2: Run tests and verify RED**

Expected: FAIL because isolated templates do not yet exist.

- [ ] **Step 3: Generate isolated templates without GPAW**

Use the workflow metadata helpers only; do not call `main()` or create a GPAW calculator.

- [ ] **Step 4: Run full local preflight**

Run:

```powershell
python -m unittest discover -s cluster_calculations/Nb2S2C-Pbar3m1/phonon_test_2x2x2/tests -v
python -m py_compile cluster_calculations/Nb2S2C-Pbar3m1/phonon_test_2x2x2/phonon_workflow.py
bash -n cluster_calculations/Nb2S2C-Pbar3m1/phonon_test_2x2x2/run_pbs_phonon_2x2x2_32.sh
```

Expected: all tests PASS, Python compilation exits 0, and Bash syntax exits 0.

- [ ] **Step 5: Verify isolation before upload**

Compare the 2×2×1 result checksum and file list before and after preparation; inspect `git status --short` to confirm no database or website files changed.

### Task 4: Upload, submit, monitor, and retrieve

**Files:**
- Populate after authorization: `cluster_calculations/Nb2S2C-Pbar3m1/phonon_test_2x2x2/downloaded_from_metacentrum/<job-id>/`

**Interfaces:**
- Consumes: validated local calculation directory and explicit user authorization.
- Produces: MetaCentrum job ID, scheduler accounting, complete result bundle, and comparison against the 2×2×1 minimum frequency.

- [ ] **Step 1: Stop and request explicit submission authorization**

Report the exact remote path and PBS resources. Do not upload-and-submit until authorization is received.

- [ ] **Step 2: Upload to an isolated remote directory and submit once**

Upload to `~/tmcc-database/Nb2S2C-Pbar3m1/phonon_test_2x2x2`, verify remote shell syntax and checksum, then execute exactly one `qsub run_pbs_phonon_2x2x2_32.sh`.

- [ ] **Step 3: Monitor at 30-second intervals**

Track PBS state and logs without resubmitting. On failure, diagnose before changing anything or retrying.

- [ ] **Step 4: Download and verify results**

Require `phonon_calculated == true`, a complete 31-entry cache, force constants, q-mesh data, band CSV, dispersion SVG, log, and provenance matching the job ID.

- [ ] **Step 5: Report convergence result**

Compare minimum frequencies, soft-mode q points, elapsed time, requested resources, and actual peak memory. Do not update TMCCDB.
