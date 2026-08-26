# Dunn R²-Guided Constrained Reconstruction Design

**Date:** 2026-08-26  
**Branch:** `fix-dunn-literature-plot`  
**Status:** Approved design  
**Source of truth:** “Codex Task — Upgrade Dunn Analysis with R²-Guided Constrained Reconstruction” plus the user's subsequent Scheme A confirmations.

## 1. Objective

Upgrade the existing CV/Dunn workflow to a general-purpose, publication-style implementation based on:

1. standard branch-separated Dunn fitting;
2. local R² confidence;
3. one shared, bounded capacitive fraction `g(V)`;
4. explicit smoothness regularization of `g(V)`;
5. reconstruction from the original interpolated CV currents:

   `i_cap,forward(V) = g(V) i_forward(V)`

   `i_cap,reverse(V) = g(V) i_reverse(V)`

   with `0 <= g(V) <= 1`.

The change must preserve the working single-file import, scan-rate parsing, b-value formula, CV plotting, result tables, bilingual UI, and export infrastructure wherever their behavior is not explicitly changed below.

## 2. Scope and Non-Goals

### In scope

- Remove row-based “Skip N points” analysis.
- Add Auto/manual potential interval in mV.
- Detect and normalize one complete CV loop recorded with one or two turning points.
- Ignore data after the selected complete loop when it is an incomplete next cycle.
- Normalize seam-split loops into one logical forward and one logical reverse branch.
- Interpolate each logical branch with PCHIP over a common potential range.
- Add Auto/manual turning-point trim for Dunn fitting only.
- Preserve both Dunn modes:
  - R² threshold, default 0.95;
  - R² weighted.
- Apply a confidence-weighted, explicitly regularized, bounded optimization for shared `g(V)`.
- Reconstruct continuous capacitive and diffusion-controlled currents.
- Produce continuous publication-style Dunn shading and diagnostics.
- Preserve existing b-value R²-threshold behavior.
- Validate with NCP, BP150, and synthetic regression data.

### Non-goals

- No multi-file production upload UI.
- No image-level correction or manual plot editing.
- No dataset-name, scan-rate, voltage-window, or expected-percentage special cases.
- No separate language-specific routes.
- No runtime machine translation.
- No unrelated page redesign or homepage changes.

## 3. Existing Implementation and Identified Gaps

The current code already provides:

- CSV/TXT/XLSX parsing for one XYYYYY or XYXYXY table;
- scan-rate inference and manual scan-rate entry;
- original row-order preservation;
- one/two-turning-point splitting;
- branch metadata;
- common-range interpolation;
- b-value and Dunn linear regressions;
- R² classification;
- CSV and figure export;
- bilingual UI and responsive result layout.

The current Dunn workflow is not sufficient for the approved method because it:

- aligns grids from existing sample potentials and linear interpolation rather than an explicit potential interval and PCHIP;
- leaves a seam-started forward sweep split into first and final fragments instead of normalizing it into one logical branch;
- removes low-R² Dunn coefficients from contribution reconstruction, producing nulls and fragmented areas;
- uses independent `k1 v` and `k2 sqrt(v)` currents directly as plotted boundaries;
- has no shared `g(V)` optimization or explicit smoothness regularization;
- has no Auto turning-point trim, endpoint reconnection, or required constrained-reconstruction diagnostics.

## 4. Real-Data Findings

### BP150

Five source CSV files contain 0.2, 0.4, 0.6, 0.8, and 1.0 mV/s scans. They were combined, without modifying the sources, into one XYXYXY analysis table:

`D:\codex_communication\BP150-combined-XYXYXY.csv`

The combined table has 1,514 rows, 10 numeric columns, and no missing values. Each scan retains its own potential column because the 0.8 mV/s potential samples are not exactly row-for-row identical to all other scans.

Each BP150 series begins near -1.000 V, turns near 0.39847 V, turns again near -1.10315 V, and closes near -1.00199 V. This is a complete loop whose file seam lies inside one sweep branch. The first and last same-direction fragments must be joined into one logical branch before fitting.

