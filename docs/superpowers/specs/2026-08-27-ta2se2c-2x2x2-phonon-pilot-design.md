# Ta2Se2C 2×2×2 Phonon Pilot Design

## Goal

Calculate the full-Brillouin-zone harmonic phonons of mechanically stable `Ta2Se2C-Pbar3m1` (`TMCC-0007`) as a second single-material pilot. This calculation tests dynamical stability only; it does not repeat the elastic calculation, update TMCCDB, or start a batch workflow.

## Verified source state

- The current material record reports `mechanical.mechanically_stable: true` and a stable trigonal Born assessment.
- The completed mechanical result comes from MetaCentrum job `23167797.pbs-m1.metacentrum.cz`, with elastic-fit RMSE 0.03133406033219973 GPa.
- The source is the completed remote `work/final.cif`, not an original or website CIF.
- The final structure contains five atoms and has SHA-256 `8d39cde64ae3d1989e78296151017654e49d81b4fef061e09e717cc8b3cf4b36`.

## Calculation design

- Create an isolated `cluster_calculations/Ta2Se2C-Pbar3m1/phonon_test_2x2x2` directory.
- Reuse the exact final relaxed structure without further relaxation.
- Preserve the real three-dimensional periodic cell and c axis.
- Use ASE 3.22.1 finite displacements with GPAW 24.1.0 forces.
- Keep the validated settings: PBE, 520 eV plane-wave cutoff, Fermi–Dirac width 0.05 eV, k-point density 2.5 with Gamma convention, PAW setup handling from the material workflow, and GPAW symmetry disabled for displaced calculations.
- Use a central displacement of 0.01 Å, a 2×2×2 supercell, force-constant symmetrization, and acoustic sum-rule correction.
- Sample the same 21×21×11 q mesh and `GMKGALHA,LM,KH` band path used for the Nb2S2C pilots.
- Classify a mode as significantly imaginary only below −0.2 THz.

## Workload and resources

- Primitive cell: 5 atoms.
- Supercell: 2×2×2, 40 atoms.
- Workload: 30 central-displacement force calculations plus one equilibrium reference; each calculation contains 40 atoms.
- PBS request: 32 CPUs, 32 GB RAM, and 24 hours walltime with `OMP_NUM_THREADS=1`.
- Expected wall time: approximately 1–2 hours, subject to Ta/Se electronic convergence and queue scheduling.

## Isolation, recovery, and outputs

- Keep all Nb2S2C results and all Ta2Se2C mechanical/electronic files unchanged.
- Use new relative work, cache, result, figure, and log paths in the Ta2Se2C phonon directory.
- On rerun, remove only zero-byte ASE cache entries and preserve completed nonempty entries.
- Produce `phonon_results.json`, `phonon_summary.txt`, force constants, q-mesh frequencies, band CSV, dispersion SVG, GPAW log, PBS log, and the complete displacement cache.
- Record the source structure checksum, source mechanical job, phonon job ID, software versions, calculation parameters, minimum frequency, imaginary-mode magnitude, and stability classification.

## Validation and submission gate

Before submission, tests must verify material identity, five-atom primitive structure, exact source checksum, 2×2×2/40-atom metadata, 30+1 workload, physics settings, 32-CPU/32-GB/24-hour PBS request, shell syntax, isolated paths, resumability, and absence of database or website changes. Upload and one `qsub` occur only after explicit authorization for this Ta2Se2C job.
