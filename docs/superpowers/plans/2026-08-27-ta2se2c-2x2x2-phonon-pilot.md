# Ta2Se2C 2×2×2 Phonon Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare, submit after explicit authorization, and validate one isolated 40-atom phonon calculation for mechanically stable `TMCC-0007 / Ta2Se2C-Pbar3m1`.

**Architecture:** Reuse the validated Nb2S2C ASE/GPAW phonon implementation in a new Ta2Se2C-relative directory, changing only material identity, source provenance, formula validation, and result namespace. Download the exact completed mechanical `work/final.cif`; never regenerate or relax the structure.

**Tech Stack:** Python 3, ASE 3.22.1 Phonons, GPAW 24.1.0, unittest, Bash, PBS Pro, MetaCentrum modules.

## Global Constraints

- Material is `TMCC-0007 / Ta2Se2C-Pbar3m1`; database mechanical stability is true.
- Source structure is the completed mechanical `work/final.cif`, SHA-256 `8d39cde64ae3d1989e78296151017654e49d81b4fef061e09e717cc8b3cf4b36`.
- Do not relax the structure or use the original/site CIF.
- Use PBE, PW 520 eV, FermiDirac 0.05 eV, k-point density 2.5 with Gamma convention, GPAW symmetry off, displacement 0.01 Å, and imaginary tolerance 0.2 THz.
- Use a 2×2×2 supercell with 40 atoms, 30 central displacements, and one equilibrium reference.
- Request 32 CPUs, 32 GB RAM, and 24 hours walltime with one OpenMP thread per MPI rank.
- Preserve all Nb2S2C and Ta2Se2C mechanical/electronic results; do not update the database or website.
- Do not run GPAW locally and do not execute `qsub` without explicit authorization.

---

### Task 1: Material-specific workflow contract

**Files:**
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_test_2x2x2/tests/test_phonon_workflow.py`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_test_2x2x2/phonon_workflow.py`

**Interfaces:**
- Consumes: validated Nb2S2C phonon functions and Ta2Se2C material metadata.
- Produces: `MATERIAL_ID == "TMCC-0007"`, `MATERIAL_NAME == "Ta2Se2C-Pbar3m1"`, `EXPECTED_FORMULA == "CTa2Se2"`, `SUPERCELL == (2, 2, 2)`, and `SUPERCELL_ATOMS == 40`.

- [ ] Write a failing unittest that imports the new module and asserts the exact identity, formula, supercell, atom count, 30 displacements, PBE/520 eV/2.5/0.05 eV settings, and 0.2 THz tolerance.
- [ ] Run the isolated unittest with Python 3.13 and verify it fails because `phonon_workflow.py` is absent.
- [ ] Create the minimal workflow from the validated 2×2×2 implementation. Change material identity, formula check, source mechanical job to `23167797.pbs-m1.metacentrum.cz`, and remove Nb2S2C comparison metadata. Keep relative work/cache/output paths and recovery logic.
- [ ] Run the test again and require PASS without importing scientific packages or running GPAW.

### Task 2: Exact final input and PBS launcher

**Files:**
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_test_2x2x2/input/final_relaxed.cif`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_test_2x2x2/run_pbs_phonon_2x2x2_32.sh`
- Modify: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_test_2x2x2/tests/test_phonon_workflow.py`

**Interfaces:**
- Consumes: remote `~/tmcc-database/Ta2Se2C-Pbar3m1/work/final.cif`.
- Produces: byte-identical local phonon input and a 32-rank PBS entry point.

- [ ] Add failing tests that require the exact SHA-256 and PBS lines `select=1:ncpus=32:mem=32gb`, `walltime=24:00:00`, `NP="${PBS_NP:-32}"`, `OMP_NUM_THREADS=1`, and `mpirun -np "$NP" gpaw python phonon_workflow.py run`.
- [ ] Run the tests and verify failure because the input and PBS files are absent.
- [ ] Download only the remote final CIF into the new input directory and create the PBS launcher from the validated MetaCentrum initialization, with job-specific default output logging and a 32-rank guard.
- [ ] Run tests, compare local and remote hashes, and verify all assertions pass.

### Task 3: Honest result templates and submission preflight

**Files:**
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_test_2x2x2/phonon_results.json`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_test_2x2x2/phonon_summary.txt`
- Modify: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_test_2x2x2/tests/test_phonon_workflow.py`

**Interfaces:**
- Consumes: `build_initial_result()` and `render_summary()`.
- Produces: `not_run` templates with no false stability or submission claim.

- [ ] Add failing tests requiring `status == "not_run"`, `phonon_calculated is False`, `dynamically_stable is None`, `[2,2,2]`, 40 atoms, 30+1 workload, Ta2Se2C identity, and `Database updated: false`.
- [ ] Run tests and verify failure because templates are absent.
- [ ] Add templates matching the workflow metadata without calling GPAW.
- [ ] Run all Ta2Se2C tests, Python compilation, and Git Bash syntax validation; require zero failures.
- [ ] Verify no `work` directory exists locally, no Nb2S2C file changed, and `git status` contains no database or website modifications.

### Task 4: Authorized cluster execution and result validation

**Files:**
- Populate after completion: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_test_2x2x2/downloaded_from_metacentrum/<job-id>/`

**Interfaces:**
- Consumes: validated local job bundle and explicit user authorization.
- Produces: one PBS job, complete phonon bundle, and a dynamical-stability assessment.

- [ ] Stop and request explicit authorization for one 32-CPU, 32-GB, 24-hour Ta2Se2C job.
- [ ] After authorization, upload required files to `~/tmcc-database/Ta2Se2C-Pbar3m1/phonon_test_2x2x2`, verify remote hash and Bash syntax, and execute `qsub` exactly once.
- [ ] Monitor the job without resubmission; diagnose any failure before requesting retry authority.
- [ ] Download results into the job-ID-specific local directory and require 31 nonempty cache files, force constants, q-mesh NPZ, band CSV, dispersion SVG, GPAW/PBS logs, matching provenance, and no tracebacks.
- [ ] Report minimum frequency, imaginary-mode magnitude and q point, stability under the 0.2 THz tolerance, elapsed time, requested resources, available peak-memory accounting, and confirmation that the database was not updated.
