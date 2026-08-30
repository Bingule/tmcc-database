# Dunn stabilization finite-evidence resampling report

## Root cause

The smallest failing page CSV has three aligned potentials `[0, 0.5, 1]` and scan rates `[1, 4, 9]`. Automatic turning-point trim removes both endpoints, while the middle forward and reverse Dunn fits have finite fraction `1` and threshold confidence `5` at R² `1`.

`stabilizeDunnFractions` recognized that native evidence existed, but `resampleBranch` located the diagnostic node at `0.5` using the interval `[0, 0.5]`. Because the left endpoint was null, it discarded the exact right-hand anchor. All 101 diagnostic nodes became null and `linearGapFill` threw `reconstructionFailed`. The stack was:

```text
linearGapFill
robustFractionNoise
stabilizeDunnFractions
analyzeCvWorkflow
```

The shared-g optimizer was never called, so no lambda, iteration, or residual failed. Git blame locates the original resampling behavior in `f8659e1a` (`feat: stabilize sparse Dunn confidence evidence`); complete-candidate enforcement in `43f4b7fa` and the physical auto-trim commits were not the failing stage.

Further diagnostics showed why an exact-node-only patch was insufficient:

- The alternating-gap page fixture has 602 aligned points and 297 finite native evidence points per branch, distributed at non-0.01 normalized positions from about `0.0083194676` to `0.993344426`. The old adjacent-record resampling produced zero finite diagnostic nodes and the same `linearGapFill` stack.
- The long-gap fixture has 5,001 aligned points, 4,949 finite native evidence points per branch, and 99 finite diagnostic nodes. Its remaining page failure is downstream and not an evidence-resampling failure.
- The `maps exact potential...` and `sorts scan-rate...` fixtures contain zero finite native Dunn evidence after approved trimming/current validation. They correctly retain the existing `reconstructionFailed` behavior and are not addressed by this change.

## TDD evidence

The existing exact-node regression was retained. Two tests were then added before the source fix:

1. a single native anchor at normalized potential `0.123456789`, which does not coincide with a 101-node position;
2. a 202-point grid with alternating finite and missing native records, chosen so no interior source point coincides with a 0.01 diagnostic node.

Red command:

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/cv-dunn-stabilization.test.ts -t "does not coincide|alternating sparse" --reporter=verbose
```

Red result:

```text
Tests  2 failed | 15 skipped (17)
Both failed with reconstructionFailed at linearGapFill.
```

After the source fix, the exact-node, non-diagnostic single-anchor, and alternating sparse-anchor tests passed 3/3. The complete stabilization file passed 17/17.

## Source fix

Each branch is resampled independently:

- collect only native `evidenceAt(...) !== null` points together with normalized positions;
- zero evidence returns 101 nulls, preserving the approved visible failure when neither branch has evidence;
- one evidence point is extended across all 101 diagnostic nodes;
- two or more evidence points are linearly interpolated between their nearest finite left and right anchors;
- diagnostic nodes outside the finite evidence range use the nearest finite endpoint.

`diagnosticCombination` still combines the independently resampled forward and reverse branches by confidence. The returned stabilization fractions remain on the original native grid and are not replaced by the 101-node diagnostic trend.

## Verification

Focused stabilization:

```text
Test Files  1 passed (1)
Tests       17 passed (17)
```

Existing locked raw-noise and smoothing diagnostics passed without expectation changes, including the 101-node oracle values.

Core page verification passed 6/6:

- initial CSV import/analysis/exports;
- equivalent CSV, UTF-16 TXT, and XLSX imports;
- localized CSV and asynchronous PNG export behavior;
- pathological alternating-gap point fallback.

The workflow suite passed 17/17. NCP and BP150 both-confidence-mode cases completed in 3.291 s and 2.834 s; sparse-stabilization cases completed in 0.972 s and 0.853 s. `tsc --noEmit` exited 0 with no diagnostics.

The complete CV run passed 259/263. Four page failures remain outside this stabilization fix:

- two fixtures have no finite native Dunn evidence and retain the approved error semantics;
- one export assertion still expects the pre-physical-trim 2,000 mV value instead of the current 100 mV value;
- the long-gap fixture fails downstream despite 99 finite stabilization diagnostic nodes and requires separate diagnosis.

No temporary diagnostic logging or files remain. Task 4 page/component files were not edited or staged by this change.
