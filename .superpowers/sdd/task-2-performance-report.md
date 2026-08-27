# Task 2 performance report — shared-g(V) optimizer

## Outcome

Implementation commit: `beb076ac61379bb9b04da88f8197cd5af0283a35` (`perf: accelerate shared Dunn optimization`).

The production-sized shared-g optimizer no longer spends most of its time exhausting high-lambda projected-FISTA candidates. Every candidate retains its own independent 50,000-iteration ceiling; there is no aggregate candidate budget and no candidate is accepted unless its box-aware KKT residual reaches the candidate tolerance. The final effective-lambda solve retains the unchanged `<= 1e-6` residual requirement and `[0, 1]` projection.

## Changed files

- `src/lib/cvDunnReconstruction.ts`
- `tests/cv-dunn-reconstruction.test.ts`

The six uncommitted Task 3 files were not edited or staged.

## TDD red evidence

The new 871-point deterministic regression test was written before production changes. It verifies length, physical bounds, final KKT residual, smoothing effect, deterministic full-candidate L-curve selection, and a deliberately loose six-second wall-clock ceiling.

Command:

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/cv-dunn-reconstruction.test.ts -t "production-sized"
```

Initial result:

```text
FAIL: expected 9343.9013 to be less than 6000
Test Files  1 failed (1)
Tests       1 failed | 12 skipped (13)
```

All correctness assertions passed; only the 9.344-second performance assertion failed.

## Root-cause profile

The initial ascending-lambda implementation produced this 871-point profile:

| Phase | Lambda | Iterations | Residual | Time |
|---|---:|---:|---:|---:|
| candidate | `1e-8` | 390 | `9.955e-6` | 23.7 ms |
| candidate | `1e-7` | 1,090 | `9.858e-6` | 55.9 ms |
| candidate | `1e-6` | 6,460 | `9.978e-6` | 226.3 ms |
| candidate | `1e-5` | 35,360 | `9.997e-6` | 1,101.1 ms |
| candidate | `1e-4` | 50,000, failed | `1.567e-4` | 1,534.1 ms |
| candidate | `1e-3` | 50,000, failed | `2.015e-3` | 1,773.1 ms |
| candidate | `1e-2` | 50,000, failed | `2.063e-2` | 1,584.8 ms |
| candidate | `1e-1` | 50,000, failed | `2.068e-1` | 1,587.3 ms |
| final | `1.2e-6` | 19,070 | `9.996e-7` | 581.8 ms |

The four high-lambda candidates consumed about 76% of the total time and were then excluded from L-curve ranking.

A secondary small-grid issue was also identified: strict floating-point `nextObjective > previousObjective` comparisons caused two candidates to repeatedly restart for 50,000 iterations. Applying the same `1e-12` relative numerical tolerance used by majorization reduced those candidates to ten iterations without changing the objective or acceptance residual.

## Final numerical approach

1. Candidate solves run from high lambda to low lambda, with the previous converged solution retained as the successive warm start. Completed candidates are sorted back into ascending lambda order before the unchanged deterministic L-curve calculation.
2. The highest-lambda fallback seed is the normalized-potential weighted least-squares affine fit, which has zero curvature before box projection.
3. For each lambda, the exact unconstrained quadratic system is assembled from `W + lambda A^T A`. Because every curvature row touches three adjacent nodes, the symmetric Hessian is pentadiagonal.
4. An O(n) banded Cholesky factorization solves that unconstrained system. Its clamped result is used only when it has a lower value of the same objective than the successive warm start. Non-positive pivots or non-finite values fall back safely to the warm start.
5. Projected FISTA remains the acceptance solver. A candidate enters the L-curve only at residual `<= 1e-5`; every candidate has its own independent maximum of 50,000 iterations. The selected effective-lambda solution is independently initialized by the same banded solve and returned only at residual `<= 1e-6`.
6. Majorization uses the exact quadratic remainder `d^T(W + lambda A^T A)d`, avoiding two repeated full objective evaluations per iteration. FISTA state and residual-gradient arrays are reused to avoid per-iteration allocations.

There is no `MAX_CANDIDATE_ITERATIONS` aggregate budget in the submitted code. The full eight-candidate grid is attempted, each with its original independent 50,000-iteration limit.

## Candidate-selection result

On the 871-point production regression, all eight candidates converged immediately from the banded initial solution. Their candidate residuals ranged from `2.77e-14` through `1.58e-7`, all below `1e-5`; no candidate was truncated or silently admitted as unconverged.

With the complete eight-point L-curve, the selected base lambda is `1e-4`. The old 8×50,000 implementation selected `1e-7` only because candidates `1e-4` through `1e-1` exhausted their individual limits and were absent from the ranking. The test now locks the complete-candidate selection at `1e-4`.

## Green verification and benchmarks

Focused reconstruction command:

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/cv-dunn-reconstruction.test.ts
```

Final result:

```text
Test Files  1 passed (1)
Tests       13 passed (13)
```

The complete reconstruction test file took 31 ms in the final parallel verification run; the earlier isolated final 871-point run was below the reporter's slow-test threshold. The regression ceiling remains a deliberately loose 6,000 ms for slow CI hosts.

NCP default-threshold benchmark used the real `makeNcpRegressionSeries()` fixture, auto interval/trim, `dunnConfidenceMode: "threshold"`, and `rSquaredThreshold: 0.95`. A temporary timing-only test in the authorized test file was removed after measurement:

```text
NCP threshold/default 0.95: 583.321 ms, 5 contributions
```

The existing NCP integration test covering threshold and weighted modes together completed in 1.230 seconds in a standalone run and 1.613 seconds during the final parallel verification:

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/cv-workflow.test.ts -t "keeps NCP contributions"
```

```text
Test Files  1 passed (1)
Tests       1 passed | 16 skipped (17)
```

TypeScript verification:

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\typescript\bin\tsc --noEmit
```

It exited 0 with no diagnostics.

## Self-review

- Same normalized fidelity and curvature objective; the factor of two cancels in the direct quadratic normal equations.
- Direct banded output is only an initial point and is clamped to `[0, 1]`; projected FISTA and box-aware KKT residual remain authoritative.
- Final tolerance remains `1e-6`; candidate tolerance remains `1e-5`; every solve retains the 50,000-iteration ceiling.
- Candidate order is restored to ascending lambda before L-curve curvature, so ranking geometry is unchanged.
- No hard-coded 870/871 behavior or candidate-index shortcut exists.
- The existing Task 2 51/501 normalized-position grid-density regression passes.
- No console/profile instrumentation remains; `git diff --check` reports no whitespace errors beyond repository LF-to-CRLF notices.

## Concern outside Task 2

The uncommitted Task 3 workflow test for capacitive-percentage stability currently reports about `2.85` percentage points between its 51/501 fixtures. A diagnostic run with the old equivalent 8×50,000 candidate work produced the same failure (`2.8504712942670167`), so it is not caused by this performance change; the parent assigned that fixture/contribution-integration issue to Task 3. Task 2's required normalized-position `g` comparison remains green.
