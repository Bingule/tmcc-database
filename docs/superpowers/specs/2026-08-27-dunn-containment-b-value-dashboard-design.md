# Dunn Physical Containment and b-Value Dashboard Design

**Date:** 2026-08-27  
**Branch:** `fix-dunn-literature-plot`  
**Status:** Approved design  
**Source of truth:** The user's branch-wise Dunn-containment requirements, Scheme A confirmation, and the subsequent b-value visualization and interaction requirements.

## 1. Objective

Complete a focused scientific-quality pass over the existing CV kinetics page:

1. guarantee that every reconstructed capacitive branch is numerically and visually contained by its corresponding measured CV branch;
2. remove rendering-only Dunn overshoot caused by mismatched grids or independent sampling;
3. redesign b-value analysis as a branch-aware scientific diagnostic dashboard;
4. add a scale-aware near-zero-current stability criterion and a representative default selection;
5. preserve the existing regression formula, shared-`g(V)` Dunn formulation, bilingual UI, responsive layout, imports, and unrelated site behavior.

No new chart dependency will be introduced.

## 2. Confirmed Scientific Invariants

The Dunn reconstruction core remains:

`i_cap,f(V) = g(V) * i_f(V)`

`i_cap,r(V) = g(V) * i_r(V)`

`0 <= g(V) <= 1`

The b-value regression remains:

`log(|i|) = log(a) + b log(v)`

The change does not independently smooth either capacitive-current branch, change the existing b-value R² threshold semantics, average forward and reverse currents, or discard the return sweep.

## 3. Root Causes in the Existing Implementation

### 3.1 Dunn visual overshoot

The numerical aligned-grid reconstruction already checks the shared fraction and reconstructed currents. The visible chart is assembled through different paths, however:

- the measured curve uses original native samples;
- capacitive boundary lines use a separately reconstructed native `plotPath`;
- shaded regions use the aligned common-potential grid;
- line series and area series are downsampled independently;
- reverse-branch rendering injects a preceding point owned by another branch at a seam.

Although corresponding numerical vertices can be valid, separately chosen SVG line segments and polygons can cross between vertices, especially near high-rate peaks, current zero crossings, and turning-point reconnections.

### 3.2 b-value presentation and selection

The current overview is one sequential series. It therefore joins sweep branches conceptually, hides all below-threshold fits as gaps, and does not distinguish conventional-range, out-of-range, excluded, and unavailable points.

The current stability check rejects only exact zero current. Very small non-zero currents still enter `log(|i|)`. The default selection is simply the first R²-valid fit, and manual selection relies on exact floating-point equality rather than the retained branch grid.

## 4. Dunn Scheme A: Unified Ordered Records

### 4.1 Canonical render/export record

For each target scan rate, construct one ordered full-cycle record stream. Every record carries at least:

- source/sequence identity;
- potential;
- sweep branch;
- measured branch current;
- bounded capacitive current;
- diffusion-controlled current;
- evaluated shared fraction `g(V)`.

The record order follows the original complete CV scan order. Singly recorded turning points remain shared logically; duplicated turning potentials with distinct currents remain separate and retain their incoming/outgoing branch ownership.

The existing aligned branch grid remains the scientific fitting and integration grid. The ordered records are the canonical source for the displayed full loop, display sampling, figure export, and ordered reconstructed-current export.

### 4.2 Final branch-wise containment clamp

After evaluating `g(V)` on an ordered record and forming `g(V) * i_raw(V)`, apply a final numerical safeguard:

- if `i_raw >= 0`, clamp `i_cap` to `[0, i_raw]`;
- if `i_raw <= 0`, clamp `i_cap` to `[i_raw, 0]`;
- set `i_diff = i_raw - i_cap` after the clamp.

This is a final physical guard, not a new fit and not an independent smoothing operation.

### 4.3 Overshoot diagnostics and validation

For both aligned branch arrays and ordered records, calculate:

- maximum positive signed overshoot;
- maximum negative signed overshoot;
- maximum absolute overshoot;
- the branch and ordered index at the worst point.

Use a scale-aware tolerance based on the existing reconstruction tolerance and current magnitude. Validate the final values after the safeguard. Any residual overshoot above tolerance throws the stable `reconstructionFailed` analysis error, which the page must display visibly rather than silently continuing.

The diagnostic maxima are retained in the Dunn diagnostics/export metadata so regression tests can assert the invariant.

