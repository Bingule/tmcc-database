# Shared g(V) Stabilization and Contribution Bar Chart Design

Date: 2026-08-27  
Branch: `fix-dunn-literature-plot` (the existing Tools feature branch)  
Status: User-approved design, pending written-spec review

## Scope

Improve the existing R²-guided, regularized Dunn reconstruction where sparse trusted anchors currently allow local dents and high-frequency ripples in the shared capacitive fraction. The mathematical model remains unchanged:

- `i_cap,f(V) = g(V) * i_f(V)`
- `i_cap,r(V) = g(V) * i_r(V)`
- `0 <= g(V) <= 1`

The same change set replaces the current contribution-versus-scan-rate line chart with a labeled 100% stacked bar chart. No homepage redesign, unrelated refactor, new analysis mode, or change to the existing b-value R² filtering is in scope.

## Current Failure Mode

At an R² threshold of 0.95, the reported regression data has approximately 9.3% trusted forward anchors and 4.7% trusted reverse anchors. In the current threshold confidence profile, a small number of high-weight anchors can dominate the weak continuous evidence. The selected smoothness term can then follow noisy local fractions too closely, producing visibly jagged capacitive boundaries even though the reconstruction remains bounded and sign-preserving.

The present finite-difference coefficients are expressed on normalized potential coordinates, but their characteristic-spacing rescaling leaves the aggregate penalty dependent on point count. A denser potential grid can therefore expose more local ripple instead of representing the same continuous smoothness objective.

## Architecture

### Confidence extraction

`cvDunnConfidence` continues to compute local bounded Dunn fractions from `k1`, `k2`, and scan rate. For every valid, untrimmed branch fit it makes both confidence profiles available:

- threshold confidence, including the existing strong trusted-anchor behavior;
- continuous R²-weighted confidence.

The b-value analysis path and its hard R² quality classification remain unchanged.

### Stabilization policy

A focused stabilization module derives reconstruction evidence and quality metrics. It has no knowledge of dataset names and does not reconstruct currents. Its output contains:

- forward and reverse trusted-anchor coverage;
- effective coverage;
- lower branch median R²;
- robust raw-fraction noise;
- the threshold-to-weighted evidence blend factor;
- the adaptive regularization multiplier;
- the effective fraction/confidence grid consumed by the optimizer.

The workflow remains:

1. PCHIP-align the measured forward and reverse branches.
2. Fit local Dunn coefficients, excluding only the requested turning-point trim from those fits.
3. Build threshold and weighted confidence evidence from the same local fractions.
4. Stabilize the evidence and determine the regularization strength.
5. Solve one bounded shared-g(V) problem.
6. Reconstruct both branches only by multiplying their measured/interpolated current by the same g(V).
7. Restore the original sequential CV path and original turning-point records for display and export.

### Reconstruction boundary

`cvDunnReconstruction` remains responsible only for the bounded convex optimization. `cvDunnQuality` remains responsible for reconstructing and validating branch currents. No capacitive or diffusion-current branch receives an independent smoother or fit.

## Low-Anchor-Coverage Stabilization

Let `C_f` and `C_r` be the fractions of eligible forward and reverse Dunn fits with `R² >= threshold`. Eligible fits are finite and untrimmed. Define effective coverage conservatively as:

`C = sqrt(C_f * C_r)`

This prevents a well-covered branch from hiding a poorly covered branch.

In threshold mode, define:

`t = clamp((0.50 - C) / 0.40, 0, 1)`

`beta = 0.85 * (3t² - 2t³)`

The effective pointwise confidence is:

`w_eff = (1 - beta) * w_threshold + beta * w_weighted`

The local fraction is the same physical Dunn fraction in both profiles; changing confidence changes how forward and reverse evidence combine at a potential and how strongly it enters the global fit.

Consequences:

- at `C >= 50%`, `beta = 0` and threshold Dunn evidence is unchanged;
- between 10% and 50%, the transition is continuous with zero-slope endpoints;
- at `C <= 10%`, `beta = 0.85`, so continuous R² evidence dominates while threshold-mode identity is retained;
- weighted mode uses its continuous confidence directly and does not apply the threshold blend.

The threshold remains freely editable. Changing it changes trusted-anchor coverage and therefore changes stabilization continuously rather than producing a second discontinuous cutoff.

## Adaptive Smoothness

### Quality signals

The regularization multiplier uses three bounded deficiency scores:

1. Coverage deficiency:

   `D_C = clamp((0.50 - C) / 0.50, 0, 1)`

2. R² deficiency. Let `R` be the lower of the finite forward and reverse median R² values, using zero when a branch has no finite value:

   `D_R = clamp((0.95 - R) / 0.45, 0, 1)`

3. Raw-fraction noise `N`. Build a diagnostic-only continuous-weighted fraction trend on 101 equally spaced normalized-potential nodes. Fill missing diagnostic nodes linearly between the nearest finite evidence and by the nearest finite endpoint outside that range. Compare it with a centered nine-node running median. Define `N` as the clipped robust residual scale:

   `N = clamp(1.4826 * MAD(residual) / max(IQR(raw trend), 0.10), 0, 1)`

The diagnostic trend and running median are used only to measure noise. They are never used as reconstructed g(V) or as a current branch.

The multiplier is:

`S = clamp(1 + 12D_C² + 6D_R² + 10N², 1, 30)`

This makes sparse coverage the strongest baseline trigger while allowing low median R² and high local noise to add further stabilization. The cap prevents uncontrolled flattening.

### Base and effective regularization