The robust native potential interval is approximately 1.98 mV. Preliminary standard Dunn fitting shows uneven R² quality, especially on the reverse branch, so BP150 is an important test that low-confidence regions remain continuous while still producing a caution warning.

### NCP

The NCP XYXYXY dataset contains five scans with approximately 1,998–2,001 points and a native interval near 0.92 mV. Some series have one turning point and some have two because their file seams differ. The normalized branch directions are nevertheless compatible. This dataset verifies cyclic-seam normalization, differing point counts, duplicated/singly recorded endpoints, and CSV/XLSX import equivalence.

## 5. High-Level Data Flow

1. Parse one existing XYYYYY or XYXYXY file.
2. Confirm scan rates and numeric series using the existing import path.
3. Detect one complete loop independently for every scan rate.
4. Split direction runs and normalize cyclic seams.
5. Validate that all scans resolve to one compatible forward and one compatible reverse sweep.
6. Determine native potential resolution and the common branch range.
7. Resolve Auto/manual potential interval.
8. PCHIP-interpolate forward branches separately and reverse branches separately.
9. Run b-value fitting on the common grid with existing R²-threshold behavior.
10. Resolve Auto/manual Dunn turning-point trim.
11. Run forward and reverse Dunn fits independently outside the trimmed reversal regions.
12. Calculate local branch fractions and R² confidence.
13. Solve the bounded, regularized shared-`g(V)` optimization for each target scan rate.
14. Restore/reconnect the complete turning regions.
15. Reconstruct capacitive and diffusion-controlled currents.
16. Integrate contribution areas.
17. Run quality validation and generate diagnostics.
18. Render tables, continuous figures, warnings, and exports.

## 6. Cycle Detection and Branch Normalization

Cycle detection operates on the original sequential potential/current samples and does not mutate them.

### Direction detection

- Determine native resolution from the median non-zero absolute potential difference.
- Treat changes below a scale-aware numeric tolerance as a plateau rather than a new direction.
- Preserve the measured samples, including duplicated reversal potentials; direction detection uses a derived view only.

### Complete-loop selection

- A valid candidate must contain both sweep directions and return to its starting potential within a closure tolerance derived from native resolution and total potential span.
- Select the earliest complete candidate in file order.
- Ignore subsequent samples only when they belong to an incomplete next loop.
- Accept one or two turning points for a complete loop.
- Reject more complex or incompatible direction structures with a visible localized error.

### Seam normalization

- A one-turn loop that starts at an extremum already contains one full forward and one full reverse branch.
- In a two-turn loop, the first and last runs have the same direction. Join them cyclically around the file seam to create one logical monotonic branch.
- Keep the opposite-direction middle run as the second logical branch.
- Preserve the original sequential loop for display and export metadata.

### Turning-point ownership

- A singly recorded turning point is shared by adjacent branches.
- Two samples at the same turning potential with different currents remain separate: the first belongs to the incoming branch and the second to the outgoing branch.
- No forward/reverse current averaging is allowed.
- Duplicate-potential samples remain available in raw data. The interpolation view uses deterministic branch ownership so PCHIP receives strictly increasing potential coordinates.

## 7. Common Range, Potential Interval, and PCHIP

### Common range

- Calculate the overlap shared by every normalized forward branch.
- Calculate the overlap shared by every normalized reverse branch.
- Use the overlap supported by both logical directions for Dunn fitting and contribution comparison.
- Never extrapolate outside a branch’s measured range.

### Auto potential interval

- For each valid logical branch, calculate `median(abs(diff(V)))` using non-zero changes.
- Aggregate branch estimates robustly with a median.
- Choose a grid count that spans the common range while keeping the resolved interval close to the native estimate and including exact common-range endpoints.
- Do not oversample beyond the native resolution without a numerical endpoint reason.
- Manual input is expressed in mV, converted to volts internally, and validated against the span and finite positive limits.

### PCHIP interpolation

- Use a local monotonic cubic Hermite algorithm with Fritsch–Butland/Fritsch–Carlson-style slopes.
- Interpolate current as a function of potential separately for forward and reverse branches.
- Require strictly increasing interpolation coordinates within each derived branch view.
- Preserve broad peak morphology and avoid cubic overshoot.
- Do not smooth measured current during interpolation.
- Do not interpolate by row index.

