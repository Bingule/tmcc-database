# Auto turning-point trim grid-invariance report

## Scope and root cause

This change is limited to `src/lib/cvDunnFit.ts` and `tests/cv-dunn-fit.test.ts`.
The six existing uncommitted Task 3 files were used only by the verification run and were not edited or staged.

The prior automatic trim selected `max(3 * nativePotentialInterval, 0.005 * span)` and then applied interval-derived bounds. For the same 1.4 V physical span this produced 0.056 V on a 51-point grid and 0.0084 V on a 501-point grid. The different zero-confidence support caused endpoint gap filling to start from physically different anchors before shared-g optimization.

Automatic trim is now exactly `0.005 * (commonMaximum - commonMinimum)`. It is a physical 0.5% potential window and is independent of grid density. A finite positive span is required; the computed automatic trim must remain below half the span. Manual trim conversion and its existing strict half-span bound are unchanged.

## TDD evidence

The fit tests were changed first to require equal 51/501 trim values for the same `[-0.8, 0.6]` span, retain safe behavior for a very small positive span, and reject zero span.

Red command:

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/cv-dunn-fit.test.ts --reporter=verbose
```

Red result:

```text
Tests  2 failed | 8 passed (10)
coarse auto trim: expected 0.007, received 0.056
zero span: expected function to throw
```

After the minimal production change, the same command passed 10/10.

## Verification

Related fit, cycle, and workflow suites:

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/cv-dunn-fit.test.ts tests/cv-cycle.test.ts tests/cv-workflow.test.ts --reporter=verbose
```

Result: 3 files passed, 51 tests passed. The NCP two-confidence-mode case completed in 1.578 s and BP150 in 1.599 s; their sparse-stabilization cases completed in 0.945 s and 0.728 s respectively.

The current Task 3 nonlinear orthogonal-residual fixture passed its 51/501 workflow assertions. A temporary uncommitted profiling test, removed immediately after measurement, reported:

- maximum capacitive contribution difference: 0.182381805 percentage points (`< 0.5`)
- maximum fixed-potential g difference: 0.002511648 (`< 0.02`)

TypeScript command:

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\typescript\bin\tsc --noEmit
```

Result: exit 0 with no diagnostics.

## Self-review

- Auto trim contains no native-interval term and therefore represents the same physical window for equal spans.
- `0.005 * span` is strictly below half-span for valid ordinary positive spans; non-finite, zero, and numerically unrepresentable half-span cases fail with `invalidDataShape`.
- Coarse grids naturally trim only points actually sampled inside the physical window, typically the turning point itself.
- The change does not alter shared-g smoothing, confidence policy, workflow orchestration, or Task 3 fixtures.
- No temporary logging or profiling file remains.

## Review follow-up: numerical tolerance and sparse-grid evidence

Review of the initial physical-trim change identified two record-level evidence-erasure cases. Both were reproduced with tests before production changes.

### Red evidence

The first new test fits a `[0, 5e-301, 1e-300]` potential grid and requires the middle record to remain valid. The second fits `[0, 0.001, 0.999, 1]` and requires the automatic trim to preserve at least one internal fit record.

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/cv-dunn-fit.test.ts -t "retains fit evidence|reduces auto trim" --reporter=verbose
```

Initial result:

```text
Tests  2 failed | 10 skipped (12)
tiny-span middle record: expected valid, received trimmed
sparse grid trim: expected below 0.001, received 0.005
```

### Numerical fix

- Endpoint comparison tolerance now uses `16 * Number.EPSILON` times the actual maximum magnitude of the two endpoints and their span. The former artificial 1 V scale floor was removed. If multiplication underflows, `Number.MIN_VALUE` supplies the smallest representable positive tolerance.
- The nominal automatic trim remains exactly `0.005 * span` whenever an internal sampled point lies outside that window.
- If the nominal window plus its floating tolerance would cover every internal point, the trim is reduced to below the deepest internal turning-point distance. Returning zero is allowed as the final fallback because `fitBranch` then performs no trimming and cannot erase all evidence.

The focused red tests then passed 2/2, and the full fit file passed 12/12.

### Follow-up verification

```powershell
& 'C:\Users\ThinkPad\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/cv-dunn-fit.test.ts tests/cv-cycle.test.ts tests/cv-workflow.test.ts --reporter=verbose
```

Result: 3 files and 53 tests passed. NCP and BP150 both-confidence-mode cases completed in 1.592 s and 1.733 s; their sparse-stabilization cases completed in 1.013 s and 0.781 s.

Fresh 51/501 nonlinear-fixture profiling reported the same stable values:

- maximum capacitive contribution difference: 0.182381805 percentage points
- maximum fixed-potential g difference: 0.002511648

`tsc --noEmit` exited 0 with no diagnostics. The temporary profile test was deleted, and the six uncommitted Task 3 files remained unstaged and unmodified by this follow-up.