The data-fidelity and roughness measures are made dimensionless before L-curve selection. The base lambda is selected deterministically from a logarithmic candidate grid spanning `1e-8` through `1e-1`. The final solve uses:

`lambda_eff = S * lambda_base`

The internal diagnostics record the selected base lambda, effective lambda, blend factor, quality metrics, convergence status, and optimality residual. Existing export metadata remains compatible, and this work does not add a new user control.

## Potential-Grid-Invariant Objective

Normalize potential to:

`x = (V - V_min) / (V_max - V_min)`

The fidelity term is normalized by total confidence:

`F(g) = sum_i w_i * (g_i - f_i)² / max(sum_i w_i, epsilon)`

For an interior point with left spacing `h_l` and right spacing `h_r`, use the nonuniform second derivative:

`g''_i = 2 * [ (g_(i+1) - g_i) / h_r - (g_i - g_(i-1)) / h_l ] / (h_l + h_r)`

Approximate the continuous curvature integral with local quadrature widths:

`R(g) = sum_i ((h_l + h_r) / 2) * (g''_i)²`

The bounded objective is:

`min_(0 <= g_i <= 1) F(g) + lambda_eff * R(g)`

Both fidelity and curvature now approximate fixed continuous quantities as the potential grid changes. Solver selection is an internal implementation detail; the implementation must satisfy the stated objective, bounds, determinism, optimality residual, and NCP/BP150 regression criteria after the corrected operator is applied.

## Turning Points and Final CV Reconstruction

Turning-point trim affects only the availability/confidence of local Dunn fits. It must not:

- set the global smoothing strength directly;
- truncate the optimization domain;
- remove the return branch;
- replace or average original turning-point currents.

The shared g(V) is solved over the full common branch-potential domain. Values at original path points are evaluated from that smooth bounded result. Single-record turning points remain shared endpoints. Double-record turning points with different currents remain distinct records assigned to their respective adjacent branches. The final plotted and exported CV retains original scan order and original turning-point potentials/currents.

## Contribution Chart

Create a focused `ScientificStackedBarChart` instead of extending the line-chart component with incompatible rendering rules.

- Sort contributions by numeric scan rate.
- Render one 100% stacked bar per scan rate.
- Use the existing capacitive and diffusion colors.
- Fix the y-axis to 0–100% and label the x-axis with the actual scan-rate categories.
- Render both contribution values with two decimal places.
- Center labels inside segments that have adequate height.
- For a very small segment, place its value immediately beside the segment with a short leader so it remains readable and visibly associated with that bar.
- Preserve bilingual title, legend and accessible SVG text.
- Preserve the existing export id and metadata so SVG/PNG export continues to work.
- Preserve the contribution data table and selectable-column copy behavior.
- Give the SVG a count-aware minimum width inside a horizontally scrollable shell so up to 20 scan rates remain legible on mobile.

## Error Handling

If no finite fraction evidence exists in either branch, raise the existing visible `reconstructionFailed` workflow error instead of returning an arbitrary constant fraction. Any non-finite quality metric, invalid grid spacing, failed optimizer convergence, violated box constraint, sign reversal, or reconstruction mismatch must surface through the existing localized visible error path rather than fail silently.

## Tests and Acceptance Criteria

### Unit tests

- The blend factor is zero at or above 50% effective coverage, reaches 0.85 at or below 10%, is continuous and monotonic between them, and reacts when either branch loses coverage.
- Weighted mode is not changed into threshold mode and does not use the threshold blend.
- The smoothing multiplier increases monotonically when coverage falls, median R² falls, or robust fraction noise rises, and remains within 1–30.
- The continuous curvature penalty is zero for a linear g(x) on uniform and nonuniform grids.
- Resampling the same smooth function onto grids differing by tenfold produces comparable normalized curvature.
- The optimizer remains deterministic, converges to the box-constrained optimum, and rejects invalid inputs.
- Every reconstructed point satisfies the exact shared-g multiplication, sign, magnitude, and sum identities.

### Regression tests

Use portable NCP and BP150 regression fixtures in automated tests and locally run the original available NCP CSV/XLSX and combined BP150 data.

For threshold and weighted modes:

- all g(V) values are finite and bounded;
- all branch currents are finite, sign-preserving, and non-overshooting;
- forward and reverse branches use exactly the same g(V);
- contribution percentages are finite, bounded, and sum to 100%;
- original sequence and single/double turning-point records are restored;
- high-frequency local extrema and normalized roughness are reduced relative to the pre-change baseline without removing broad morphology;
- deterministic-noise and low-confidence-gap fixtures remain stable when grid density changes tenfold;
- when the same noisy model is sampled on grids differing by tenfold, contribution percentages differ by less than 0.5 percentage point and g(V) differs by less than 0.02 at normalized potentials 0, 0.25, 0.5, 0.75, and 1.

Generate NCP and BP150 result plots after implementation and visually check for small artificial dents, ripples, sign reversal, overshoot, or missing return branches.

### Chart tests

- One bar is rendered for every contribution and scan rates appear in ascending numeric order.
- Each bar's segment heights sum to 100%.
- Both numeric percentage labels are rendered and remain associated with the correct bar.
- Very small segments use the compact external-label fallback.
- English and Simplified Chinese labels work.
- Export metadata/id, the data table, and column-copy controls remain intact.

### Final verification

Run the focused test suites, full test suite, TypeScript `--noEmit` check, production Vite build, and `git diff --check`. Deploy only after all checks pass. Deployment must use the current feature branch workflow and must not merge the branch automatically.
