# Ta2Se2C Phonon Numerical Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine whether the near-Gamma Ta2Se2C imaginary acoustic mode survives controlled post-processing and a single denser-k-point phonon calculation.

**Architecture:** Preserve job 23358060 as immutable input. First add a post-processing-only command that reconstructs several ASE force-constant variants from its completed cache and writes to a sibling validation directory. If the significant off-Gamma mode remains, prepare one isolated 2x2x2 calculation that changes only k-point density from 2.5 to 3.5; upload and preflight it, then stop before `qsub` for explicit authorization.

**Tech Stack:** Python 3.13 for pure unit tests, ASE 3.22.1 from MetaCentrum `py-gpaw` for cache reconstruction, GPAW 24.1.0 for any authorized force calculation, PBS Pro, PowerShell, Git.

## Global Constraints

- Source structure is the existing final relaxed Ta2Se2C structure with SHA256 `8d39cde64ae3d1989e78296151017654e49d81b4fef061e09e717cc8b3cf4b36`.
- Baseline job `23358060.pbs-m1.metacentrum.cz` and all downloaded files are immutable.
- Significant-imaginary-mode tolerance remains exactly 0.2 THz.
- Stage 2 changes only k-point density from 2.5 to 3.5; PBE, 520 eV, FermiDirac 0.05 eV, 0.01 Angstrom displacement, 2x2x2 supercell, and all other physics remain fixed.
- Any new force job requests 32 CPUs, 32 GB RAM, and 24 hours with `OMP_NUM_THREADS=1`.
- Do not run GPAW locally, update the database or website, touch Nb2S2C, or submit `qsub` without explicit authorization.

---

### Task 1: Add deterministic post-processing analysis

**Files:**
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_test_2x2x2/phonon_validation.py`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_test_2x2x2/tests/test_phonon_validation.py`

**Interfaces:**
- Consumes: downloaded cache directory, `input/final_relaxed.cif`, supercell `(2, 2, 2)`, displacement `0.01`, q mesh `(21, 21, 11)`, band path `GMKGALHA,LM,KH`.
- Produces: `summarize_spectrum(qpoints, frequencies_thz, tolerance_thz) -> dict`, `validation_variants() -> list[dict]`, and a `run` command writing one JSON record per post-processing variant.

- [ ] **Step 1: Write pure failing tests**

```python
from phonon_validation import summarize_spectrum, validation_variants


def test_spectrum_records_location_and_classification():
    result = summarize_spectrum(
        [[0.0, 0.0, 0.0], [0.03, 0.03, 0.0]],
        [[-0.07, 0.11, 0.18], [-0.37, 0.20, 0.30]],
        0.2,
    )
    assert result["dynamically_stable"] is False
    assert result["minimum_frequency_thz"] == -0.37
    assert result["minimum_qpoint"] == [0.03, 0.03, 0.0]
    assert result["minimum_branch"] == 0


def test_variants_isolate_postprocessing_choices():
    assert validation_variants() == [
        {"method": "standard", "symmetrize": 3, "acoustic": True},
        {"method": "frederiksen", "symmetrize": 3, "acoustic": True},
        {"method": "standard", "symmetrize": 10, "acoustic": True},
        {"method": "frederiksen", "symmetrize": 10, "acoustic": True},
        {"method": "standard", "symmetrize": 10, "acoustic": False},
    ]
```

- [ ] **Step 2: Run the tests and verify the intended failure**

Run:

```powershell
& 'C:\Users\ThinkPad\AppData\Local\Programs\Python\Python313\python.exe' -m unittest cluster_calculations\Ta2Se2C-Pbar3m1\phonon_test_2x2x2\tests\test_phonon_validation.py -v
```

Expected: FAIL because `phonon_validation` does not exist.

- [ ] **Step 3: Implement the pure analysis boundary**

```python
def validation_variants():
    return [
        {"method": "standard", "symmetrize": 3, "acoustic": True},
        {"method": "frederiksen", "symmetrize": 3, "acoustic": True},
        {"method": "standard", "symmetrize": 10, "acoustic": True},
        {"method": "frederiksen", "symmetrize": 10, "acoustic": True},
        {"method": "standard", "symmetrize": 10, "acoustic": False},
    ]


def summarize_spectrum(qpoints, frequencies_thz, tolerance_thz):
    indexed = [
        (float(value), point_index, branch)
        for point_index, row in enumerate(frequencies_thz)
        for branch, value in enumerate(row)
    ]
    value, point_index, branch = min(indexed)
    return {
        "dynamically_stable": value >= -float(tolerance_thz),
        "minimum_frequency_thz": value,
        "maximum_imaginary_frequency_thz": max(0.0, -value),
        "minimum_qpoint": [float(x) for x in qpoints[point_index]],
        "minimum_branch": branch,
        "imaginary_tolerance_thz": float(tolerance_thz),
    }
```

