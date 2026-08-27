# Peak b-Value Analysis and True CV-Envelope Containment Design

**Date:** 2026-08-27  
**Branch:** `fix-dunn-literature-plot`  
**Status:** Approved conversational design; pending written-spec review  
**Source of truth:** The user's “combined improvements” instruction plus the confirmed choices in this thread.

## 1. Objective and Scope

Extend the existing CV Kinetics Analysis tool in two focused ways:

1. add a conventional, literature-style peak-current b-value mode while retaining the existing potential-resolved b-value mode;
2. replace branch-only Dunn containment with a true local forward/reverse CV-envelope constraint used consistently by reconstruction, plotting, integration, diagnostics, and export.

The change preserves CSV/TXT/XLSX import, complete-cycle normalization, potential-interval controls, turning-point trim, b-value R² filtering, Dunn threshold and weighted confidence modes, shared regularized `g(V)`, PCHIP interpolation, bilingual UI, existing scientific formulas, and responsive behavior.

No new charting or numerical dependency is introduced. The homepage and unrelated Tools pages are out of scope. The branch is not merged or deployed automatically.

## 2. Confirmed Product Decisions

- The b-value section has two modes:
  - **Peak b-value**, selected by default;
  - **Potential-resolved b-value**, retaining the current workflow.
- Automatic peak detection returns the significant peaks actually present, from one to ten. It never pads the result to a fixed count.
- NCP is expected to resolve three principal peaks: two oxidation peaks on the increasing-potential branch and one reduction peak on the decreasing-potential branch.
- A matched peak is retained when at least three scan rates contain usable peak points. Missing rates remain explicit and the fit is marked as partial coverage.
- Manual editing uses the confirmed interaction: choose a peak and scan rate, then click near the desired point on the CV plot. The selection snaps to the nearest original point on the same sweep branch. The table also permits exact adjustment.
- Dunn uses the confirmed minimum-correction approach: shared `g(V)` remains the optimization target, and only an envelope-violating reconstructed branch value is projected to its nearest physically feasible value.

## 3. Existing Architecture and Root Causes

### 3.1 Existing b-value pipeline

`cvAnalysis.ts` performs branch-separated potential-resolved regressions on the common retained potential grid. `cvWorkflow.ts` applies the current R² threshold without replacing independent stability statuses. `BValueOverviewChart.tsx` and the single-potential card expose those records in the page.

There is no peak-current model, peak matching, manual peak override state, or multi-peak regression chart. Adding this behavior directly to `CvKineticsPage.tsx` would further couple scientific analysis, interaction state, rendering, and export, so peak analysis and manual overrides require focused modules and components.

### 3.2 Existing Dunn containment

The current final guard constrains each reconstructed current to the signed interval between zero and its own measured branch current. This proves sign and magnitude containment, but it does not prove geometric containment inside the local forward/reverse CV envelope.

For example, when both branch currents are positive, scaling the smaller positive branch toward zero can move it below `min(i_forward, i_reverse)` while still satisfying `abs(i_cap) <= abs(i_raw)`. The analogous failure occurs when both currents are negative.

Maintaining exact shared scaling and imposing the envelope on both branches would often force `g(V) = 1` throughout same-sign regions. That would inflate capacitive contribution and materially distort the fitted Dunn result. The minimum-correction projection below resolves only the incompatible points while retaining shared `g(V)` everywhere it is feasible.

## 4. Peak b-Value Domain Model

Create explicit peak-analysis types, kept separate from potential-resolved `BValuePoint`:

- `CvPeakKind`: `oxidation | reduction`;
- `CvPeakPointStatus`: `auto | confirmed | adjusted | missing | excluded | nearZeroCurrentUnstable`;
- `CvPeakPoint`: stable peak id, scan rate, sweep branch, kind, original source index, potential, current, detection confidence, and status;
- `CvPeakCoverageStatus`: `complete | partial`;
- `CvPeakFitStatus`: `valid | belowRSquaredThreshold | insufficientData | nearZeroCurrentUnstable | regressionFailed`;
- `CvPeakFit`: peak id/label, branch, kind, per-rate peak points, b, intercept, R², point count, coverage count/status, and fit status;
- `CvPeakOverride`: peak id, scan rate, branch, replacement source index or explicit excluded state.

