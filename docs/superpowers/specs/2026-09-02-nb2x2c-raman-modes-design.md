# Nb2S2C / Nb2Se2C Raman-mode calculation design

## Scope

Prepare and run one independent finite-displacement calculation for each of
`Nb2S2C-Pbar3m1` (TMCC-0001) and `Nb2Se2C-Pbar3m1` (TMCC-0003).  Do not update
the website or database and do not overwrite any earlier phonon calculation.

## Scientific method

- Start from the repository's final structure for TMCC-0001 and the published
  TMCC-0003 structure used by the mechanical result.  Validate composition,
  five-atom primitive-cell size, periodicity, and equilibrium residual forces.
- Use ASE finite displacements with GPAW/PBE, 520 eV PW cutoff,
  FermiDirac(0.05 eV), gamma-centred k-point density 2.5, and displacement
  0.01 Angstrom.
- Use a 2x2x2 supercell (40 atoms), 30 displaced-force calculations plus one
  equilibrium reference, acoustic-sum-rule restoration, and force-constant
  symmetrisation.  Electronic sampling is not Gamma-only.
- Stop before interpreting modes if the equilibrium maximum force exceeds
  0.03 eV/Angstrom.  This is a validity gate, not a structural relaxation.
- Extract the 15 primitive-cell Gamma modes, frequencies in THz and cm-1,
  complex eigenvectors, dominant atoms, in-plane/out-of-plane character, and
  Raman-active symmetry assignment where determinable from P-3m1 (D3d).
- Export calculated peak positions and assignments only.  Do not claim Raman
  intensities or a quantitative Raman spectrum because polarizability
  derivatives/Raman tensors are outside the current GPAW workflow.

## Execution and recovery

Each material has its own directory, cache, PBS log, and result files.  Each
PBS job requests 32 CPUs, 32 GB RAM, and four hours.  Existing non-empty ASE
cache files are retained and skipped on restart.  A four-hour limit is expected
to be sufficient based on the earlier 48-minute Nb2S2C 2x2x2 run, but completion
is not guaranteed; a timed-out job remains restartable.

## Outputs

Each job produces force constants, Gamma frequencies/eigenvectors, a CSV mode
table, JSON provenance, a human-readable assignment summary, and a broadened
frequency-only comparison plot.  Results remain in the repository/remote job
directory until the user explicitly requests export.  Only after that request
may files be copied to
`F:\mypaper\62-TMCC-CVT\Raman\simulated_Raman`.