## 8. Turning-Point Trim

Turning-point trim affects Dunn fitting only. Original/interpolated CV curves and final reconstructed endpoints remain present.

Auto starts from:

`max(3 * nativeInterval, 0.005 * commonSpan)`

and applies scale-aware lower/upper bounds based on native resolution and common span. The value is not a fixed 5 mV rule. Manual input is in mV and must be finite, non-negative, and smaller than a safe fraction of the common span.

Points inside the resolved trim distance of true reversal potentials receive no direct Dunn-fit confidence. Their final `g(V)` values are supplied by the same regularized solution and endpoint reconnection, not by current smoothing.

## 9. Standard Dunn Fitting

At every retained potential and separately for forward and reverse branches, fit true user scan rates using:

`i(V) / sqrt(v) = k1(V) sqrt(v) + k2(V)`

Record:

- `k1(V)`;
- `k2(V)`;
- `R²(V)`;
- point count;
- branch identity;
- fit status.

At least three distinct positive scan rates are required for a fit. Three scan rates remain accepted for compatibility but trigger a reliability warning; five or more are preferred. Failed and degenerate fits remain visible in diagnostics and exports.

## 10. Local Capacitive Fractions

For every target scan rate and branch:

`f_cap(V) = abs(k1(V) v) / (abs(k1(V) v) + abs(k2(V) sqrt(v)))`

- Clamp finite values into `[0, 1]`.
- Treat a zero/invalid denominator as unavailable, not as zero contribution.
- Calculate `f_forward(V)` and `f_reverse(V)` independently before combining them.

Because the formula contains the target scan rate, each reported scan rate receives its own optimized `g(V)` and contribution percentage.

## 11. R² Confidence Modes

Clamp finite R² values to a confidence domain of `[0, 1]`; failed fits have zero direct confidence.

### Threshold mode

- Default threshold is 0.95 and remains freely editable from 0 to 1.
- Fits at or above the threshold are strong trusted anchors.
- Fits below the threshold receive only weak confidence; they are not deleted and do not create holes.
- Neighboring trusted trends and the smoothness regularizer dominate low-confidence regions.
- When no adequate anchors exist, retain a bounded result only if the optimization remains numerically defined, and always display a low-fit-quality warning.

### Weighted mode

- Use a continuous monotonic mapping from R² to positive confidence.
- High R² has stronger influence.
- Low finite R² retains a small non-zero influence.
- No hard Dunn cutoff is applied.

### b-value compatibility

The existing b-value threshold classification/filtering remains unchanged in both Dunn modes. Selecting R² weighted changes Dunn reconstruction only. The editable threshold remains available for b-value quality filtering and for Dunn diagnostics even when weighted mode is selected.

## 12. Shared `g(V)` Optimization

For each target scan rate, solve one shared fraction over the common potential grid:

`min_g sum_i [w_f,i (g_i - f_f,i)^2 + w_r,i (g_i - f_r,i)^2] + lambda sum_i (Delta² g_i)^2`

subject to:

`0 <= g_i <= 1`.

Properties:

- The first term is branch-separated, R²-confidence-weighted data fidelity.
- The second term is an explicit second-difference smoothness regularizer.
- Better local fit quality can outweigh a noisy branch without removing the other direction.
- Missing/trimmed regions are bridged by the regularized shared solution.
- The same `g(V)` is used for both branch currents at a given target scan rate.

Use a deterministic projected-gradient or equivalent box-constrained convex solver with:

- scale-normalized inputs;
- a convergence tolerance;
- a maximum iteration guard;
- finite-objective checks;
- explicit failure reporting.

### Adaptive regularization

Resolve `lambda` automatically using only general data properties:

- grid size and normalized grid spacing;
- common voltage span;
- robust local variability/noise in the raw confidence-weighted fraction;
- trusted-confidence coverage;
- R² distribution.

The selector may evaluate a small deterministic set of scale-normalized regularization candidates and balance fidelity against second-difference roughness. It must not inspect scan-rate labels, dataset names, expected percentages, or hard-coded BP150/NCP traits. The resolved setting remains “Auto” in the normal UI and is traceable in diagnostics.