Peak labels are deterministic (`Peak 1` through `Peak 10`) and stable during manual edits. Labels are assigned after matching, ordered by increasing branch first, then decreasing branch, and by representative peak potential within each branch.

## 5. Automatic Peak Detection

### 5.1 Candidate localization

Peak detection operates independently on every normalized sweep branch and scan rate.

1. Resample each branch to a uniform potential grid using the existing PCHIP implementation. Use `ceil(branchSpan / robustNativeInterval) + 1` grid points, including both branch endpoints.
2. Apply a centered local-quadratic least-squares smoothing window only to the resampled current used for candidate localization. Calculate the desired point count as `round(0.015 * branchSpan / gridInterval)`, raise it to at least seven, convert it to the next odd number, and cap it at `max(7, largest odd point count not exceeding 5% of the branch span)`. A branch with fewer than seven usable samples is insufficient for automatic detection.
3. On the increasing-potential branch, locate local current maxima as oxidation candidates.
4. On the decreasing-potential branch, locate local current minima as reduction candidates.
5. Calculate local prominence over a search radius equal to 10% of the branch span. For a maximum, subtract the higher of the minimum smoothed currents found on its two sides; for a minimum, subtract the candidate from the lower of the two side maxima. Retain a candidate when its prominence is at least the greater of:
   - five times the median absolute deviation of the raw-minus-smoothed residual;
   - 2% of the robust branch current span.
6. Enforce a minimum separation of 3% of the branch potential span. When two candidates violate the separation, retain the one with greater normalized prominence.
7. Map every retained candidate back to the true local extremum in the unsmoothed original branch samples. All displayed, fitted, and exported peak potentials/currents come from that original point.

Smoothing never replaces or alters experimental values and is not reused by Dunn analysis.

### 5.2 Cross-scan-rate matching

Match oxidation and reduction candidates separately; never match across branches or peak kinds.

- Sort scan rates from low to high.
- Use the median scan rate as the initial reference because it is less sensitive to either low-current noise or the largest high-rate peak shift.
- Match neighboring rates with a monotone dynamic assignment. Reject a pair whose displacement exceeds 25% of the branch potential span. For remaining pairs, use cost `0.65 * normalized potential displacement + 0.20 * normalized log-prominence difference + 0.15 * displacement-trend deviation`; the trend term is zero until two prior matched rates establish a displacement trend. Use a gap penalty of `0.35`. Matches may contain gaps and may not cross one another in potential order.
- Extend assignments in both directions from the reference rate.
- Retain groups supported by at least three scan rates.
- If more than ten groups survive, rank them by support count, median normalized prominence, and detection confidence, then retain the best ten while preserving deterministic display order.

Peak potentials are allowed to move with scan rate; exact-potential equality is never a matching requirement.

### 5.3 Peak-current regression and stability

For each retained peak group, fit only its non-missing, non-excluded, numerically stable original points:

`log(|i_peak|) = log(a) + b log(v)`

- A minimum of three distinct scan rates is required.
- Apply a peak-current near-zero threshold independent of R². The scale is the largest absolute current on that peak's sweep branch across the imported scan rates; a point at or below `1e-6` times this scale is unstable.
- Exact-zero and near-zero points remain visible for traceability but do not enter the logarithmic fit.
- Apply the existing b-value R² threshold after the independent stability classification.
- Never clip b to `0.5–1.0`. Values outside that interval remain visible, selectable, exportable, and receive the conventional-interpretation warning.
- A fit with at least three usable points but fewer points than imported scan rates receives `coverageStatus = partial` independently of its R²-derived fit status.

## 6. Manual Peak Confirmation and Adjustment

Manual state is represented as overrides on top of immutable automatic detection output.

