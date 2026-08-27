# Ta2Se2C Phonon Numerical Validation Design

## Scope

Validate whether the near-Gamma imaginary acoustic mode in the completed
Ta2Se2C-Pbar3m1 phonon calculation is a numerical artifact. Ta2Se2C is handled
first because its minimum frequency is weaker than the corresponding Nb2S2C
mode. Nb2S2C is out of scope until a defensible protocol is established.

The existing MetaCentrum result from job
`23358060.pbs-m1.metacentrum.cz` remains immutable. No database or website
content is updated during validation.

## Existing Evidence

- Material: Ta2Se2C-Pbar3m1, TMCC-0007.
- Final relaxed five-atom structure SHA256:
  `8d39cde64ae3d1989e78296151017654e49d81b4fef061e09e717cc8b3cf4b36`.
- Baseline calculation: 2x2x2 supercell, 40 atoms, 0.01 Angstrom
  displacement, k-point density 2.5, 30 central displacements plus one
  equilibrium reference.
- The baseline already used three force-constant symmetrization iterations and
  `acoustic=True`.
- The Gamma-point minimum is -0.0744 THz, within the 0.2 THz numerical-noise
  tolerance.
- The band-path minimum is -0.3700 THz on the lowest acoustic branch at a
  reduced q coordinate near Gamma, approximately (0.031, 0.031, 0).

These observations rule out simply relabeling the result by increasing the
tolerance. The off-Gamma softening must be tested for force-drift, electronic,
displacement-amplitude, and finally finite-supercell sensitivity.

## Validation Sequence

### Stage 1: Existing-cache post-processing

Reassemble the downloaded 31 nonempty ASE cache entries without running GPAW.
Use the same ASE 3.22.1 semantics as the cluster calculation and compare:

- standard central-difference force treatment;
- Frederiksen force-drift correction;
- three and ten force-constant symmetrization iterations;
- acoustic correction on and off, with the uncorrected result retained only as
  a diagnostic.

For every variant, generate the same band path and full q mesh used by the
baseline and record the minimum frequency, q point, branch, and Gamma acoustic
frequencies. Derived files go into a new local validation directory and do not
overwrite the downloaded baseline.

### Stage 2: Denser-k-point force calculation

If Stage 1 retains a significant off-Gamma imaginary mode, prepare one isolated
MetaCentrum job with the baseline physics and structure, changing only k-point
density from 2.5 to 3.5. Keep PBE, 520 eV cutoff, FermiDirac 0.05 eV, 0.01
Angstrom displacement, 2x2x2 supercell, 32 MPI ranks, one thread per rank,
32 GB memory, and 24 hours walltime.

The job performs 30 displaced-force calculations and one equilibrium reference.
It must use a new cache and result directory, remain restartable, and never be
submitted without explicit user authorization.

### Stage 3: Displacement-amplitude check

If the denser-k-point result remains below -0.2 THz, prepare a second isolated
job at k-point density 3.5 and change only the displacement from 0.01 to 0.02
Angstrom. This tests whether the soft branch is dominated by force noise. It is
also subject to a separate submission authorization.

### Stage 4: Supercell decision gate

A 3x3x2, 90-atom calculation is not part of the initial implementation. It is
considered only if Stages 2 and 3 show a converged soft branch whose magnitude
could plausibly depend on the finite interaction range. Its design and resource
request require a new user decision.

## Classification

The fixed significant-imaginary-mode tolerance remains 0.2 THz.

- Stable: both the full q mesh and band path remain at or above -0.2 THz in
  consistent high-precision settings.
- Numerically inconclusive: the classification changes with k-point density,
  displacement amplitude, or post-processing method, or the minima do not
  converge to within 0.1 THz.
- Robust imaginary mode: the same branch and reciprocal-space region remain
  below -0.2 THz in the denser-k-point and displacement-amplitude checks.

No result is adjusted to obtain a preferred classification. Experimental
synthesis is relevant physical context but does not replace numerical
convergence or the stated harmonic criterion.

## Outputs and Preservation

Each stage records calculation parameters, source-structure hash, source job,
minimum and maximum imaginary frequencies, minimum q point and branch, Gamma
frequencies, band data, q-mesh data, and provenance. Existing Ta2Se2C and
Nb2S2C files remain unchanged. No database or website update occurs in this
work.

## Resource Estimate

Stage 1 requires no GPAW calculation and should complete locally in minutes.
Each 40-atom MetaCentrum stage requests 32 CPUs, 32 GB RAM, and 24 hours. Based
on the 41-minute baseline, the denser k-point jobs are expected to take roughly
one to two hours, subject to queue and SCF behavior.