## 13. Reconstruction and Endpoint Reconnection

After optimization:

`i_cap,forward(V) = g(V) i_forward(V)`

`i_cap,reverse(V) = g(V) i_reverse(V)`

`i_diff(V) = i_CV(V) - i_cap(V)`.

Reconnection requirements:

- Restore true CV turning potentials after fitting.
- Blend `g(V)` through the trim region using the same regularized solution.
- Use one shared endpoint fraction at each turning potential.
- A singly recorded turning point reconnects as one shared sample.
- A doubly recorded turning potential retains its two measured current values, scaled by the same bounded fraction; do not invent an additional vertical closure.
- Preserve original loop order for boundary lines and final plotting.

## 14. Contribution Integration

Use magnitude trapezoidal integration on both logical branches over the same common grid to avoid positive/negative cancellation:

`A_cap = sum_branches integral abs(i_cap(V)) dV`

`A_total = sum_branches integral abs(i_CV(V)) dV`

`capacitivePercent = 100 * A_cap / A_total`

`diffusionPercent = 100 - capacitivePercent`.

Do not force monotonic contribution trends with scan rate. Reject only a non-finite or zero total area.

## 15. Quality Validation and Warnings

Before publishing a result, verify:

- all `g(V)` values are finite and in `[0, 1]` within numerical tolerance;
- `abs(i_cap) <= abs(i_original)`;
- reconstructed non-zero current keeps the original sign;
- `g(V)` has no solver-generated non-finite values or abnormal isolated jumps;
- capacitive boundaries stay inside their corresponding original branch magnitudes;
- endpoints reconnect according to the original reversal representation;
- Dunn fits are not entirely degenerate;
- the constrained solver converged;
- contribution areas are finite.

Show a caution warning rather than hiding output when either branch has fewer than 50% of its finite fits at or above the configured R² threshold. In weighted mode, the threshold is diagnostic only. Also warn when only three scan rates are available.

Block results and show a localized visible error only for structural or numerical failures such as no complete loop, incompatible branch directions, no common potential range, insufficient distinct scan rates, wholly degenerate fits, or optimization failure.

## 16. UI Design

### Data setup

- Remove “Point interval / 取点间隔”.
- Add “Potential interval / 电位间隔”:
  - Auto default;
  - Advanced manual mV value;
  - help: Auto matches the analysis grid to native potential resolution.

### Dunn controls

- Method radio/select:
  - R² threshold (default);
  - R² weighted.
- Editable threshold input, default 0.95.
- Turning-point trim:
  - Auto default;
  - Advanced manual mV value.
- Smoothing: Auto, with no detailed normal-mode parameters.
- Compact bilingual method description and benefits.

### Diagnostics

Display:

- selected Dunn mode;
- threshold value;
- resolved potential interval;
- resolved trim;
- common range;
- median forward R²;
- median reverse R²;
- percentage of forward fits above threshold;
- percentage of reverse fits above threshold;
- scan-rate count;
- quality-check outcome and any caution.

Raw `k1`, `k2`, R², branch identity, local fractions, confidence, and final `g(V)` remain available through result tables and/or CSV exports.

## 17. Plot Design

The Dunn figure contains:

- the original complete CV as the outer line;
- a continuous capacitive inner loop and filled internal region;
- diffusion-controlled regions between the original and capacitive boundaries;
- optional thin capacitive forward/reverse boundaries;
- existing axes, metadata, accessibility, and SVG/PNG export behavior.

Do not render fragmented valid-fit blocks, low-R² holes, hatched exclusion fragments, or arbitrary independent `k1 v` curves as final contribution boundaries.

## 18. Export Compatibility

Preserve the existing six CSV filenames and SVG/PNG exports.

Update metadata to replace point interval with:

- requested/resolved potential interval;
- Dunn mode;
- threshold;
- requested/resolved trim;
- smoothing mode;
- common range;
- diagnostics.

Specific behavior:

- b-value result export retains existing threshold filtering.
- raw Dunn `k1/k2/R²` export retains all finite fits and statuses; low-R² fits are not deleted merely because threshold mode is active.
- capacitive and diffusion current exports use the bounded reconstructed currents.
- contribution summary includes quality warning state and diagnostic coverage.