- The user selects a peak label and scan rate.
- Clicking the multi-rate CV chart searches only the selected scan rate and selected peak's branch, then snaps to the nearest original sample by potential.
- Editing the potential cell performs the same branch-limited snap on commit; full source-index precision is retained internally.
- Confirm marks an automatic point as reviewed without changing its value.
- Exclude removes that rate's point from the fit while keeping an auditable excluded row.
- Restore automatic removes the override for that peak/rate.
- Add peak creates a manual group anchored to a clicked original point and searches same-kind candidates at the other scan rates using the same monotone matching rules. The group remains insufficient until at least three usable rates are assigned.
- A peak can be removed from the active analysis without changing imported data.
- No more than ten active peak groups are allowed.

Changing imported data, data layout, header mode, scan-rate mapping, potential interval, or cycle normalization invalidates all peak overrides. Changing only the R² threshold recomputes fit status without discarding peak selections.

## 7. b-Value User Interface

### 7.1 Analysis-mode control

Place a compact `Analysis mode` selector immediately below the b-value section heading. `Peak b-value` is the default after each new analysis. Switching modes does not rerun import or Dunn reconstruction.

### 7.2 Peak mode layout

Use a vertical full-width layout on desktop and mobile:

1. **Multi-scan-rate CV card**
   - complete original CV loops overlaid by scan rate;
   - detected/selected peak markers;
   - stable Peak 1–Peak 10 labels;
   - oxidation/reduction distinction using marker shape plus color;
   - active peak/rate highlight and click-to-snap interaction.
2. **Peak regression card**
   - one independent measured-point and fit-line series per peak;
   - `log(scan rate)` and `log(|peak current|)` axes;
   - legend or annotation containing peak label, branch/kind, and b value;
   - missing/excluded rate points are not joined.
3. **Peak summary table**
   - peak label, branch, kind, b, intercept, R², fit points, coverage, fit status, and interpretation status.
4. **Peak-point adjustment table**
   - peak label, scan rate, potential, current, original source index, point status, and compact confirm/exclude/restore controls.

### 7.3 Potential-resolved mode layout

Retain the current formula and common-grid selection behavior. Change only the layout from a two-card desktop grid to a full-width vertical stack:

1. b value versus potential overview;
2. branch-specific single-potential regression;
3. complete b-value results table.

Forward and reverse series remain separate; invalid gaps are never connected; rejected points remain subtle; the selected point and branch remain explicit.

## 8. True Dunn CV-Envelope Constraint

### 8.1 Shared target

Preserve the optimized shared fraction and existing core target:

`i_cap,target,b(V) = g(V) * i_raw,b(V)`

with `0 <= g(V) <= 1` for both branches. R² confidence, threshold/weighted modes, low-anchor stabilization, automatic lambda, smoothness regularization, PCHIP, and turning-point trim are unchanged.

### 8.2 Canonical ordered records

For every scan rate, construct one canonical record stream in the original normalized scan order. Each record contains:

- sequence and original source identity;
- potential and branch;
- measured current on the current branch;
- opposite-branch current evaluated at the same potential with PCHIP;
- envelope lower/upper bounds;
- optimized shared `g(V)`;
- shared target capacitive current;
- final constrained capacitive current;
- diffusion current;
- effective fraction (`i_cap / i_raw` where defined);
- correction magnitude and synthetic/turning-point flags.

The opposite branch is evaluated on its full normalized branch range. A potential no farther than one native interval beyond an opposing endpoint is clamped to that endpoint to accommodate recorded turning-point mismatch; a larger non-overlap invalidates the cycle instead of extrapolating. Shared `g(V)` continues to use the retained cross-rate common grid and its existing endpoint behavior. Turning points retain the existing single-record/shared or double-record/separate ownership rules. Zero-crossing records are inserted synchronously for every current field when required for piecewise-linear rendering.

### 8.3 Minimum feasible projection

At every ordered record, define:

`i_lower = min(i_raw,currentBranch, i_raw,oppositeBranch)`