The `run` path must import ASE only inside the command, instantiate `Phonons`
against the copied cache name, call `read()` separately for every variant, and
write atomically under `numerical_validation/postprocess_23358060/`. It must
refuse to run if the structure hash differs or the cache does not contain
exactly 31 nonempty JSON files.

- [ ] **Step 4: Run local pure tests**

Run the Step 2 command again.

Expected: both tests PASS without importing ASE or GPAW.

- [ ] **Step 5: Verify the command cannot overwrite baseline data**

Run:

```powershell
rg -n "downloaded_from_metacentrum.*(write_text|open\(.+w|save|replace)|phonon_results.json" cluster_calculations\Ta2Se2C-Pbar3m1\phonon_test_2x2x2\phonon_validation.py
```

Expected: no write target inside `downloaded_from_metacentrum/23358060`; all output paths contain `numerical_validation/postprocess_23358060`.

### Task 2: Reconstruct and classify the existing cache

**Files:**
- Create locally after download: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_test_2x2x2/numerical_validation/postprocess_23358060/postprocess_results.json`
- Create locally after download: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_test_2x2x2/numerical_validation/postprocess_23358060/postprocess_summary.txt`

**Interfaces:**
- Consumes: `phonon_validation.py` from Task 1 and immutable job-23358060 cache.
- Produces: a comparison table used as the Stage 2 decision gate.

- [ ] **Step 1: Upload only the post-processing helper to an isolated remote directory**

Run from PowerShell with the existing SSH key, targeting
`~/tmcc-database/Ta2Se2C-Pbar3m1/phonon_numerical_validation/postprocess_23358060`.
Copy the helper, final relaxed CIF, and the 31 cache files from the completed
remote job into this new directory. Do not move or edit source files.

Expected: SHA256 of the copied CIF matches the Global Constraints and the copied
cache contains 31 nonempty JSON files.

- [ ] **Step 2: Run ASE-only reconstruction in the existing MetaCentrum module environment**

Run:

```bash
source /etc/profile.d/30_meta_modules.sh
module load py-gpaw
gpaw python phonon_validation.py run
```

Expected: no GPAW calculator is constructed, no SCF iteration appears, and five
post-processing variants are written in less than a few minutes.

- [ ] **Step 3: Download and validate derived output**

Download the remote result directory to the exact local path listed under
Task 2 Files. Check that each variant records method, symmetrization count,
acoustic setting, band minimum, q-mesh minimum, q point, branch, and Gamma
acoustic frequencies.

Expected: the baseline-compatible `standard/symmetrize=3/acoustic=true` result
reproduces -0.3700 THz within 0.001 THz.

- [ ] **Step 4: Apply the Stage 2 gate**

If every corrected variant is at or above -0.2 THz and their minima agree
within 0.1 THz, report the post-processing result as stable but numerically
sensitive and stop before a new force calculation. Otherwise proceed to Task 3.

### Task 3: Prepare the k-point-density 3.5 validation job

**Files:**
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_validation_k35_delta001/phonon_workflow.py`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_validation_k35_delta001/run_pbs_phonon_k35_delta001_32.sh`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_validation_k35_delta001/input/final_relaxed.cif`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_validation_k35_delta001/phonon_results.json`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_validation_k35_delta001/phonon_summary.txt`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_validation_k35_delta001/tests/test_phonon_workflow.py`

**Interfaces:**
- Consumes: validated structure and baseline workflow conventions.
- Produces: a restartable 40-atom, 31-force-calculation package with `K_POINT_DENSITY = 3.5` and every other physics setting unchanged.

- [ ] **Step 1: Write failing metadata and isolation tests**

```python
def test_k35_validation_changes_only_intended_parameter():
    result = workflow.build_initial_result()
    calc = result["calculation"]
    assert calc["k_points"] == {"density": 3.5, "gamma": True}
    assert calc["displacement_angstrom"] == 0.01
    assert calc["supercell"] == [2, 2, 2]
    assert calc["supercell_atoms"] == 40
    assert calc["plane_wave_cutoff_ev"] == 520
    assert calc["fermi_width_ev"] == 0.05
    assert calc["displaced_force_calculations"] == 30
    assert result["provenance"]["parent_phonon_job_id"] == "23358060.pbs-m1.metacentrum.cz"
```

Also assert that every output path resolves below
`phonon_validation_k35_delta001` and that the input CIF hash matches the Global
Constraints.

