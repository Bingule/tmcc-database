# Final branch review fix report

Date: 2026-08-27

Worktree: `D:\codex_communication\tmcc-database\.worktrees\fix-dunn-literature-plot`

Baseline: `bd8a7054`

## Scope

Implemented the accepted findings in `final-fix-brief.md` as one integrated TDD wave:

1. target-rate-aware strict peak-family matching;
2. normalized complete-cycle validation during import confirmation;
3. a true pending Add-peak interaction backed by original extrema;
4. strict detected-center mapping to defensible original local extrema;
5. the common-range equality guard, stable manual labels, and scoped near-zero regression eligibility cleanup;
6. stronger regression evidence for the deliberately unchanged branch-only endpoint-tail behavior.

No homepage, shared Dunn `g(V)` reconstruction, contribution algorithm, threshold/weighted confidence mode, full-cycle ordering, or deployment workflow code was changed.

## TDD evidence

### 1. Target-rate matching and strict original-extremum mapping

RED tests added in `tests/cv-peak-analysis.test.ts`:

- A non-uniform `[0.01, 9, 10, 11, 1000]` mV/s fixture seeded from the richest middle rate initially mapped only the middle three rates instead of both lower and higher sides.
- Permuting input order exposed the same target-rate-independent matching defect.
- A rising-background fixture initially mapped a smoothed center to a raw non-extremum.
- An isolated raw spike initially displaced the selected source point from the defensible clean peak (`0.025 V` instead of `0 V`).

GREEN implementation:

- `extendGroups` now passes the target scan rate through `monotoneAssignments` and `matchCost`.
- `predictPeakPotentialAtRate` performs a stable potential-versus-`log(scanRate)` linear fit, with one-point and invalid-rate fallbacks.
- Trend residual is evaluated at the actual target rate; raw displacement/prominence comparison uses the nearest already-matched rate.
- Strict detected centers are mapped only through `findOriginalPeakExtrema`, then filtered by local prominence, distance, and smoothing residual.
- The permutation test now produces identical rate-to-potential mappings and `b = 0.7`.

Focused GREEN: `tests/cv-peak-analysis.test.ts` — 12/12 passed.

### 2. Normalized import confirmation

RED page tests added in `tests/cv-page.test.tsx`:

- CSV, UTF-16 TXT, and XLSX fixtures contain a valid first 161-point loop followed by unequal one-direction tails with a tiny plateau/jitter step.
- Before the production change, all three were rejected at confirmation with the complete-cycle structure error.

GREEN implementation:

- `confirmCvSeries` now validates through `normalizeAlignedCvCycles`, matching analysis-time first-loop selection.
- A post-loop tail is accepted while it remains one-directional (including native-scale jitter); a tail that performs another genuine turn remains a structural error.
- The legacy one-sweep confirmation fallback is retained only to preserve existing parser behavior for inputs that analysis can reject later with its established analysis error.
- Existing finite-value, scan-rate, row/column, and localized error-code behavior remains intact.

Integration RED/GREEN note: an initial branch-resolution guard was too broad and rejected five legitimate sparse-cycle/analysis-error tests. The failing focused run was 191/196. Root-cause isolation showed that the guard conflated sparse-but-structural input with a second completed traversal. Replacing it with ignored-tail direction-change detection restored those five tests while preserving the existing localized repeated-cycle error.

Focused GREEN: parsing/import/page coverage included all three formats; final consolidated focused run passed 196/196.

### 3. True pending Add peak and stable labels

RED tests added in `tests/cv-peak-overrides.test.ts` and `tests/cv-page.test.tsx`:

- A weak manually anchored family could not extend because the old implementation searched only automatic candidates.
- Add immediately mutated/cloned the selected family, and the button exposed no pending accessible state (`aria-pressed` was absent).
- Removing and adding again reused `manual-1`/its label instead of allocating a stable next identity.

GREEN implementation:

