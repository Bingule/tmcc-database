# Ta2Se2C Primitive-Cell Gamma Phonon Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and preflight a five-atom Ta2Se2C Gamma-point phonon screening job without changing any full-BZ result.

**Architecture:** Create one isolated workflow that uses ASE finite displacements in a 1x1x1 primitive cell, GPAW forces with electronic k-point density 3.5, and evaluates only q=(0,0,0). Store Gamma-specific fields and outputs so they cannot be confused with the database-wide full-BZ dynamical-stability result. Upload and preflight the package, then stop before `qsub`.

**Tech Stack:** Python 3.13 pure tests, ASE 3.22.1, GPAW 24.1.0, PBS Pro, existing MetaCentrum modules and PAW setups.

## Global Constraints

- Use TMCC-0007 Ta2Se2C-Pbar3m1 final relaxed structure SHA256 `8d39cde64ae3d1989e78296151017654e49d81b4fef061e09e717cc8b3cf4b36`.
- Use a 1x1x1 periodic primitive cell with 5 atoms, not the 40-atom force supercell.
- Evaluate phonons only at q=(0,0,0), but retain electronic k-point density 3.5 with Gamma centering.
- Keep PBE, PW cutoff 520 eV, FermiDirac 0.05 eV, displacement 0.01 Angstrom, GPAW symmetry off, standard ASE force treatment, three symmetrization iterations, and acoustic correction.
- Run 30 central displacements plus one equilibrium reference and support cache restart.
- Use 24 CPUs, 8 GB RAM, 4 hours walltime, and `OMP_NUM_THREADS=1`.
- Record `gamma_phonon_calculated`, `gamma_stable`, and `full_bz_calculated: false`; never write `dynamically_stable: true` from this screen.
- Do not run GPAW locally, change database or website data, modify jobs 23358060/23359876, touch Nb2S2C, or execute `qsub` without explicit authorization.

---

### Task 1: Implement Gamma-specific result semantics

**Files:**
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/gamma_phonon_workflow.py`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/tests/test_gamma_phonon_workflow.py`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/input/final_relaxed.cif`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/gamma_phonon_results.json`
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/gamma_phonon_summary.txt`

**Interfaces:**
- Consumes: final relaxed five-atom CIF and existing `scripts/tmcc_export.py` calculator conventions.
- Produces: `classify_gamma(frequencies_thz, tolerance_thz) -> dict`, `build_initial_result() -> dict`, restartable `run` command, Gamma CSV, JSON, and summary.

- [ ] **Step 1: Write failing semantic tests**

```python
def test_gamma_classification_uses_explicit_tolerance():
    result = workflow.classify_gamma([-0.07, 0.08, 0.20, 3.1], 0.2)
    assert result["gamma_stable"] is True
    assert result["minimum_frequency_thz"] == -0.07
    assert result["maximum_imaginary_frequency_thz"] == 0.07


def test_metadata_is_gamma_only_and_five_atoms():
    result = workflow.build_initial_result()
    calc = result["calculation"]
    assert result["gamma_phonon_calculated"] is False
    assert result["gamma_stable"] is None
    assert result["full_bz_calculated"] is False
    assert "dynamically_stable" not in result
    assert calc["phonon_qpoints"] == [[0.0, 0.0, 0.0]]
    assert calc["supercell"] == [1, 1, 1]
    assert calc["primitive_atoms"] == 5
    assert calc["force_cell_atoms"] == 5
    assert calc["k_points"] == {"density": 3.5, "gamma": True}
    assert calc["displaced_force_calculations"] == 30
```

Also test the copied CIF hash and that all result/work/cache paths resolve below
`phonon_gamma_primitive_k35`.

- [ ] **Step 2: Run tests and verify the missing-module failure**

Run:

```powershell
& 'C:\Users\ThinkPad\AppData\Local\Programs\Python\Python313\python.exe' -m unittest cluster_calculations\Ta2Se2C-Pbar3m1\phonon_gamma_primitive_k35\tests\test_gamma_phonon_workflow.py -v
```

Expected: FAIL because `gamma_phonon_workflow.py` does not exist.

- [ ] **Step 3: Implement pure metadata and classification**

```python
SUPERCELL = (1, 1, 1)
PHONON_QPOINTS = [[0.0, 0.0, 0.0]]
K_POINT_DENSITY = 3.5
IMAGINARY_TOLERANCE_THZ = 0.2


def classify_gamma(frequencies_thz, tolerance_thz=IMAGINARY_TOLERANCE_THZ):
    values = [float(value) for value in frequencies_thz]
    if not values:
        raise ValueError("Gamma frequencies must not be empty")
    minimum = min(values)
    return {
        "gamma_stable": minimum >= -float(tolerance_thz),
        "minimum_frequency_thz": minimum,
        "maximum_imaginary_frequency_thz": max(
            [abs(value) for value in values if value < 0.0], default=0.0
        ),
        "imaginary_tolerance_thz": float(tolerance_thz),
    }
