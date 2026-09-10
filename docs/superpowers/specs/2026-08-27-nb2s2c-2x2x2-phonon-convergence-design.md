# Nb2S2C 2×2×2 Phonon Convergence Design

## Goal

Recheck the preliminary imaginary phonon modes of mechanically stable `Nb2S2C-Pbar3m1` (`TMCC-0001`) with a 2×2×2 finite-displacement supercell. This is a same-material convergence calculation only; it does not update TMCCDB and does not start a batch workflow.

## Starting structure and physics settings

- Reuse the exact final relaxed structure already used by the completed 2×2×1 pilot. Do not relax it again and do not regenerate it from CIF source data.
- Preserve three-dimensional periodicity and the actual relaxed c axis.
- Keep the validated GPAW settings unchanged: PBE, 520 eV plane-wave cutoff, Fermi–Dirac width 0.05 eV, k-point density 2.5 with the established Gamma convention, the existing PAW setup path, and GPAW symmetry disabled for displaced force calculations.
- Use a central displacement of 0.01 Å and the same 0.2 THz imaginary-mode tolerance.
- Use the same q mesh and high-symmetry band path as the 2×2×1 pilot so the two results are directly comparable.

## Isolation and recovery

- Create `cluster_calculations/Nb2S2C-Pbar3m1/phonon_test_2x2x2` as a separate calculation directory.
- Copy the validated final relaxed input into the new directory and verify its SHA-256 checksum against the 2×2×1 input.
- Use a new work directory, ASE displacement cache, result JSON, summary, force constants, dispersion data, figure, and PBS log namespace.
- Preserve all completed 2×2×1 files. A rerun removes only zero-byte cache entries and skips completed nonempty displacement cache entries.

## Workload and resources

- Primitive cell: 5 atoms.
- Supercell: 2×2×2, 40 atoms.
- ASE finite displacement workload: 30 displaced-force calculations plus one equilibrium reference calculation. Each calculation contains 40 atoms.
- PBS resources: 32 CPUs, 32 GB memory, and 24 hours walltime, with one OpenMP thread per MPI rank.
- Expected wall time: approximately 1–3 hours; the scheduler accounting record will be used to report actual elapsed time and peak memory after completion.

## Outputs and comparison

The new directory will produce its own `phonon_results.json`, human-readable summary, force constants, q-mesh frequencies, band CSV, dispersion SVG, GPAW log, and recoverable displacement cache. The JSON will state the 2×2×2 supercell, 40-atom workload, calculation parameters, provenance, minimum frequency, maximum imaginary-mode magnitude, and dynamical-stability decision.

The final assessment will compare the 2×2×2 minimum modes with the completed 2×2×1 result of approximately −0.558 THz. A frequency below −0.2 THz is significant under the existing criterion. The outcome remains a dynamical-stability result only and will not be imported into the database in this task.

## Validation and submission gate

Before submission, automated checks must verify the 2×2×2 constants and metadata, 40-atom count, 32-CPU/32-GB/24-hour PBS request, shell syntax, Python syntax, input checksum, isolated paths, resumability, and absence of database or website changes. Upload and `qsub` occur only after explicit authorization for this new job.