`i_upper = max(i_raw,currentBranch, i_raw,oppositeBranch)`

The current branch's signed magnitude interval is:

`[min(0, i_raw,currentBranch), max(0, i_raw,currentBranch)]`

The feasible interval is the intersection of the CV envelope and signed magnitude interval. Because the measured current itself belongs to both intervals, the intersection is non-empty.

Project `i_cap,target` to the nearest value in that feasible interval. This pointwise projection is deterministic and minimal in absolute-current distance. It does not independently fit or smooth a capacitive branch. Since the target and bounds are continuous PCHIP-derived functions, projection preserves continuity while allowing a derivative change where a physical constraint becomes active.

Set:

`i_diff = i_raw - i_cap,constrained`

The optimized shared `g(V)` is retained in output. Where projection changes the target, `effectiveFraction` records the minimum necessary departure; the UI and CSV must not falsely claim that the corrected current still equals the unmodified target.

## 9. Dunn Integration, Rendering, and Export Consistency

The canonical constrained ordered records are the only source for:

- original and capacitive branch lines;
- capacitive-loop polygon;
- per-branch diffusion strips;
- contribution-area integration;
- reconstructed-current CSV;
- SVG/PNG figure export;
- envelope diagnostics.

Integration sums absolute trapezoidal area over each contiguous monotonic branch run, avoiding artificial integration across cyclic seams. Capacitive and total areas therefore use the same potentials and current records shown in the figure. No display-only smoothing or independently sampled boundary is allowed.

One deterministic, branch-aware sampling-index set may be used for display performance. It is applied to every displayed current field and retains endpoints, turning duplicates, zero crossings, active constraint transitions, branch boundaries, and important extrema. Scientific integration and CSV retain the complete canonical record set.

## 10. Dunn Diagnostics and Validation

For every scan rate, report:

- maximum shared-target correction magnitude;
- maximum residual signed and absolute envelope violation;
- corrected-point count and percentage;
- maximum effective-fraction departure from shared `g(V)`;
- maximum adjacent change in optimized `g(V)`;
- sign/magnitude containment status;
- turning-point reconnection status.

Validation checks every complete canonical record:

1. finite currents and potentials;
2. `0 <= g(V) <= 1`;
3. capacitive and diffusion sign preservation;
4. branch-wise magnitude containment;
5. `i_lower <= i_cap <= i_upper` within a scale-aware tolerance;
6. exact reconstruction identity `i_cap + i_diff = i_raw` within tolerance;
7. monotonic potential order inside each branch run;
8. valid original source ordering and turning-point ownership;
9. finite smoothness diagnostics.

Residual envelope violation above `1e-10 * max(1, maximum current magnitude)` throws the existing visible `reconstructionFailed` error. A large adjacent `g(V)` change does not silently invalidate otherwise bounded data; it sets a smoothness warning when it exceeds both `0.2` and eight times the median absolute adjacent change. The warning and value are exported for review.

## 11. Bilingual Text and Accessibility

All new visible strings use centralized English and Simplified Chinese locale keys. This includes analysis modes, peak kinds, peak statuses, manual controls, missing-rate/partial-fit messages, envelope correction diagnostics, and validation errors.

Scientific formulas, `b`, `R²`, `g(V)`, peak labels, element symbols, numerical values, and units remain unchanged. Charts use marker shape plus color, expose localized accessible labels, and support keyboard selection wherever mouse selection is available.

## 12. Error Handling

- No significant automatic peaks: keep potential-resolved and Dunn results available; show a visible peak-mode empty state.
- Fewer than three usable rates for one peak: retain its rows, mark insufficient, and omit its fit line.
- Partial coverage with at least three usable rates: fit available points and disclose coverage.
- Near-zero current: keep the point for traceability, exclude it from log fitting, and show the independent stability status.
- Invalid manual click/input: do not change state; explain that selection must lie on the chosen branch and imported original grid.
- More than ten requested active peaks: reject the addition with a localized limit message.
- Residual Dunn envelope violation: reject that reconstruction and display the existing analysis error region with a containment-specific explanation.