```

`build_initial_result()` must use `status: not_run`, omit
`dynamically_stable`, and include `scope_note: Gamma-point screen only; not a
full dynamical-stability classification`.

- [ ] **Step 4: Implement the cluster-only run path**

Inside the `run` command, import ASE/GPAW lazily, validate the exact structure
hash and five atoms, then construct:

```python
calculator = GPAW(
    mode=PW(520, dedecut="estimate"),
    xc="PBE",
    kpts={"density": 3.5, "gamma": True},
    occupations=FermiDirac(0.05),
    symmetry="off",
    convergence={"density": 5e-7},
    txt=str(WORK_DIR / "gpaw_gamma_phonon.txt"),
    **gpaw_calculation_kwargs(calculation_settings()),
)
phonons = Phonons(
    atoms,
    calculator,
    supercell=(1, 1, 1),
    delta=0.01,
    name=str(CACHE_DIR / "phonon"),
)
phonons.run()
phonons.read(method="standard", symmetrize=3, acoustic=True)
frequencies_thz = (
    np.asarray(
        phonons.band_structure([[0.0, 0.0, 0.0]], verbose=False),
        dtype=float,
    )[0]
    * 241.7989242084918
)
```

Write `work/gamma_frequencies.csv` with branch indices 0 through 14, save
`work/force_constants.npy`, and atomically replace the initial JSON/summary only
after all outputs exist. Record PBS job ID, GPAW/ASE versions, source hash, 5
force-cell atoms, and `full_bz_calculated: false`.

- [ ] **Step 5: Run tests to green**

Run the Step 2 command again and the existing Ta2Se2C validation tests.

Expected: all tests PASS without importing ASE or GPAW locally.

### Task 2: Add and validate the PBS wrapper

**Files:**
- Create: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/run_pbs_gamma_primitive_k35_24.sh`
- Modify: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/tests/test_gamma_phonon_workflow.py`

**Interfaces:**
- Consumes: Task 1 `run` command.
- Produces: one restartable PBS job package requesting exactly 24 CPUs, 8 GB, and 4 hours.

- [ ] **Step 1: Add failing PBS contract test**

```python
def test_pbs_uses_approved_small_cell_resources():
    text = (ROOT / "run_pbs_gamma_primitive_k35_24.sh").read_text()
    assert "select=1:ncpus=24:mem=8gb" in text
    assert "walltime=04:00:00" in text
    assert "export OMP_NUM_THREADS=1" in text
    assert 'if [[ "$NP" -ne 24 ]]' in text
    assert 'mpirun -np "$NP" gpaw python gamma_phonon_workflow.py run' in text
    assert "qsub" not in text
```

- [ ] **Step 2: Verify the PBS test fails because the file is absent**

Run the Task 1 unit-test command.

Expected: one failure for the missing PBS file.

- [ ] **Step 3: Implement the PBS script**

```bash
#!/usr/bin/env bash
#PBS -N Ta2Se2C-gamma5
#PBS -l select=1:ncpus=24:mem=8gb
#PBS -l walltime=04:00:00
#PBS -j oe

set -euo pipefail
cd "$PBS_O_WORKDIR"
NP="${PBS_NP:-24}"
export OMP_NUM_THREADS=1
export GPAW_SETUP_PATH="/auto/brno2/home/bingu/mypawy/gpaw-setups-0.9.20000"
export PYTHONNOUSERSITE=1
set +u
source /etc/profile.d/30_meta_modules.sh
module load py-gpaw
set -u
if [[ "$NP" -ne 24 ]]; then
  echo "Expected 24 PBS CPUs, got $NP" >&2
  exit 2
fi
mpirun -np "$NP" gpaw python gamma_phonon_workflow.py run
```

- [ ] **Step 4: Verify tests and shell syntax**

Run all Gamma workflow tests, then:

```bash
bash -n cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/run_pbs_gamma_primitive_k35_24.sh
```

Expected: tests PASS and shell syntax exits zero.

### Task 3: Upload, preflight, and stop before submission

**Files:**
- Remote create: `~/tmcc-database/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/`

**Interfaces:**
- Consumes: Tasks 1 and 2 package.
- Produces: remote preflight evidence and exact submission/monitoring commands, but no job ID.

- [ ] **Step 1: Upload only the isolated package**

Use the existing SSH key. Verify the remote directory has no `work/` before a
first run and does not overlap either 40-atom result directory.

- [ ] **Step 2: Run read-only MetaCentrum preflight**

Load `py-gpaw`, validate ASE 3.22.1/GPAW 24.1.0 availability, CIF hash, five
atoms, `1x1x1`, q=(0,0,0), electronic density 3.5, 30+1 force calculations,
24 CPUs, 8 GB, 4 hours, setup path, and `OMP_NUM_THREADS=1`.

- [ ] **Step 3: Report and request authorization**

Provide:

```bash
cd ~/tmcc-database/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35
qsub run_pbs_gamma_primitive_k35_24.sh
```

Also provide a 30-second cache/log monitor. Stop without running `qsub`.

### Task 4: Conditional completion validation

**Files:**
- Create after authorized completion: `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_gamma_primitive_k35/downloaded_from_metacentrum/<job-id>/`

**Interfaces:**
- Consumes: one explicitly authorized primitive Gamma job.
- Produces: verified Gamma frequencies and comparison with jobs 23358060 and 23359876.

- [ ] **Step 1: Monitor without resubmission**

Require 31 nonempty caches and zero empty caches. Inspect GPAW/PBS logs; ignore
key-only qstat error 15010 as an authentication limitation.

- [ ] **Step 2: Download and validate outputs**

Require Gamma JSON, summary, 15-row frequency CSV, force constants, GPAW/PBS
logs, TMCC-0007, exact source hash, five atoms, q=(0,0,0), electronic density
3.5, and the actual job ID.

- [ ] **Step 3: Report the scoped result**

Compare all 15 Gamma frequencies, especially the three acoustic modes, against
the 40-atom jobs. Report `gamma_stable` under 0.2 THz tolerance and explicitly
retain `full_bz_calculated: false`; do not update the database or website.
