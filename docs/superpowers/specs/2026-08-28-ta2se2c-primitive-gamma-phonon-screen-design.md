# Ta2Se2C Primitive-Cell Gamma Phonon Screen Design

## Goal

Run a low-cost zone-center phonon screen for Ta2Se2C-Pbar3m1 using its existing
five-atom final relaxed primitive cell. This screen answers only whether the
Gamma-point modes contain a significant imaginary frequency. It does not
replace the completed full-Brillouin-zone phonon calculations.

## Calculation

- Material: Ta2Se2C-Pbar3m1, TMCC-0007.
- Input: the existing final relaxed five-atom structure with SHA256
  `8d39cde64ae3d1989e78296151017654e49d81b4fef061e09e717cc8b3cf4b36`.
- Periodicity: three-dimensional bulk periodicity is retained.
- ASE phonon supercell: 1x1x1, five atoms.
- Phonon q points: Gamma only, `(0, 0, 0)`.
- Finite displacement: central differences with 0.01 Angstrom displacement.
- Force workload: 30 displaced calculations plus one equilibrium reference.
- Electronic sampling: GPAW k-point density 3.5 with Gamma centering. This is
  not an electronic Gamma-only calculation.
- Electronic settings: PBE, 520 eV plane-wave cutoff, FermiDirac 0.05 eV,
  GPAW symmetry disabled, and the existing PAW setup/module conventions.
- Force constants: standard ASE treatment, three symmetrization iterations,
  and the acoustic sum rule enabled.

The calculation reuses the established Ta2Se2C workflow and writes to a new
directory. It does not rerun structural relaxation and does not modify the
2x2x2 jobs `23358060` or `23359876`.

## Classification

The significant-imaginary-mode tolerance remains 0.2 THz.

- `gamma_phonon_calculated: true` after all force calculations and assembly
  complete.
- `gamma_stable: true` when every Gamma-point frequency is at or above
  -0.2 THz.
- `gamma_stable: false` when any Gamma-point frequency is below -0.2 THz.

The result must not populate or overwrite the database-wide
`dynamically_stable` field because off-Gamma modes are intentionally absent.
The output explicitly states `full_bz_calculated: false`.

## Outputs

The isolated result directory contains:

- a PBS shell script;
- a Python helper script;
- the copied final relaxed CIF;
- restartable ASE displacement cache;
- Gamma frequencies and mode indices in JSON and CSV;
- a human-readable summary;
- calculation and source provenance.

The JSON records the existing full-BZ results only as comparison references,
not as inputs to the Gamma classification.

## Resources and Submission Gate

Use the previously successful small-cell resource profile: 24 CPUs, 8 GB RAM,
and 4 hours walltime, with `OMP_NUM_THREADS=1`. The exact resource request is
validated before upload. Upload and read-only preflight are allowed after
implementation, but `qsub` requires a separate explicit user authorization.

## Interpretation

A stable result means only "stable at Gamma under this harmonic numerical
setup." It is expected to reproduce the already observed small Gamma acoustic
frequencies from the 2x2x2 calculations within reasonable finite-supercell
differences. It cannot establish full dynamical stability and cannot be used to
erase or relabel the verified off-Gamma soft branch.