## 13. File and Component Boundaries

Planned focused additions:

- `src/lib/cvPeakAnalysis.ts`: detection, matching, fitting, statuses, and validation;
- `src/lib/cvPeakOverrides.ts`: immutable override application and branch-limited snapping;
- `src/components/CvPeakOverviewChart.tsx`: multi-rate CV/peak interaction;
- `src/components/CvPeakRegressionChart.tsx`: multi-peak regression visualization;
- `src/components/CvPeakAnalysisPanel.tsx`: mode-specific peak controls and tables.

Focused modifications:

- `cvTypes.ts`: peak and envelope diagnostic types;
- `cvDunnQuality.ts`: envelope evaluation, minimum projection, canonical integration, and validation;
- `cvWorkflow.ts`: automatic peak results without changing potential-resolved or Dunn filtering;
- `CvKineticsPage.tsx`: analysis-mode state and composition only;
- locale resources and scoped responsive styles;
- existing export helpers/page export mapping as required.

No unrelated page or shared navigation refactor is included.

## 14. Test Strategy

Implementation follows red-green-refactor cycles.

### Peak analysis unit tests

- one, three, and more-than-four significant peaks, capped at ten;
- moving peaks across scan rates without exact potential equality;
- monotone matching with missing middle/end rates;
- rejection below three usable scan rates;
- correct increasing-branch oxidation and decreasing-branch reduction grouping;
- original unsmoothed point values used in fits and export;
- branch-independent regressions;
- near-zero instability independent of R²;
- b values outside `0.5–1.0` retained and flagged;
- NCP fixture resolves three principal groups.

### Manual override tests

- chart/table adjustment snaps to the selected scan rate and branch only;
- confirm, exclude, restore, add, and remove operations are immutable and deterministic;
- adjustment changes the correct peak regression only;
- import/analysis identity change invalidates overrides;
- the ten-peak limit is enforced.

### Dunn tests

- opposite-sign branches require no unnecessary envelope correction;
- positive/positive and negative/negative branches receive the minimum feasible projection;
- residual envelope violation is zero within tolerance;
- sign, magnitude, reconstruction identity, and `g(V)` bounds remain valid;
- integration uses canonical ordered records;
- plot polygons, branch boundaries, CSV, and integration share the constrained values;
- turning duplicates and zero crossings reconnect smoothly;
- NCP and BP150 pass every rate, with explicit highest-rate assertions;
- diagnostics report correction magnitude, coverage, effective-fraction departure, residual violation, and `g(V)` jump status.

### UI and regression tests

- Peak b-value is the default mode;
- switching modes preserves imported analysis and does not mix result types;
- both peak charts and both potential-resolved charts are vertically stacked and full width on desktop/mobile;
- English and Chinese text, accessible branch/peak labels, and CSV headers are complete;
- CSV, UTF-16 TXT, and XLSX import-to-analysis flows remain intact;
- full existing test suite, TypeScript check, data validation, route generation, and production build pass.

## 15. Acceptance Criteria

The change is complete when:

1. the peak mode automatically returns one to ten significant matched peaks and NCP resolves three principal peaks;
2. each peak fit uses original unsmoothed points from one sweep branch only;
3. partial-rate peaks with at least three usable rates remain fit and clearly disclosed;
4. manual click/table adjustment is branch-limited, source-index-backed, and reversible;
5. potential-resolved analysis remains scientifically and behaviorally unchanged apart from the confirmed vertical full-width layout;
6. every final Dunn record lies within both its signed branch bounds and local forward/reverse envelope;
7. plotting, fill, integration, CSV, and figure export consume the same canonical constrained records;
8. maximum residual envelope violation is within tolerance for every NCP and BP150 scan rate;
9. bilingual, responsive, import, threshold/weighted, Auto/custom, and complete-cycle behavior remains intact;
10. all targeted and full verification commands pass, with no automatic merge or deployment.