### 4.4 Synchronized chart geometry

The measured curve, capacitive boundaries, capacitive polygon, diffusion strips, and SVG/PNG figure export are all derived from the same ordered record stream.

One branch-aware sampling-index set is calculated once per selected scan rate. The same indices are then applied to every current field and every related polygon. Sampling must always retain:

- first and last record;
- branch boundaries;
- turning-point duplicates;
- measured-current zero crossings;
- local extrema already selected by the current scientific sampler.

Where a measured-current segment crosses zero, insert a shared interpolated zero record before geometry generation so the measured and capacitive piecewise-linear segments meet at the same zero. No display-only smoothing is permitted.

The reverse capacitive boundary begins from its own correctly paired turning record; it must not borrow a capacitive value owned by the preceding branch.

### 4.5 Area rendering

Build the inner capacitive polygon from the ordered capacitive loop. Build diffusion regions as paired measured/capacitive strips on each branch using the same ordered records. This removes the current mismatch between an aligned-grid fill and native-grid boundary lines.

The branch-wise invariant is authoritative. The implementation will not introduce an independent envelope reconstruction that would violate `i_cap = g * i_raw`.

## 5. b-Value Numerical Status Model

### 5.1 Branch-separated fits

Continue fitting on the common resampled grid. Every record retains its sequence index, branch index, potential, fit values, and status. Forward and reverse records at the same potential remain separate selectable identities.

### 5.2 Near-zero-current stability

Add `nearZeroCurrentUnstable` as a status independent of R² classification.

For each sweep branch, calculate a unit-invariant current scale:

`branchScale = max(abs(current))`

across all scan rates and retained common-grid positions in that branch. A fit position is near-zero unstable when any otherwise usable current magnitude satisfies:

`abs(current) <= 1e-6 * branchScale`

Exact zeros continue to be reported as logarithmically unavailable. A finite regression may be retained for traceability at a near-zero location, but its stability status must not be overwritten by R² classification. Near-zero records are excluded from the default selection and from continuous valid-fit lines.

The R² threshold continues to classify only otherwise stable fits as `valid` or `belowRSquaredThreshold`. Weighted Dunn mode does not alter this b-value behavior.

### 5.3 Conventional interpretation category

Conventional interpretation is a visual/interpretive category, not a fit filter:

- `b` near/within `0.5–1.0`: conventional diffusion-to-surface interpretation;
- `b < 0.5` or `b > 1.0`: outside conventional interpretation.

An out-of-range fit remains available, selectable, tabulated, and exportable. The single-potential card shows a subtle explanatory note instead of suppressing it.

## 6. b-Value Overview Card

Create a dedicated branch-aware overview component rather than forcing all requested semantics into the generic line-chart component.

### 6.1 Curves and references

- render forward and reverse sweep branches as separate series;
- never connect across branches;
- break continuous paths at every excluded or unstable gap;
- draw labeled horizontal references at `b = 0.5` and `b = 1.0`;
- include a compact interpretation note for diffusion-controlled, mixed, surface/capacitive-controlled, and outside-conventional-range results.

### 6.2 Quality encoding

Use both color and marker shape/fill so meaning does not depend on color alone:

- conventional-range valid fit: solid branch-colored marker and line;
- out-of-range valid fit: contrasting solid marker;
- below-R²-threshold fit: hollow/faded marker;
- near-zero or otherwise unavailable/unstable position: faded cross or unavailable marker when a finite location can be shown.

Only stable R²-valid points contribute to a continuous line. No line is drawn through an excluded or unavailable gap.

### 6.3 Selected point

The selected identity includes branch and sequence index. The chart displays:

- a vertical selected-potential line;
- an emphasized point on the selected branch;
- a clear selected-branch label.

Clicking a selectable finite regression marker updates the single-potential panel. Below-threshold and out-of-range finite fits remain inspectable; unavailable records do not fabricate a b value.

## 7. Selected-Potential Logic

### 7.1 Default selection

Select only from stable, R²-valid common-grid records. Prefer records outside the endpoint/turning-point margin, then rank candidates deterministically using:

- R² quality;
- minimum current magnitude relative to branch scale;
- normalized distance from branch endpoints;
- closeness to the interior of the common potential window.

If the preferred interior set is empty, fall back to any stable R²-valid record. If no such record exists, retain the analysis and show the existing no-valid-selection state rather than failing the complete Dunn workflow.

