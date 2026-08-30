# Task 2 long-gap optimizer convergence report

## Scope

- Changed `src/lib/cvDunnReconstruction.ts` and `tests/cv-dunn-reconstruction.test.ts` only.
- Did not modify the page, stacked-bar chart, workflow, stabilization, or Task 3 files.

## TDD evidence

Red command:

```text
node .\node_modules\vitest\vitest.mjs run tests/cv-dunn-reconstruction.test.ts -t "5001-point constant target" --reporter=verbose
```

Before the fix, the 5,001-point constant target with 52 zero-confidence boundary points failed after 7.62 seconds with `CvAnalysisError: reconstructionFailed`. Phase 1 instrumentation showed the `baseLambda=0.1` candidate exhausted 50,000 iterations at residual `2.0579515874459596e-5`, while the remaining seven candidates met `1e-5`.

Green result for the same command: 1/1 passed in 41 ms. Successful return also proves the existing full-eight-candidate guard was satisfied; the result additionally asserts box bounds, `converged=true`, and final optimality residual `<=1e-6`.

## Numerical fix

The continuous curvature operator is mathematically unchanged. Its coefficients are now constructed with the middle coefficient as the exact floating-point negation of the two outer coefficients, and row application uses differences relative to the middle value. This preserves the constant nullspace numerically instead of evaluating a large `a*g0 + b*g1 + c*g2` cancellation on dense grids. The same stable form is used by the majorization check.

No tolerance, iteration budget, lambda candidate, box constraint, L-curve completeness rule, or final KKT criterion changed.

## Verification

- `tests/cv-dunn-reconstruction.test.ts`: 15/15 passed; 84 ms test time.
- `tests/cv-workflow.test.ts`: 17/17 passed; 4.14 s test time. NCP both modes 1.331 s; BP150 both modes 1.066 s.
- Long-gap page test (`preserves every unavailable-gap run...`): 1/1 passed; 10.493 s test time.
- `node .\node_modules\typescript\bin\tsc --noEmit`: exit 0.

The page test file and stacked-bar worktree changes were pre-existing shared work and were not edited or staged by this task.
