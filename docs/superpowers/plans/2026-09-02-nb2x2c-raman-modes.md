# Nb2S2C / Nb2Se2C Raman Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run recoverable 2x2x2 finite-displacement jobs for Nb2S2C and Nb2Se2C and extract article-ready Gamma-mode frequencies and assignments without exporting them to the paper directory yet.

**Architecture:** Reuse the completed ASE/GPAW 2x2x2 phonon workflow as a material-parameterized template.  Keep force generation, validation, Gamma-mode extraction, and PBS execution local to an independent directory for each material.

**Tech Stack:** Python, ASE Phonons, GPAW/PBE/PW, NumPy, Matplotlib, PBS/MetaCentrum.

## Global Constraints

- PBE, 520 eV cutoff, FermiDirac 0.05 eV, gamma-centred k-point density 2.5.
- 2x2x2 supercell, 40 atoms, displacement 0.01 Angstrom.
- 32 CPUs, 32 GB RAM, four-hour walltime per material.
- Never overwrite previous phonon results or update the website/database.
- Never write to `F:\mypaper\62-TMCC-CVT\Raman\simulated_Raman` before an explicit user export instruction.

---

### Task 1: Validate structures and workflow contract

**Files:**
- Test: `cluster_calculations/Nb2S2C-Pbar3m1/raman_modes_2x2x2/tests/test_raman_workflow.py`
- Test: `cluster_calculations/Nb2Se2C-Pbar3m1/raman_modes_2x2x2/tests/test_raman_workflow.py`

**Interfaces:**
- Consumes: final CIF files and existing `phonon_test_2x2x2/phonon_workflow.py` conventions.
- Produces: assertions for formula, five primitive atoms, 40 supercell atoms, electronic k points, displacement count, force gate, outputs, and PBS resources.

- [ ] Write tests asserting TMCC-0001/CNb2S2 and TMCC-0003/CNb2Se2, five primitive atoms, `[2, 2, 2]`, 40 supercell atoms, 30 displacements plus one reference, k-point density 2.5, and no F-drive output path.
- [ ] Run each test and confirm failure because the new workflows do not exist.
- [ ] Record the exact source CIF SHA-256 hashes in the expected metadata.

### Task 2: Implement recoverable force and Gamma-mode workflows

**Files:**
- Create: `cluster_calculations/Nb2S2C-Pbar3m1/raman_modes_2x2x2/raman_workflow.py`
- Create: `cluster_calculations/Nb2Se2C-Pbar3m1/raman_modes_2x2x2/raman_workflow.py`
- Create: one `input/final_structure.cif` in each calculation directory.

**Interfaces:**
- Consumes: `python raman_workflow.py run` and the source CIF.
- Produces: `work/cache`, `force_constants.npy`, `gamma_modes.npz`, `raman_modes.csv`, `raman_results.json`, `RAMAN_SUMMARY.txt`, and `raman_mode_plot.svg`.

- [ ] Implement source validation and a 0.03 eV/Angstrom equilibrium-force gate.
- [ ] Implement ASE/GPAW force generation with restart-safe caches.
- [ ] Assemble symmetrised force constants and apply the acoustic sum rule.
- [ ] Call `phonons.band_structure([[0, 0, 0]], modes=True)` and convert energies to THz and cm-1.
- [ ] Derive dominant-element contribution and in-plane/out-of-plane character from mass-normalised eigenvectors.
- [ ] Write complete JSON/CSV/NPZ/summary/plot outputs while explicitly marking Raman intensity as not calculated.
- [ ] Run both tests and confirm they pass.

### Task 3: Add and verify PBS launchers

**Files:**
- Create: `cluster_calculations/Nb2S2C-Pbar3m1/raman_modes_2x2x2/run_pbs_raman_2x2x2_32_4h.sh`
- Create: `cluster_calculations/Nb2Se2C-Pbar3m1/raman_modes_2x2x2/run_pbs_raman_2x2x2_32_4h.sh`

**Interfaces:**
- Consumes: a PBS allocation and `raman_workflow.py run`.
- Produces: one resumable MetaCentrum job per material.

- [ ] Add `select=1:ncpus=32:mem=32gb`, `walltime=04:00:00`, `OMP_NUM_THREADS=1`, the proven GPAW setup path, module initialisation, and `mpirun -np 32 gpaw python`.
- [ ] Run shell syntax checks and the workflow metadata tests.
- [ ] Upload only the two new calculation directories.
- [ ] Submit exactly one job for each material and record both full PBS job IDs in provenance placeholders without resubmitting either job.

### Task 4: Monitor, validate, and hold results for export

**Files:**
- Download later into each calculation directory under `downloaded_from_metacentrum/<job-id>/`.

**Interfaces:**
- Consumes: PBS job IDs and remote outputs.
- Produces: verified local result bundles that remain outside the paper directory until separately authorised.

- [ ] Monitor cache progress and distinguish queue/authentication messages from calculation failures.
- [ ] On completion, verify 31 non-empty cache records and every declared output.
- [ ] Check the force gate, three acoustic modes, real optical frequencies, mode-table units, formula, structure hash, CPU/RAM/walltime provenance, and absence of claimed Raman intensities.
- [ ] Report frequencies and assignments; wait for the user's explicit export instruction before copying anything to the F-drive destination.

