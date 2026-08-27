# Task 4 Report — Labeled 100% Stacked Contribution Chart

## Scope

- Added a dedicated accessible native-SVG `ScientificStackedBarChart`.
- Replaced only the Dunn contribution line chart on `CvKineticsPage`.
- Preserved the existing export id/metadata, result table, column-copy controls, bilingual keys, and all other charts.
- Added count-aware responsive width styling; no dependencies, animations, assets, or unrelated redesign.

## TDD evidence

1. Added `tests/scientific-stacked-bar-chart.test.tsx` first.
2. Verified RED: Vitest failed because `src/components/ScientificStackedBarChart.tsx` did not exist.
3. Implemented the smallest component satisfying sorting, normalization, stacked segments, two-decimal labels, small-segment leader labels, accessibility, fixed 0–100 ticks, metadata, and responsive width.
4. Verified GREEN: `4/4` component tests passed.
5. Added page integration assertions before replacing the line chart.
6. Review follow-up verified that CSS-only enlargement preserved the fixed 800-unit geometry and could overlap labels at 20 bars. Added a failing 20-bar coordinate-space regression, then made the SVG viewBox and plot width grow by an 84-unit slot per bar.
7. Added an SVG download regression that verifies serialized bars, contribution labels, accessible title, metadata, and the preserved export id.

## Verification

- `tests/scientific-stacked-bar-chart.test.tsx`, `tests/scientific-chart.test.tsx`, `tests/tool-export.test.ts`: `29/29` passed.
- Task 4 page integration case `imports once, confirms rates, and produces both analyses with exports`: `1/1` passed.
- `tsc --noEmit`: passed (exit 0).
- `git diff --check`: clean.

## Review follow-up verification

- Twenty-bar internal viewBox width is at least `68 + 20 * 84 + 38 = 1786` units, rather than a CSS-scaled fixed 800-unit plot.
- Estimated label bounds retain at least a four-unit gap between adjacent categories for both ordinary inside labels and `< 7%` external labels.
- Component plus export suites: `14/14` passed.
- Task 4 page integration: `1/1` passed.
- The formerly blocked long-gap page regression now passes after the independent optimizer correction.
- Existing generic table tests already exercise selectable-column copy behavior; the chart refactor did not modify `DataTable` or its copy toolbar.
