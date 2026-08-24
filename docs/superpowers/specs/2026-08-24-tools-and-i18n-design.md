# TMCC Tools and Bilingual Interface Design

## Goal

Add a standalone bilingual Materials Research Tools section to tmccdb.org while preserving the existing TMCC Database homepage, data model, material explorer behavior, and routes. English remains the default language; Simplified Chinese is selected explicitly by the user and persisted locally.

## Scope

The branch adds `/tools`, `/tools/cv-kinetics`, `/tools/theoretical-capacity`, and `/tools/molecular-weight`. The homepage receives only a Tools navigation entry and bilingual UI support. Tool cards do not appear in homepage content.

Version 1 includes CSV, TXT, and XLSX CV import; shared b-value and Dunn analysis; data preview; scan-rate confirmation; overlapping-range interpolation; CSV result export; and SVG/PNG figure export. It excludes smoothing, paste-from-Excel, insertion-based electron inference, and XLSX result export. These exclusions avoid modifying experimental data or adding secondary workflows before the required scientific core is validated.

## Existing Architecture and Safety

The project is a React 19, Vite 5, and TypeScript static application deployed through GitHub Pages. It has no routing, internationalization, spreadsheet, or general charting dependency. Existing scientific plots use responsive inline SVG. Tests use Vitest with jsdom. All work remains on `add-tools`; the branch is not merged automatically.

The addition does not modify database records, material filtering rules, scientific property calculations, existing hash anchors, or material query-string handling. Existing homepage sections remain in their current order. Shared layout extraction is limited to the header, navigation, and footer needed by the new standalone routes.

## Routing and Static Deployment

`App.tsx` becomes a small route selector based on normalized `window.location.pathname`. It renders the existing homepage for `/`, the four requested Tools pages for their exact paths, and a localized not-found page for unknown paths. Normal anchor navigation is used rather than introducing a client-side routing dependency. Existing homepage hash links and `?material=` URLs continue to work.

A build helper copies the generated root `index.html` into route-specific output directories after Vite finishes. This lets GitHub Pages serve direct visits and refreshes at every Tools URL without relying on a server rewrite rule. The helper respects Vite's generated asset URLs and does not alter deployment triggers.

## Shared Layout

`SiteLayout` renders the existing brand lockup, primary navigation, compact language selector, page content, and footer. The homepage retains its current hero directly below the navigation; Tools pages use a quieter page header and breadcrumbs. Navigation contains one new Tools item only. Individual tools remain discoverable from `/tools`.

The language selector presents `EN | 中文`, uses buttons with pressed-state semantics, remains keyboard accessible, and wraps cleanly with the existing mobile navigation. It is visually secondary to the primary navigation.

## Internationalization

The localization layer uses typed resource modules:

- `src/locales/en.ts` is the canonical resource shape.
- `src/locales/zh.ts` must satisfy the same recursive key structure.
- `src/i18n/I18nProvider.tsx` owns language state and persistence.
- `src/i18n/useI18n.ts` exposes `language`, `setLanguage`, and `t(key, params)`.

The implementation uses no runtime translation service and makes no browser-language guess. On startup it reads `tmcc-language` from `localStorage`; only `en` and `zh` are accepted. A missing, invalid, or inaccessible value falls back to English. Selecting a language updates visible text immediately, sets `document.documentElement.lang` to `en` or `zh-CN`, and persists the selection. Storage access is guarded so privacy modes or jsdom limitations cannot break rendering.

Stable dotted keys group text by responsibility, for example `nav.tools`, `tools.cvKinetics.title`, `capacity.electronNumber`, `molecularWeight.result`, `common.export`, and `errors.invalidFormula`. Interpolation handles values such as result counts without embedding JSX in resources. Scientific utilities return stable codes and structured details; components translate those codes.

All user-facing homepage and Tools text is localized, including navigation, section headings, buttons, labels, placeholders, status messages, help text, validation errors, chart labels, accessibility labels, and breadcrumbs. Chemical formulas, element symbols, material IDs, space groups, numerical values, email addresses, file names, equations, and units remain unchanged unless a surrounding descriptive label is translated.

## Tools Landing Page

`/tools` uses the shared layout and displays the title “Materials Research Tools” / “材料研究工具”, the approved subtitle, and three focused tool links. Each card contains a localized title, description, semantic link, and simple existing Lucide icon. The layout is responsive and visually consistent with the site's restrained teal, slate, and olive palette.

## Chemical Formula Engine

One reusable recursive-descent parser supports element symbols, implicit counts, integer counts, decimal counts, parentheses, and nested parentheses. It accepts the required formulas, including `Li1.2Mn0.54Ni0.13Co0.13O2`, `Ca(OH)2`, and `Fe2(SO4)3`.