- Add toggles pending mode without changing any family; the next overview click supplies the nearest original `(seriesIndex, sourceIndex)` point.
- The clicked source must be an unambiguous branch-local original extremum and must not already be occupied by an active family.
- Manual extension proceeds independently above and below the anchor scan rate, predicts at each target rate, considers same-branch original extrema, and excludes occupied source indices.
- `nextManualPeakNumber` and `nextLabelIndex` are monotonic state counters. Add/remove/add produces `manual-1`, then `manual-2`, and unique UI/CSV labels.
- Add exposes `aria-pressed`; pressing it again cancels pending mode. No new translation key was required.

Focused GREEN: overrides 6/6; pending-add page regression 1/1; peak chart/analysis/override focused coverage passed.

### 4. Minor correctness fixes

Common range:

- RED: touching-only branch ranges did not throw.
- GREEN: `commonMinimum >= commonMaximum` now throws `noCommonPotentialRange` before interval construction.

Near-zero status versus eligibility:

- RED: a high-R2 but negligible-current group still produced `rSquared = 1`, and a confirmed near-zero point remained plotted (5 points instead of 4).
- GREEN: `CvPeakRatePoint.regressionEligible` is computed independently of user operation status. Fits and regression charts exclude ineligible near-zero points even after Confirm/Adjust status changes.

Branch-only endpoint tail (deliberate non-change):

- No production code changed.
- The NCP endpoint regression now explicitly asserts `oppositeCurrent = 0`, `capacitiveCurrent = g * originalCurrent`, zero correction magnitude, and containment inside the signed raw branch.

## Files changed

Production:

- `src/components/CvPeakAnalysisPanel.tsx`
- `src/components/CvPeakOverviewChart.tsx`
- `src/components/CvPeakRegressionChart.tsx`
- `src/lib/cvInterpolation.ts`
- `src/lib/cvParsing.ts`
- `src/lib/cvPeakAnalysis.ts`
- `src/lib/cvPeakOverrides.ts`
- `src/lib/cvTypes.ts`
- `src/pages/CvKineticsPage.tsx`

Tests:

- `tests/cv-interpolation.test.ts`
- `tests/cv-page.test.tsx`
- `tests/cv-peak-analysis.test.ts`
- `tests/cv-peak-charts.test.tsx`
- `tests/cv-peak-overrides.test.ts`
- `tests/cv-workflow.test.ts`

## Verification

Codex Node used for every command:

`C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`

Final focused command:

```text
node.exe .\node_modules\vitest\vitest.mjs run tests/cv-peak-analysis.test.ts tests/cv-peak-overrides.test.ts tests/cv-peak-charts.test.tsx tests/cv-page.test.tsx tests/cv-parsing.test.ts tests/cv-import.test.ts tests/cv-interpolation.test.ts tests/cv-workflow.test.ts tests/cv-cycle.test.ts
```

Result: 9 files passed, 196 tests passed.

First full-suite run:

```text
node.exe .\node_modules\vitest\vitest.mjs run
```

Result: 42 files passed, 1 file failed; 522 tests passed and the new pending-add page test exceeded Vitest's 5-second default only under full parallel load. Its assertions did not fail. The same test passed alone in 2.92 seconds after assigning a 15-second timeout consistent with this file's other end-to-end page tests.

Final full-suite run:

```text
node.exe .\node_modules\vitest\vitest.mjs run
```

Result: 43 files passed, 523 tests passed. The pre-existing React `act(...)` environment warning appeared in `b-value-overview-chart.test.tsx`; there were no test failures.

Type check:

```text
node.exe .\node_modules\typescript\bin\tsc --noEmit
```

Result: exit code 0, no diagnostics.

Repository checks:

