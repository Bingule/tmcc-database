# Complete CV Cycle Analysis Design

## Goal

Treat every imported scan-rate dataset as one sequential CV cycle. Preserve the original potential/current order, analyze forward and return sweeps without averaging coincident potentials, and display/export the complete processed loop.

The implementation supports monotonic data and complete cycles containing one or two potential-direction turning points. It applies equally to CSV, TXT, XLSX, shared-potential (`XYYYYY`), and paired-potential/current (`XYXYXY`) input.

## Current Problem

`confirmCvSeries` currently calls `selectFirstMonotonicSweep`, discards every point after the first direction reversal, and sorts the retained points by ascending potential. This makes the existing interpolation model convenient, but removes the return sweep and loses the original scan order.

The analysis grid also currently requires globally increasing unique potentials. That representation cannot distinguish the forward and return currents at the same potential and therefore cannot represent a complete loop.

## Chosen Approach

Use a branch-aware full-cycle pipeline:

1. Preserve each confirmed `CvSeries.points` array in file order.
2. Detect monotonic branches only when preparing interpolation and fitting inputs.
3. Interpolate and fit corresponding branches independently across scan rates.
4. Recombine branch results in original traversal order.

Forward and return currents at the same potential are separate observations. They are never averaged, deduplicated by potential value, or passed into the same regression point.

## Cycle and Turning-Point Rules

- Zero direction changes: accept as one monotonic branch for backward compatibility.
- One direction change: accept as two branches.
- Two direction changes: accept as three branches.
- More than two genuine direction changes: reject with a localized cycle-structure error.
- Every scan-rate series must have the same branch count and the same ordered direction pattern.
- Each branch must contain enough distinct potential points for interpolation. Existing fit-level insufficient-data statuses remain responsible for regression sufficiency.

Direction is determined from consecutive finite potential differences without smoothing the input.

### Turning potential recorded once

For a sequence such as `0 → 1 → 2 → 1 → 0`, the source point at `2` is shared internally as the endpoint of the first branch and the start of the second branch. Recombination emits that source location once.

### Turning potential recorded twice

For a sequence such as `0 → 1 → 2a → 2b → 1 → 0`, where `2a` and `2b` have the same potential but may have different currents, `2a` belongs to the incoming branch and `2b` belongs to the outgoing branch. Both sequential observations are retained and are never averaged.

Other duplicate potentials inside a monotonic branch remain invalid because they cannot be interpolated unambiguously without altering the measured sequence.

## Data Model

The public confirmed series continues to represent one dataset per scan rate, with sequential `points` retained unchanged.

The analysis layer introduces explicit branch metadata rather than inferring branch identity from duplicate potential values. Each recombined analysis sample has:

- sequential position
- branch index (`0`, `1`, or `2`)
- potential
- one interpolated current per scan rate
- whether it represents a branch boundary shared with the adjacent branch

Fit records carry the same branch index and sequential identity. Potential alone is not used as a unique key because a full cycle can visit it more than once.

Existing single-branch callers remain supported through a default branch index of zero or an equivalent compatibility adapter.

## Interpolation

For each branch position:

1. Match the corresponding branch across all scan-rate series.
2. Find that branch's common overlapping potential range.
3. Build the union of measured potentials inside the overlap.
4. Sort the branch grid in its original direction, ascending or descending.
5. Linearly interpolate only within that branch and never extrapolate.

No interpolation crosses a turning-point boundary. The return branch never uses the forward branch current at the same potential.

After all branches are interpolated, concatenate them in traversal order. A boundary created from one shared source point is emitted once; two separately recorded equal-potential boundary points are both emitted.

## Point Interval

Apply the configured point interval independently within each branch. Always retain:

- the first cycle point
- every branch endpoint/turning point
- the final cycle point

Sampling does not smooth, average, reorder, or mutate any original current.

## b-Value and Dunn Fitting

b-value and Dunn regressions run independently at every branch-aware grid position. The same potential on different branches produces distinct fit records.

The existing R² classification and filtering rules remain unchanged:

- low-R² records remain internally available for quality counts and masks
- low-R² fitted rows are omitted from visible fitted-result tables, clipboard result rows, potential-result navigation, and fitted-record CSV exports
- threshold `0` disables R² exclusion

Quality counts cover the complete recombined cycle.

## Dunn Reconstruction and Integration

Reconstructed total, capacitive, and diffusion-controlled currents follow the complete sequential grid.

Dunn contribution areas are integrated inside each branch using the absolute potential interval `|ΔE|`. Branch areas are summed before percentages are calculated. The implementation never integrates a synthetic interval across a branch boundary and never allows the descending sweep to cancel the ascending sweep solely because its potential direction is negative.

Invalid or low-quality Dunn positions remain null in reconstructed component arrays and continue to break integration continuity under the existing valid-mask rules.

## UI and Plots

- Original-current, reconstructed-current, b-value, and Dunn plots use the recombined sequential order and represent the complete loop.
- Result tables preserve this order and retain the existing 12-row scroll viewport and selectable-column copying.
- b-value and Dunn fitted-result tables add a localized `Sweep branch` / `扫描分支` column.
- Branch values use stable sequence labels such as `Branch 1`, `Branch 2`, and `Branch 3`; direction may be shown as an arrow where useful.
- Previous/Next navigation walks branch-aware fit records in sequential order.
- When a typed potential occurs on multiple branches, the first valid occurrence in scan order is selected; Previous/Next can then traverse later occurrences.
- Plot selection may visually mark all occurrences sharing an x-coordinate, but fit details and navigation remain tied to one branch-aware record.

## Exports

- Raw-cycle export retains the original point order for every scan-rate series.
- Interpolated and Dunn component exports follow the recombined complete-cycle order.
- b-value and Dunn fitted-record CSVs include the localized branch column so repeated potentials remain distinguishable.
- Existing metadata, R² filtering, numerical precision, and bilingual schemas remain intact.
- Clipboard copying uses the displayed table schema and all filtered result rows, including the branch column.

## Error Handling

Show a visible localized analysis error when:

- a series contains more than two turning points
- scan-rate series have different branch counts
- scan-rate series have different ordered branch directions
- a branch cannot provide at least two distinct potential positions for interpolation
- corresponding branches have no common potential range

Do not silently truncate a cycle, discard the return branch, sort the entire cycle, average repeated potentials, or fall back to first-sweep-only behavior.

## Testing

Automated tests cover:

1. Monotonic input remains compatible.
2. One-turn cycles retain both sweeps in original order.
3. Two-turn cycles retain all three branches in original order.
4. A once-recorded turning point is emitted once after recombination.
5. Two separately recorded currents at an equal turning potential are both retained.
6. Forward and return currents at the same potential produce separate b/Dunn records.
7. Point-interval sampling retains all branch endpoints.
8. Dunn component arrays and plots follow the complete loop.
9. Dunn area uses branch-local `|ΔE|` and includes both traversal directions without cross-boundary integration.
10. Result tables, clipboard TSV, and CSV exports preserve sequential order and branch identity.
11. Low-R² filtering remains branch-aware and threshold `0` remains unfiltered.
12. More than two turns and inconsistent branch structures produce visible bilingual errors.
13. Equivalent CSV, TXT, and XLSX cycles produce the same internal structure and successful analysis.
14. The full test suite and production build pass before integration.

## Non-Goals

- Automatic cycle averaging across repeated cycles
- Supporting more than one complete cycle in one dataset
- Smoothing or noise filtering of potential/current values
- Automatic repair of inconsistent branch structures
- Changing the b-value or Dunn regression formulas
- Redesigning unrelated pages