## 19. Modular Architecture

Keep reusable numerical logic out of page and plotting components. Planned module responsibilities:

- `cvCycle`: complete-loop selection, direction runs, seam normalization, endpoint ownership;
- `cvInterpolation`: native resolution, common range, grid creation, PCHIP;
- `cvDunnFit`: branch-separated Dunn fits and R²;
- `cvDunnConfidence`: local fractions and threshold/weighted confidence;
- `cvDunnReconstruction`: adaptive regularization, constrained `g(V)`, endpoint reconnection;
- `cvDunnQuality`: integration, diagnostics, bounds/sign/continuity validation;
- `cvWorkflow`: orchestration and compatibility mapping;
- page/components: controls, localized descriptions, warnings, tables, plotting, exports only.

Existing modules may be split or adapted incrementally; unrelated working import/export infrastructure must not be rewritten.

## 20. Test Strategy

### Unit tests

- One-turn complete loop.
- Two-turn seam-started complete loop.
- Extra incomplete next-cycle data ignored.
- Mixed one/two-turn scans normalize to compatible directions.
- Single and double-recorded turning endpoints.
- Different point counts, native intervals, endpoints, and a few missing/extra points.
- PCHIP exact-node behavior, shape preservation, branch separation, and no extrapolation.
- Auto/manual potential interval.
- Auto/manual turning-point trim.
- Known-coefficient Dunn fits at arbitrary scan rates.
- Threshold confidence versus weighted confidence.
- Low-R² fits retained for Dunn but existing b-value filtering preserved.
- Explicit second-difference regularization reduces isolated fraction spikes.
- Constrained solver convergence and deterministic output.
- `0 <= g <= 1`, magnitude containment, sign preservation, endpoint quality.
- Magnitude trapezoidal contribution integration.
- Degenerate-fit and solver-failure error paths.

### Real regression data

- NCP CSV import to analysis.
- NCP XLSX import to analysis.
- BP150 combined XYXYXY import to analysis.
- Threshold 0.95 and weighted modes both produce continuous usable outputs.
- BP150 produces the expected fit-quality caution without dataset-specific tuning.

### Synthetic regression data

Use a deterministic fixture with:

- a different voltage window;
- different arbitrary scan rates;
- different point counts and potential intervals;
- mildly mismatched endpoints;
- missing/extra points;
- mild seeded noise;
- known bounded fraction behavior.

### Page and regression tests

- English and Simplified Chinese controls, help, warnings, errors, diagnostics, and export labels.
- Mode switching retains threshold input.
- Weighted mode does not alter b-value threshold filtering.
- Continuous chart areas with no fragmented low-R² holes.
- Existing CSV/TXT/XLSX import flows remain working.
- Existing unrelated site tests remain passing.
- TypeScript check and production build pass.

## 21. Rollout

1. Implement on the existing feature branch/worktree.
2. Commit in small TDD-backed stages.
3. Run focused tests after every numerical stage.
4. Run full tests, type check, build, and browser-level core-flow verification.
5. Inspect the NCP and BP150 figures and diagnostics qualitatively for continuity, containment, sign preservation, and warnings.
6. Do not deploy until all acceptance checks pass.
7. After verification, integrate and deploy through the existing project release path; do not create multi-language routes or unrelated changes.

## 22. Acceptance Criteria

The implementation is accepted only when:

- both R² threshold and R² weighted modes are present;
- b-value threshold behavior remains unchanged;
- PCHIP is used for branch interpolation;
- `g(V)` is smoothed separately using an explicit regularization term;
- one shared bounded `g(V)` reconstructs both directions;
- all capacitive currents satisfy the magnitude and sign constraints;
- low-R² Dunn regions remain continuous rather than becoming holes;
- true turning points are restored and the complete loop is retained;
- NCP, BP150, and synthetic regression datasets run without dataset-specific tuning;
- quality warnings and diagnostics are visible and bilingual;
- existing import/export/site behavior remains intact;
- all tests, type checks, builds, and deployment checks pass.