The tokenizer rejects unknown elements, empty groups, unmatched parentheses, zero or negative counts, misplaced numbers, trailing tokens, and dot or middle-dot hydrate notation. Hydrates such as `CuSO4·5H2O` return an explicit unsupported-format error rather than a partial mass.

Atomic weights live in one typed table and use commonly accepted conventional standard atomic-weight values suitable for molar-mass calculations. Parsed results aggregate repeated elements while preserving deterministic first-appearance order. The molar-mass utility returns total mass and per-element count, atomic weight, mass contribution, and mass percentage. Both calculators consume this same utility.

## Molecular Weight Calculator

`/tools/molecular-weight` provides a labeled formula field, example formulas, submit action, localized validation, and a result table. Successful results display element, count, atomic weight, mass contribution, mass percentage, and total molar mass in g/mol. Scientific identifiers and units remain invariant across languages. Tables scroll horizontally on narrow screens.

## Theoretical Capacity Calculator

`/tools/theoretical-capacity` uses manual electron transfer number `n` as the only version 1 mode. It validates a supported formula and finite `n > 0`, then calculates molar mass and

`Q = nF / (3.6M)`

where `F = 96485.33212 C/mol`, `M` is in g/mol, and the result is in mAh/g. The page shows the formula, molar mass, electron count per formula unit, substituted equation, and theoretical specific capacity. No valence, oxidation-state, or multivalent insertion assumptions are inferred.

## CV Data Model and Import

The CV workflow runs entirely in the browser. A parsed dataset contains one potential/current series per scan rate, source metadata, warnings, and raw rows. CSV and TXT use a delimiter-aware parser that recognizes comma, tab, or whitespace-separated numeric data and quoted CSV fields. XLSX import uses `read-excel-file` through its browser entry point because ZIP/XML workbook parsing is not safe to recreate ad hoc. Version 1 reads the first visible worksheet and reports an explicit error when it contains no usable table.

The primary wide format has one potential column and multiple current columns. Header matching identifies likely potential labels case-insensitively and extracts positive scan rates from headings such as `1`, `1 mV/s`, or `Current 5 mV s-1`. The UI always shows editable scan-rate fields for confirmation. Duplicate, missing, zero, negative, or non-finite scan rates block analysis with localized errors.

Rows with a valid potential and at least one valid current are retained. Each current series may omit points. Series are sorted by potential, duplicate potentials within a series are rejected, and at least two valid points per series are required. A preview shows source rows and detected mappings before analysis.

## Interpolation

The common potential domain is the intersection of every selected series: the largest series minimum through the smallest series maximum. An empty or zero-width intersection is an error. The default common grid is the sorted union of all measured potentials inside that overlap, avoiding arbitrary smoothing or extrapolation. Linear interpolation fills only internal gaps. No value is generated outside a series' measured range.

Interpolation is deterministic and does not smooth the data. The UI explicitly states that analysis may use linear interpolation on the overlapping domain and never extrapolates.

## Linear Regression

A reusable ordinary least-squares utility accepts paired finite values and returns slope, intercept, R-squared, and valid-point count. It returns no fit for fewer than two points, zero x variance, or non-finite output. Tests cover exact and noisy linear data.

## b-Value Analysis

At each common potential, the analysis evaluates

`log(|i|) = log(a) + b log(v)`.

It skips zero and non-finite current values instead of attempting `log(0)`. Negative currents are included through their absolute magnitude. A potential receives no fit when fewer than two valid, distinct scan rates remain. The result contains potential, `b`, `log(a)` intercept, R-squared, and point count.

The page shows b-value versus potential, an accessible potential selector, a selected-potential `log(|i|)` versus `log(v)` fit, and fit statistics. Clicking a point on the b-value plot updates the inspected potential; the adjacent native select provides the equivalent keyboard interaction. The UI states the absolute-current and skipped-zero assumptions.

## Dunn Analysis

At each common potential, the analysis regresses

`i(V) / sqrt(v) = k1 sqrt(v) + k2`

so the slope is `k1` and the intercept is `k2`. At each scan rate it reconstructs signed currents:

- `i_cap(V) = k1(V) v`
- `i_diff(V) = k2(V) sqrt(v)`

Fits require at least two finite scan-rate observations with distinct positive scan rates. Missing fits remain missing rather than being replaced with zero.

Contribution percentages use trapezoidal integration over adjacent potential intervals where both component values exist:

- `A_cap = integral |i_cap(V)| dV`
- `A_diff = integral |i_diff(V)| dV`
- `capacitive % = 100 A_cap / (A_cap + A_diff)`
- `diffusion % = 100 A_diff / (A_cap + A_diff)`