- [ ] **Step 2: Run tests and verify failure before implementation**

Run the new test file with Python 3.13 `unittest -v`.

Expected: FAIL because the validation workflow does not exist.

- [ ] **Step 3: Implement by adapting the completed baseline workflow**

Copy the established Ta2Se2C workflow structure and change these exact fields:

```python
K_POINT_DENSITY = 3.5
WORKFLOW_ID = "tmcc-single-material-phonon-kpoint-validation-v1"
PARENT_PHONON_JOB_ID = "23358060.pbs-m1.metacentrum.cz"
```

Retain `convergence={"density": 5e-7}`, `symmetry="off"`,
`phonons.read(method="standard", symmetrize=3, acoustic=True)`, the 21x21x11
q mesh, and the complete band path. Record minimum q point and branch in the
new JSON in addition to the baseline fields.

- [ ] **Step 4: Create the PBS script**

```bash
#!/usr/bin/env bash
#PBS -N Ta2Se2C-ph-k35
#PBS -l select=1:ncpus=32:mem=32gb
#PBS -l walltime=24:00:00
#PBS -j oe

set -euo pipefail
cd "$PBS_O_WORKDIR"
NP="${PBS_NP:-32}"
export OMP_NUM_THREADS=1
export GPAW_SETUP_PATH="/auto/brno2/home/bingu/mypawy/gpaw-setups-0.9.20000"
export PYTHONNOUSERSITE=1
set +u
source /etc/profile.d/30_meta_modules.sh
module load py-gpaw
set -u
[[ "$NP" -eq 32 ]]
mpirun -np "$NP" gpaw python phonon_workflow.py run
```

- [ ] **Step 5: Run all pure tests and shell syntax checks**

Run both Ta2Se2C validation test suites with Python 3.13 and run:

```bash
bash -n cluster_calculations/Ta2Se2C-Pbar3m1/phonon_validation_k35_delta001/run_pbs_phonon_k35_delta001_32.sh
```

Expected: all tests PASS and shell syntax exits zero.

### Task 4: Upload, preflight, and stop for authorization

**Files:**
- Remote create: `~/tmcc-database/Ta2Se2C-Pbar3m1/phonon_validation_k35_delta001/`

**Interfaces:**
- Consumes: Task 3 package.
- Produces: an upload manifest and preflight report; it does not produce a PBS job ID.

- [ ] **Step 1: Upload the isolated package with the existing SSH key**

Expected remote files: helper, PBS script, final relaxed CIF, initial JSON, and
summary. The remote `work/` directory must not exist before the first authorized
run.

- [ ] **Step 2: Run read-only remote preflight checks**

Check the structure SHA256, 5 primitive atoms, 40 supercell atoms, k-point
density 3.5, displacement 0.01 Angstrom, 30 displacements plus one reference,
32 CPUs, 32 GB, 24 hours, module initialization, setup path, and
`OMP_NUM_THREADS=1`.

- [ ] **Step 3: Report the exact commands and request submission authorization**

Provide the exact `qsub run_pbs_phonon_k35_delta001_32.sh` command and the
30-second cache/log monitoring command. Stop without running `qsub`.

### Task 5: Conditional result validation after an authorized run

**Files:**
- Create after completion: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_validation_k35_delta001/downloaded_from_metacentrum/<job-id>/`

**Interfaces:**
- Consumes: one explicitly authorized Stage 2 job.
- Produces: a verified comparison against baseline and a decision whether Stage 3 is scientifically necessary.

- [ ] **Step 1: Monitor without resubmission**

Count nonempty and zero-byte cache files recursively, inspect GPAW/PBS logs,
and do not treat key-only `qstat` Kerberos error 15010 as job failure.

- [ ] **Step 2: Download complete output into the job-ID-specific directory**

Expected: 31 nonempty cache files, `force_constants.npy`,
`qmesh_frequencies.npz`, `phonon_band.csv`, `phonon_dispersion.svg`, GPAW/PBS
logs, result JSON, and summary.

- [ ] **Step 3: Verify provenance and compare spectra**

Confirm TMCC-0007, the source hash, 2x2x2/40 atoms, density 3.5, displacement
0.01 Angstrom, and actual PBS job ID. Compare the minimum value, q point,
branch, Gamma frequencies, and number of q points below -0.2 THz against job
23358060.

- [ ] **Step 4: Apply the classification gate**

If the denser-k result is stable and consistent with corrected post-processing,
report stability with numerical-sensitivity provenance. If it remains below
-0.2 THz, prepare but do not submit the separately authorized 0.02 Angstrom
Stage 3 job. If the result changes classification without converging within
0.1 THz, report it as numerically inconclusive and do not update the database.