- `git diff --check`: no whitespace errors (only the worktree's LF-to-CRLF notices).
- Baseline rechecked immediately before reporting: `bd8a7054`.

## Self-review

- Verified the diff is limited to the nine CV production files, six CV test files, and this report.
- Verified no shared Dunn reconstruction/formula, contribution calculation, homepage, localization-resource architecture, or deployment file changed.
- Verified branch-only endpoint-tail production behavior is untouched and is now explicitly characterized by regression assertions.
- Verified strict and manual candidates retain original source indices and branch isolation.
- Verified manual extensions cannot reuse active same-series source indices and remain subject to the ten-family cap.
- Verified pending Add does not mutate prior families and can be canceled by pressing Add again.
- Verified operation status cannot make a near-zero point regression-eligible or visible on the regression chart.
- Verified normalized import confirmation preserves prior localized structural errors while accepting the requested tolerant first-loop inputs.

## Follow-up final review: first manual family from zero strict fits

Root cause: `CvPeakAnalysisPanel` returned immediately when `selectedFit` was null. The page and override layers already supported `fits = []`, pending Add, an empty-fit overview, and creation of `manual-1`; the early return alone hid both the overview click target and Add action.

RED:

- Added a page-level fixture with a valid three-rate CV cycle and one original forward local extremum per rate that strict smoothing correctly rejects as isolated noise.
- The new test verified the zero-fit notice, empty-fit overview, safe controls, pending Add, original-extremum click, `manual-1` / `Peak 1`, three original `sourceIndex = 155` points, and no `console.error`/`console.warn` calls.
- Exact command:

```text
node.exe .\node_modules\vitest\vitest.mjs run tests/cv-page.test.tsx -t "creates the first manual family from the zero-strict-peak overview without warnings"
```

- Result before production change: 1 failed, 60 skipped. The expected assertion failed because `[data-export-id="cv-peak-overview-chart"]` was `null`.

GREEN:

- Removed the empty-fit early return.
- The concise no-peaks notice, multi-scan overview, and peak-actions row now remain visible.
- Add stays enabled until the existing ten-family limit and exposes the existing pending `aria-pressed` state.
- Peak/scan selectors and Confirm/Exclude/Restore are omitted until a fit exists; Remove remains rendered but disabled, so no invalid callback can fire.
- Regression and result tables appear after the first manual family is created, without a placeholder fit or new translation key.
- Targeted result: 1 passed, 60 skipped; the test confirmed `manual-1`, `Peak 1`, three original same-branch source indices, and zero console/act warnings.

Required focused verification:

```text
node.exe .\node_modules\vitest\vitest.mjs run tests/cv-page.test.tsx tests/cv-peak-charts.test.tsx tests/cv-peak-overrides.test.ts tests/i18n.test.tsx
```

Result: 4 files passed, 90 tests passed, with no warning output.

```text
node.exe .\node_modules\typescript\bin\tsc --noEmit
```

Result: exit code 0, no diagnostics.

Follow-up files changed: `src/components/CvPeakAnalysisPanel.tsx`, `tests/cv-page.test.tsx`, and this report. Self-review confirmed that analysis, matching, override allocation, ten-family enforcement, occupied-candidate exclusion, localization resources, and Dunn behavior are unchanged.

## Real NCP final-gate follow-up: 50 mV/s shoulder recovery

Root cause investigation:

- The supplied real-data gate reproduced identically for CSV and XLSX: peak coverage was `[5, 4, 5]`; P2 was missing only at 50 mV/s, while Dunn raw/plot ranges matched and both overshoot diagnostics remained zero.
- Stage tracing showed strict detection produced only P1 at 50 mV/s, while P2 had four strict members at 2, 5, 10, and 20 mV/s. Guided recovery predicted P2 at `-0.2670688557 V` and opened a valid local window.
- That window contained the defensible original forward local maximum at `-0.23340 V`, `sourceIndex = 762`, with neighborhood prominence `10.63749`.
- Seven-point smoothing placed its maximum one sample later at `-0.23218 V`, `sourceIndex = 763`. That adjacent plateau point was not itself an original local maximum, so the old recovery code rejected the entire candidate instead of mapping the smooth center back to source 762.

RED:

- Added `makeHighRateShoulderNcpSeries` to `tests/fixtures/cvPeakData.ts`. It is self-contained, uses five NCP-like scan rates, has P1/P2/P3 families, and gives the 50 mV/s P2 a broad rising-background shoulder with an adjacent two-sample plateau.
- Added a peak-analysis regression that requires strict coverage `[5, 4, 5]`, recovered coverage `[5, 5, 5]`, exact original potential/current lookup through `sourceIndex`, same-forward-branch membership, and original-neighbour local-maximum evidence.
- Exact RED command:

```text
node.exe .\node_modules\vitest\vitest.mjs run tests\cv-peak-analysis.test.ts -t "recovers the NCP-like 50 mV/s shoulder at its adjacent original local extremum" --reporter verbose
```

- Result before production change: 1 failed, 12 skipped; received `[5, 4, 5]` instead of `[5, 5, 5]`.

GREEN implementation:

- Guided recovery still starts from a detected smoothed extremum, but now enumerates only original branch-local extrema within a tightly bounded mapping radius (`max(2 native intervals, 0.5% branch span)`, capped by the guided window).
- Candidates must retain the existing neighborhood-prominence floor and additionally pass a raw-versus-smoothed residual limit. This accepts a broad shoulder whose smoothed center shifts by one sample while continuing to reject isolated raw spikes.
- Selection remains target-rate guided and deterministic: nearest smoothed center to the trend prediction, then nearest original extremum to that center, then prominence/source-index tie breaks.
- No arbitrary window maximum path was restored; every accepted point comes from `findOriginalPeakExtrema` and retains its original same-branch `sourceIndex`.

Targeted GREEN: 1 passed, 12 skipped.

Required focused verification:

```text
node.exe .\node_modules\vitest\vitest.mjs run tests\cv-peak-analysis.test.ts tests\cv-workflow.test.ts tests\cv-page.test.tsx tests\cv-peak-overrides.test.ts
```

Result: 4 files passed, 101 tests passed. The existing rising-background and isolated-noise-spike regressions remained green.

Real NCP gate:

```text
node.exe .\node_modules\vitest\vitest.mjs run .superpowers\sdd\real-ncp-final.test.ts --reporter verbose
```

Result: 1 passed. Both CSV and XLSX produced peak coverage `[5, 5, 5]`; P2 potentials were `[-0.23340, -0.30609, -0.34228, -0.37510, -0.41099]`. The 50 mV/s point maps to original `sourceIndex = 762`. Both formats retained identical raw/plot potential ranges, zero maximum overshoot, and zero maximum envelope violation.

Type check:

```text
node.exe .\node_modules\typescript\bin\tsc --noEmit
```

Result: exit code 0, no diagnostics.

Full suite:

- The first parallel run completed all 525 repository assertions but the supplied ignored real-data gate exceeded its 5-second default after printing fully correct results.
- Its local timeout was set to 15 seconds (the gate file is ignored and is not part of the production commit), then the exact full-suite command was rerun:

```text
node.exe .\node_modules\vitest\vitest.mjs run
```

Result: 44 files passed, 526 tests passed, including the real CSV/XLSX gate in 7.08 seconds. The only output noise was the previously documented React `act(...)` warning in `b-value-overview-chart.test.tsx`.

Follow-up files changed: `src/lib/cvPeakAnalysis.ts`, `tests/cv-peak-analysis.test.ts`, `tests/fixtures/cvPeakData.ts`, and this report. Self-review confirmed no change to strict candidate detection, target-rate group matching, Dunn reconstruction/contributions, page behavior, overrides, localization, or deployment.

## Remaining concerns

No known correctness concern remains within the accepted fix scope. The only verification noise is the pre-existing React `act(...)` warning noted above.