This prevents anodic and cathodic cancellation and normalizes the displayed components to 100%. If the total magnitude is zero or insufficient intervals exist, no percentage is returned. The method is documented in code comments and localized UI help.

Users choose a scan rate to view the original, capacitive, and diffusion-controlled curves. A summary table and contribution-versus-scan-rate plot show both percentages for every valid rate. Curves use distinct color, line style, labels, and legend text so meaning does not depend on color alone.

## Charts and Export

A focused reusable SVG chart component handles one or more numerical series, axes, legends, hover/focus inspection, and responsive scaling. It follows the existing inline-SVG approach instead of adding a charting dependency. It includes empty and invalid-data states and visible focus styles.

CV exports include separate CSV files for interpolated data, b-value results, Dunn k1/k2 values, reconstructed capacitive and diffusion currents, and contribution summary. CSV output uses invariant decimal notation and explicit units in headers. The UI also exports each supported figure as SVG or renders the SVG to canvas for PNG download. Export controls are disabled until valid results exist.

## Error Handling

Scientific and parsing modules return typed results or throw typed domain errors with codes such as `unsupportedHydrate`, `unknownElement`, `malformedWorkbook`, `missingScanRate`, `duplicateScanRate`, `insufficientScanRates`, `invalidCurrent`, and `noOverlappingPotential`. UI components map these codes to localized messages and preserve diagnostic details such as the offending header, symbol, row, or scan rate.

No calculation silently substitutes a scientific value, extrapolates a curve, treats failed fits as zero, or hides data modification. Warnings remain visible next to results and are included in exported metadata where applicable.

## Styling, Responsiveness, and Accessibility

New pages reuse the site's typography, spacing, border radii, neutral backgrounds, existing buttons, and restrained palette. Tools use application-like input and result panels without redesigning the homepage. Animations are limited to existing CSS hover and focus transitions.

All controls have associated labels. Dynamic messages use appropriate live regions. Tabs, if used, implement keyboard and ARIA tab semantics; otherwise clearly headed stacked sections are preferred. Charts include accessible names and adjacent numerical tables. Mobile layouts collapse to one column; wide tables scroll; SVG plots scale to their containers; and the language switch remains usable at 320 px width.

## Test Strategy

Development follows test-first red-green cycles. Unit tests cover:

- Formula parsing and molar mass for every required example, including approximately 18.015 g/mol for `H2O` and 74.09 g/mol for `Ca(OH)2`.
- Rejection of hydrate notation, invalid syntax, and unknown elements.
- Theoretical capacity and mAh/g units using a known synthetic case.
- Linear-regression slope, intercept, R-squared, and invalid inputs.
- Synthetic b-value recovery at `b = 0.5` and `b = 1.0`.
- Synthetic Dunn recovery for known `k1` and `k2`.
- Absolute-magnitude Dunn integration and 100% normalization.
- CSV/TXT parsing, scan-rate inference, missing values, duplicates, interpolation, overlap rejection, and no extrapolation.
- XLSX workbook parsing through a small in-memory fixture.
- English default, Chinese switching, English switching, persistence, invalid saved-language fallback, and complete resource-key parity.
- Exact route rendering and bilingual titles for all four Tools routes.
- Existing homepage behavior, anchors, material selection, and explorer filtering.

Final validation runs `pnpm validate:data`, `pnpm test`, and `pnpm build`. The built output is inspected for route-specific HTML entry points. Browser-level manual checks cover the homepage and all Tools routes in both languages, refresh persistence, mobile layout, navigation, upload errors, calculations, plots, and downloads.

## Dependency Policy

No router, i18n, or charting package is added. `read-excel-file` is the sole planned production dependency. Its documented browser export accepts `File`, `Blob`, or `ArrayBuffer`, ships TypeScript support, uses `fflate` for browser decompression, and is MIT licensed. The dependency is limited to XLSX row extraction; all scientific validation and interpretation remain in project-owned typed utilities.

## Success Criteria

- The homepage remains database-focused and retains existing behavior.
- One Tools navigation item reaches `/tools`.
- All four requested routes load directly and after refresh on the static deployment.
- English is the default; explicit Chinese selection updates the full UI and persists.
- Translation resources contain the UI prose; scientific utilities remain language-neutral.
- Both calculators share one validated formula and molar-mass engine.
- One imported CV dataset powers both scientifically tested analyses.
- Negative-current, zero-current, overlap, interpolation, and magnitude-integration assumptions are explicit and correctly enforced.
- Required exports, responsive layouts, accessible controls, tests, and build checks pass.
- The completed branch remains unmerged for review.
