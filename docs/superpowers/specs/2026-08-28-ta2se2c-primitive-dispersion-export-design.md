# Ta2Se2C five-atom primitive dispersion export design

## Goal

Export a band-structure-style phonon plot from the completed five-atom
`Ta2Se2C-Pbar3m1` Gamma-screen cache without running any new GPAW force
calculation or submitting another PBS job.

The export is a diagnostic `1 x 1 x 1` primitive-cell approximation. It must
not be presented as a converged full-Brillouin-zone dynamical-stability result.

## Existing inputs

- Material: `TMCC-0007`, `Ta2Se2C-Pbar3m1`.
- Structure: the completed calculation's `input/final_relaxed.cif`.
- Cache: `work/cache/phonon`, containing 31 non-empty force records from job
  `23360639.pbs-m1.metacentrum.cz`.
- Force model: ASE finite displacement, `1 x 1 x 1`, 5 atoms, displacement
  `0.01 Angstrom`.
- Force-constant reconstruction: `method="standard"`, `symmetrize=3`, and
  acoustic sum-rule correction, matching the completed Gamma workflow.

## Export design

Add one isolated post-processing helper beside the Gamma workflow. It will:

1. validate the exact source-structure checksum and all 31 non-empty cache
   records;
2. reconstruct the existing force constants with `ase.phonons.Phonons` using
   `calc=None`, so no GPAW calculator or force evaluation can occur;
3. sample the same hexagonal high-symmetry path used by the established
   40-atom workflow: `GMKGALHA,LM,KH`, with 241 path points;
4. convert ASE energies to THz and export all 15 branches;
5. write a CSV, an SVG plot, and a JSON provenance sidecar under `work/`.

The figure title and provenance sidecar must contain the phrase
`1x1x1 primitive-cell approximation`. The zero-frequency line and the
`-0.2 THz` numerical-tolerance reference must be visible. The outputs must not
set or modify `dynamically_stable`, `gamma_stable`, or any database field.

## Outputs

- `work/primitive_phonon_band.csv`: path-point index, reciprocal coordinates,
  cumulative path coordinate, and 15 frequency columns in THz.
- `work/primitive_phonon_dispersion.svg`: the band-style 15-branch plot.
- `work/primitive_dispersion_metadata.json`: material identity, source job,
  structure checksum, supercell, cache count, path, point count, frequency
  extrema, and the approximation warning.

Existing Gamma results, the 40-atom calculations, mechanical/electronic
results, website data, and database data remain unchanged.

## Execution and recovery

Run the helper as serial post-processing in the already validated MetaCentrum
GPAW/ASE module environment. It performs no `qsub`, MPI, or local GPAW force
calculation. Writes use temporary files followed by replacement so an
interrupted export can be rerun safely. Existing output files are replaced only
inside this five-atom calculation's dedicated `work/` directory.

## Validation

Automated tests will verify that:

- the helper uses `calc=None` and the exact existing cache;
- the path, 241-point sampling, 15-branch schema, and warning text are fixed;
- no force-running or job-submission entry point is present;
- synthetic CSV/SVG/metadata exports preserve negative frequencies and units.

After remote post-processing, verify 31 non-empty cache records, all three
non-empty outputs, 241 CSV data rows, 15 frequency columns, matching material
and job provenance, and unchanged completed Gamma-result checksum.