### 7.2 Navigation and formatting

- Previous/Next navigate selectable fitted records without crossing to an arbitrary raw value.
- Branch identity remains explicit when equal potentials occur on both sweeps.
- Typed potential input snaps on commit to the nearest selectable common-grid point on the active branch, provided it lies within that branch’s shared range.
- Display the selected potential to four decimal places by default, trimming unnecessary trailing zeros.
- Preserve full numeric precision in state, regression, tables, and CSV export.

## 8. Single-Potential Regression Card

Retain the existing `log(|i|)` versus `log(v)` points and fitted line. Present a compact metrics row/table containing:

- selected potential;
- sweep branch;
- b value;
- intercept;
- R²;
- fit point count;
- fit/stability status.

If `b` lies outside `0.5–1.0`, show: “Outside conventional b-value interpretation range.” and its Simplified Chinese translation.

The regression panel and result row remain available for finite below-threshold or out-of-range fits selected from the overview.

## 9. Layout and Responsive Behavior

The b-value section is organized into:

1. overview card;
2. single-potential regression card;
3. results table.

On wide screens, the two chart cards may use a balanced two-column grid when content width allows it. On smaller screens they stack vertically. Controls and metric rows wrap without horizontal page overflow. Existing table scrolling/copy-column behavior remains intact.

The CV page introduction directly below `CV Kinetics Analysis` must use the full available content width rather than inheriting the generic narrow `76ch` tool-header limit. This applies to the advanced-analysis subtitle, method description, Benefits line, and sampling/export notice. The override is scoped to the CV page so other tool-page headers are not redesigned. Text still wraps naturally with readable line height on mobile.

The page title, homepage, Tools landing page, other calculators, navigation, language persistence, and unrelated styling remain unchanged.

## 10. Bilingual Resources

All new visible strings use stable keys in the existing English and Simplified Chinese locale resources. This includes:

- branch names;
- quality legend labels;
- b-value interpretation labels and note;
- near-zero instability status/help;
- selected-branch and snapped-potential feedback;
- Dunn containment failure text and diagnostic export labels.

Scientific identifiers, formulas, `b`, `R²`, `g(V)`, numerical values, and units remain unchanged.

## 11. Testing and Verification

Implementation is test-driven. Add failing tests before production changes for:

### Dunn

- positive and negative branch-wise clipping;
- scale-aware signed/absolute overshoot diagnostics;
- validation failure for residual overshoot above tolerance;
- shared ordered records for measured, capacitive, diffusion, fill, and export;
- zero-crossing insertion;
- correct turning-point branch ownership;
- shared sampling indices and no independent chart geometry;
- NCP and BP150 high-rate containment at every aligned and ordered point;
- rendered SVG paths/polygons use synchronized record counts and cannot cross the corresponding piecewise-linear branch boundary above tolerance.

### b value

- forward/reverse separation at equal potentials;
- no line across invalid gaps or between branches;
- `b = 0.5` and `b = 1.0` references;
- conventional-range, out-of-range, below-threshold, near-zero, and unavailable marker categories;
- near-zero status remains separate from R² status;
- default selection avoids near-zero and endpoint regions;
- typed values snap to the retained grid and keep full precision internally;
- selected branch/point, metrics, interpretation note, and bilingual copy;
- desktop two-card layout and responsive stacking.

Run the complete existing test suite, production build, and data validation after targeted tests. Perform a browser-level visual check in English and Chinese and verify SVG/PNG export geometry. Regression verification uses both NCP and BP150 fixtures, with special assertions at their highest scan rates and reconnection regions.

## 12. Acceptance Criteria

The change is complete when:

1. all final capacitive values satisfy their corresponding signed branch bounds within tolerance;
2. diagnostic maximum residual overshoot is within tolerance for NCP and BP150 at every rate;
3. measured curves, capacitive curves, shaded geometry, and visual exports share ordered records and sampling indices;
4. b-value branches are visually and structurally separate;
5. quality categories and the two reference lines are visible and accessible;
6. selection comes only from the common branch grid and defaults to a stable representative fit;
7. out-of-range b values remain transparent and inspectable;
8. the CV introduction spans the page content width on desktop without changing unrelated tool headers, and remains readable on mobile;
9. English/Chinese text, desktop/mobile layout, imports, existing formulas, tests, and build remain intact;
10. no merge is performed automatically.
