# CV peak recovery, Dunn range, and peak controls design

Status: approved by the user on 2026-08-27.

## Scope

This is a focused correction on `fix-dunn-literature-plot`. It changes only the peak b-value detection/tracking, the Dunn plot range presentation, and the peak-control layout. It does not change the Dunn equations, shared `g(V)` reconstruction, contribution percentages, import behavior, homepage, or bilingual architecture.

## 1. Cross-scan peak recovery

The current detector applies the same strict prominence rule independently to every scan-rate curve. A weak peak or shoulder that fails that first pass cannot be matched later, which leaves otherwise coherent peak families with incomplete coverage (for example P1 = 5 points, P2 = 4, and P3 = 3 in the NCP dataset).

Use a two-pass branch-specific workflow:

1. Keep the existing strict local-extremum detector as the high-confidence first pass.
2. For each sweep branch, choose the reference scan by the richest reliable candidate set, with confidence as the tie-breaker, rather than always using the median scan rate.
3. Build and order at most ten peak families from the strict candidates without mixing forward and reverse branches.
4. For every missing scan-rate member of a family, predict its potential from neighbouring matched scan rates on the log-rate trend and search only a bounded local window on the same branch.
5. In the guided window, use the lightly smoothed branch to identify the correct local extremum, but map the accepted result back to an actual original data point and source index.
6. Accept a recovered point only when its direction, local prominence, positional continuity, and separation from adjacent peak families are consistent. Do not fabricate, interpolate, or force a peak when no defensible local extremum exists.
7. Preserve stable peak labels and disclose genuinely unresolved points as missing.

The peak-current regression remains `log(|i_peak|) = log(a) + b log(v)` and continues to require at least three usable scan-rate points.

## 2. Dunn plot potential-range fidelity

The selected complete original CV cycle is the authority for the plotted x-domain. The chart must use the raw cycle minimum and maximum even if the common Dunn fitting grid, valid-fit subset, or display sampling is narrower.

The full ordered `plotPath` remains the source for original and capacitive curves, shaded polygons, exports, and integration. Display sampling must retain:

- the first and last point of the complete cycle;
- the first and last point of every forward/reverse branch run;
- turning points and synthetic zero crossings.

Add validation that the rendered original path covers the selected raw-cycle potential range and that each capacitive boundary covers the corresponding branch range. Format near-round endpoint ticks readably (for example `-1` and `0`) without changing internal values. Do not stretch, extrapolate, or alter `g(V)` merely to imitate a reference image.

## 3. Compact peak-control panel

Replace the current split layout with one aligned control panel:

- row 1: analysis mode;
- row 2: Peak and Scan rate selectors;
- row 3: Confirm point, Exclude point, Restore automatic point;
- row 4: Add peak and Remove peak using secondary emphasis.

Desktop controls align to a consistent grid and use only the width they need. On narrow screens, selectors and action groups wrap cleanly and buttons remain usable without overflow. English and Simplified Chinese labels must both fit without creating detached or floating button columns.

## Error handling and compatibility

Guided peak recovery is conservative: an ambiguous or absent extremum remains missing and visible to the user. Existing manual confirm, adjust, exclude, restore, add, and remove behavior remains intact. Existing CSV/TXT/XLSX analysis, b-value R² handling, Dunn threshold/weighted modes, physical containment validation, exports, and responsive layout must remain unchanged.

## Verification

- Add a regression dataset where three peak families have initial coverage 5/4/3 and verify guided recovery produces five defensible original-data points for each family.
- Verify recovered candidates stay on the correct branch, retain original source indices, and never exceed the ten-family limit.
- Verify genuinely absent peaks remain missing.
- Verify Dunn chart endpoints and both capacitive branch endpoints match the selected complete cycle after display sampling.
- Verify near-zero endpoint labels are readable while exported numeric values keep full precision.
- Verify desktop control order/alignment and mobile wrapping in both languages.
- Run focused tests, the complete test suite, and the production build before deployment.
