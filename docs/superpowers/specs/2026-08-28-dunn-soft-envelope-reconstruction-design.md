# Dunn Soft-Envelope Reconstruction Design

**Date:** 2026-08-28

**Status:** User-approved design (Scheme A)

## Goal

Replace the final pointwise CV-envelope projection with a minimal-distortion, soft-constrained refinement of the existing shared capacitive fraction. The final reconstruction should retain the natural morphology of the current regularized Dunn result while discouraging visible local envelope crossings.

## Scope

This change is limited to Dunn reconstruction, its diagnostics, exports, and tests. It does not change data import, cycle normalization, branch interpolation, b-value analysis, peak analysis, translations unrelated to Dunn diagnostics, or other page layout.

## Root Cause

The current pipeline first solves a smooth shared fraction `g0(V)`, then calls a pointwise envelope projection independently for the forward and reverse currents. In same-sign regions, that projection can force the lower-magnitude branch onto the measured CV boundary. It also makes the effective fraction branch-dependent even though the stored `g(V)` remains shared. The visible result is a compressed or flattened capacitive boundary.

Strict local envelope containment, one shared `g(V)`, and `0 <= g(V) <= 1` cannot always all hold without distortion. If both measured branch currents have the same sign, the branch closer to zero can require `g(V) = 1` to lie inside the interval between the measured branches. The new design therefore treats envelope containment as a soft objective and reports the residual instead of silently changing the branch fraction.

## Reconstruction Architecture

### Baseline

Keep the existing confidence-aware regularized solution as `g0(V)`. It remains responsible for R²-guided fitting, sparse-anchor stabilization, and the original normalized-potential smoothness selection.

### Soft-envelope refinement

Add a second pure optimization step on the common aligned potential grid. It receives:

- normalized potentials;
- `g0(V)`;
- aligned forward and reverse currents for the selected scan rate;
- scale-aware envelope tolerance;
- fixed, documented fidelity, smoothness, and envelope-penalty weights.

It minimizes the positive objective

`sum(w_i * (g_i - g0_i)^2) + lambda_s * sum((Delta2 g_i)^2) + lambda_env * sum(P_env(i))`

subject to `0 <= g_i <= 1`.

`Delta2` uses the existing normalized-potential second-difference operator so behavior is invariant to physical grid density. `P_env(i)` is the sum of squared hinge violations for `g_i * i_forward,i` and `g_i * i_reverse,i` relative to the local interval

`[min(i_forward,i, i_reverse,i), max(i_forward,i, i_reverse,i)]`.

The hinge is inactive within a scale-aware tolerance. A violation larger than the tolerance grows quadratically. Fidelity weights are finite, positive, and scale-normalized so the optimization changes `g0(V)` only where the envelope term provides evidence that correction is needed.

The projected solver continues to enforce only the hard box `0 <= g <= 1`. It must be deterministic and must report convergence and residual diagnostics. No capacitive current branch is fitted or smoothed independently.

### Canonical reconstruction

The refined shared fraction is the only fraction used by the final contribution:

- aligned forward: `i_cap,f(V) = g(V) * i_f(V)`;
- aligned reverse: `i_cap,r(V) = g(V) * i_r(V)`;
- native ordered points: evaluate the same refined `g(V)` with PCHIP and multiply it by the original measured current;
- synthetic zero crossings: remain exactly zero.

Remove final pointwise envelope projection from both aligned and ordered reconstruction. Preserve `0 <= g <= 1`, current sign, and `abs(i_cap) <= abs(i_raw)` through the shared-fraction box constraint. Preserve turning-point samples and original scan order.

## Diagnostics and Validation

Continue to calculate, display, and export:

- maximum upper, lower, and absolute envelope residual;
- maximum difference between `g0(V)` and refined `g(V)`;
- number and percentage of points with residual above the numerical tolerance;
- solver convergence and optimality information;
- sign and magnitude containment diagnostics.

Envelope residual is no longer a hard validation failure by itself because controlled residual is part of the approved trade-off. Validation still fails visibly for:

- non-finite reconstruction values;
- `g(V)` outside `[0, 1]` beyond tolerance;
- current sign reversal;
- `abs(i_cap) > abs(i_raw)` beyond tolerance;
- inconsistent array/grid lengths;
- soft-refinement non-convergence or invalid objective data.

The tolerance is scale-aware: a small multiple of machine-scale reconstruction tolerance times `max(1, maximum absolute measured current)`. It prevents floating-point crossings from attracting visible correction while remaining negligible relative to scientific current values.

## Data Consistency

The same canonical ordered record stream supplies:

- the Dunn line chart;
- shaded capacitive/diffusion polygons;
- numerical area integration and contribution percentages;
- clipboard and CSV exports;
- residual diagnostics.

There is no display-only smoothing or resampling that changes the reconstructed currents. Existing deterministic display downsampling may select points but may not recompute their values.

## Testing

Use test-driven development.

1. Add a failing unit test showing that same-sign branches are not pointwise flattened to the measured boundary and that the refined result is closer to `g0(V)` than the old hard projection.
2. Prove one shared fraction produces both branches at every aligned point.
3. Prove `0 <= g <= 1`, sign preservation, and magnitude containment.
4. Prove envelope penalty is zero within tolerance, increases quadratically outside it, and causes stronger correction for larger violations.
5. Prove second-order smoothing is invariant to potential-grid density.
6. Prove native ordered records, aligned arrays, chart data, area integration, and exports use the same refined reconstruction.
7. Run NCP and BP150 regression datasets at every scan rate and compare morphology, envelope residual, shared-fraction fidelity, turning-point continuity, and numerical containment.
8. Run the complete test suite and production build.

## Acceptance Criteria

- No final pointwise hard envelope clipping remains in the Dunn reconstruction path.
- Forward and reverse capacitive currents are generated from exactly one refined shared `g(V)`.
- Refined `g(V)` stays in `[0, 1]`; sign and branch magnitude containment remain strict within numerical tolerance.
- The soft objective modifies `g0(V)` only where needed and produces smoother, less compressed same-sign regions than the current projection.
- Large envelope crossings receive stronger correction than small crossings; floating-point-scale crossings do not visibly deform the curve.
- Plotting, shading, integration, diagnostics, and export all consume the same final values.
- NCP and BP150 regression checks, the full automated test suite, and the production build pass.
- Work remains on `fix-dunn-literature-plot`; no automatic merge to `main`.
