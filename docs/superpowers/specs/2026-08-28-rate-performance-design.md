# TMCC Rate Performance Tools Design

## Goal

Extend the existing tmccdb.org Materials Research Tools system with a bilingual, modular Rate Performance section. The addition provides a production-ready characteristic-time rate analysis and a coherent set of advanced analysis pages without rebuilding the site, redesigning unrelated pages, or restructuring the actively developed CV implementation.

## Scope and safety boundary

The feature adds the following exact routes:

- `/tools/rate-performance`
- `/tools/rate-performance/model-comparison`
- `/tools/rate-performance/transport-limitations`
- `/tools/rate-performance/characteristic-time`
- `/tools/rate-performance/thickness-kinetics`
- `/tools/rate-performance/ca-analysis`
- `/tools/rate-performance/empirical-models`
- `/tools/rate-performance/energy-power`

The existing `/tools` page receives one Rate Performance card with the eight sub-options presented through the existing Tools card/navigation language. No new global sidebar or separate visual identity is introduced.

Changes are limited to route registration, static route generation, the Tools landing page, bilingual resources, narrowly reusable chart/parser/export support, new Rate Performance files, and new tests. Existing CV equations, cycle handling, b-value analysis, Dunn analysis, result layout, and in-progress CV component structure remain unchanged. Any shared parser extraction must preserve the existing CV public API and pass the full CV regression suite before it is accepted.

## Existing architecture

The repository is a React 19, Vite 5, and TypeScript static site deployed through generated route-specific HTML entries. `App.tsx` selects exact paths and lazy-loads page modules. Tools share typed English/Chinese resources, restrained site-level CSS, breadcrumbs, reusable inline-SVG scientific charts, and CSV/SVG/PNG export helpers. State is local React state plus the existing i18n context. XLSX import uses `read-excel-file`; tests use Vitest and jsdom.

The Rate Performance design follows those conventions. It does not add a router, state-management framework, chart package, visual theme, or runtime translation service.

## Module structure

New code is grouped under `src/tools/rate-performance/`:

```text
src/tools/rate-performance/
  pages/
    RatePerformanceAnalysisPage.tsx
    ModelComparisonPage.tsx
    TransportLimitationPage.tsx
    CharacteristicTimePage.tsx
    ThicknessKineticsPage.tsx
    CaRateAnalysisPage.tsx
    EmpiricalModelsPage.tsx
    EnergyPowerPage.tsx
  components/
    RatePerformanceNav.tsx
    RateDataInput.tsx
    ManualRateTable.tsx
    RateFileImport.tsx
    ColumnMapping.tsx
    DatasetSummary.tsx
    ResultCards.tsx
    FitStatus.tsx
    ModelTheoryPanel.tsx
    ReferenceList.tsx
    RateChartPanel.tsx
    ExportToolbar.tsx
  analysis/
    fitRatePerformance.ts
    compareRateModels.ts
    fitStatistics.ts
    confidenceIntervals.ts
    transportTimes.ts
    thicknessScaling.ts
    reconstructCaRate.ts
    energyPower.ts
  models/
    types.ts
    registry.ts
    tianCharacteristicTime.ts
    rationalCharacteristicTime.ts
  data/
    rateExamples.ts
    thicknessExamples.ts
    caExamples.ts
    energyExamples.ts
  references/
    types.ts
    rateReferences.ts
  utils/
    rateValidation.ts
    rateUnits.ts
    chartSampling.ts
    rateExports.ts
```

File names may be adjusted to match discoveries made during implementation, but responsibilities remain separated. Pages orchestrate interaction only. Scientific equations, normalization, optimization, statistics, interpretation rules, examples, references, and export serialization do not live inside page JSX.

## Loading and performance

Every Rate Performance route is lazy-loaded. The nonlinear optimizer is imported only by analysis code reached after a user requests a fit. XLSX code is dynamically imported only when an XLSX file is selected. Example datasets are imported by the pages that use them rather than by `App.tsx`, the header, or the Tools landing page.

Analysis functions accept plain typed data and return serializable typed results. They do not depend on React or browser DOM objects, preserving a future migration path to a Web Worker or server calculation. The initial implementation remains on the main thread because the expected datasets and three-parameter fits are small; multi-dataset execution exposes progress and cancellation boundaries so a Worker can be introduced without changing page contracts.

Raw analysis points and display points are stored separately. Fits always use every valid selected scientific point. Display sampling is permitted only above a documented chart threshold, never mutates the raw data, and is disclosed beside the chart.

## Shared tabular input

The input flow is:

```text
manual entry or upload
  -> raw table
  -> detected columns and explicit mapping
  -> validation report
  -> unit normalization
  -> scientific dataset
  -> analysis result
  -> charts and exports
```

Manual rate input starts with six rows and supports add, delete, clear, example loading, and two-column paste. The table uses a fixed practical height with an internal vertical scrollbar. Rows retain stable identifiers so editing or deleting one row cannot misalign neighboring values.

CSV, TXT, and XLSX upload reuses one generic tabular-reading layer. The generic layer owns file-size and workbook safety limits, encoding detection, delimiter parsing, workbook extraction, and raw cells. CV-specific layout detection remains in the CV adapter; Rate Performance column detection and mapping remain in the Rate adapter. This avoids duplicate parsers while keeping scientific interpretation out of the shared file layer.

The import summary reports file name, detected headers, mapped rate/capacity columns, total rows, valid points, invalid points, missing values, rate range, and capacity range. Invalid rows remain visible in the import report and are never silently converted into zeros.

## Unit model

Every imported point preserves:

- original numerical value;
- original rate unit;
- original capacity value and unit;
- normalized analysis value;
- normalization metadata and user-provided quantities.

`h^-1` data can be used directly as the Tian rate `R` only when the user confirms that it follows the measured-discharge-time definition. Specific current in `A g^-1` or `mA g^-1` is converted to `R` with the measured capacity at the same point: `R = (I/M)/(Q/M)_E`. C-rate is not silently treated as `R`; users may either analyze it with a model explicitly defined for C-rate or provide the information required for a scientifically justified conversion. Capacity conversion between `mAh g^-1` and `Ah kg^-1` is identity in numerical magnitude but retains the original unit metadata.

Conversions requiring active mass, nominal capacity, theoretical capacity, measured capacity, or volume expose those inputs and block the dependent calculation when they are absent. Assumed values are never inserted automatically.

## Model registry and validation gate

The model registry is the single source of truth for model identity, descriptive name, equation, independent-variable definition, parameter definitions, parameter units and types, bounds, initialization, fit function, assumptions, limitations, references, and scientific status.

Scientific status is either `validated` or `pending-validation`. Only validated models expose fitting actions or enter comparison ranking. Pending models display their evidence gap and remain disabled. A model cannot become validated until its exact equation, independent variable, units, parameter interpretation, limiting behavior, applicability, and primary reference have been checked against the source publication.

The initial validated production models are:

1. Tian characteristic-time rate model for measured rate `R`:

   `Q(R) = Q_M [1 - (R tau)^n (1 - exp(-(R tau)^(-n)))]`

2. Rational characteristic-time model for measured rate `R`, derived in the 2020 chronoamperometry work:

   `Q(R) = Q_M / [1 + 2 (R tau)^n]`

The Heubner-type model is enabled only if the implementation review verifies its exact primary-publication equation and whether the selected form applies to C-rate or measured rate `R`. Peukert-type, generic exponential, generic power-law, and Wong-type entries remain `pending-validation` unless the same evidence gate is satisfied. Names shown in the UI remain descriptive; author names belong in structured references and model provenance.

## Primary rate analysis

The main page fits the Tian model to positive, finite rate-capacity pairs. It estimates `Q_M`, `tau`, and `n` with bounded nonlinear least squares. The derived transition rate follows the publication definition:

`R_T = (1/2)^(1/n) / tau`

It is not replaced with `1/tau`.

The page reports `Q_M`, `tau`, `n`, `R_T`, R-squared, RMSE, adjusted R-squared, SSE, AIC, AICc when defined, BIC, 95% confidence intervals when estimable, parameter standard errors, iteration/convergence state, and warnings. It provides capacity-versus-rate, log-x capacity-versus-rate, log-capacity-versus-log-rate, and residual charts. Experimental data use markers; fits use smooth lines.

The empty state contains the input panel, example dataset, expected outputs, clearly marked example-result preview, example figure, explanation, governing equation, parameter meanings, references, and a Try Example Dataset action. Example results are visually and semantically distinct from user results.

## Nonlinear fitting and statistics

The production optimizer is bounded Levenberg-Marquardt nonlinear least squares, loaded dynamically. It uses data-scaled initial values and a small deterministic set of scientifically plausible starts, not a coarse parameter grid. Parameter bounds prevent nonphysical `Q_M <= 0`, `tau <= 0`, or `n <= 0` solutions.

A fit is successful only when the optimizer reports or demonstrates convergence, all parameters and predictions are finite, bounds are respected, and the resulting SSE is finite. Maximum-iteration, timeout, singular-system, boundary-lock, non-finite, and insufficient-data outcomes are explicit failures or warnings. The UI never presents failed parameters as valid results.

Statistics use unweighted residuals by default and label that choice. Confidence intervals derive from the residual variance and Jacobian covariance only when residual degrees of freedom and the covariance matrix are valid. Undefined adjusted R-squared, AICc, or confidence intervals render as not estimable with an explanation rather than `NaN`, infinity, or a fabricated value.

Duplicate rates remain independent observations and generate a visible notice; they are not silently averaged. Zero or negative rates, negative capacities, missing values, and non-finite cells are rejected from analysis with row-level reasons. A minimum of more observations than fitted parameters is required for a fit, while reliable uncertainty output requires positive residual degrees of freedom.

## Model comparison

Model Comparison fits the same normalized dataset against selected validated models. The comparison table includes descriptive model name, equation family, parameter values, parameter count, R-squared, adjusted R-squared, RMSE, AIC, AICc, BIC, delta AIC, convergence, and rank.

Ranking prioritizes finite AICc when available, otherwise finite AIC, with BIC and residual diagnostics shown as supporting evidence. R-squared alone never selects a winner. A Recommended Model appears only when all compared fits converged, the selected information criterion is defined, and the evidence difference clears a documented threshold. Otherwise the page reports that the data do not justify a unique recommendation. Users can toggle fitted curves and inspect residuals per model.

## Transport limitation analysis

Transport analysis implements only terms supported by Tian et al. The base decomposition is:

`tau = tau_electrical + tau_diffusive + t_c`

with diffusive contributions from electrode pores, separator, and active material, and electrical contributions from out-of-plane electron transport plus ionic transport through pores and separator. The detailed calculation uses the publication's equations and explicit SI conversion.

Each contribution is calculated only when every required input for that term is supplied. Missing inputs produce an unavailable term with a list of missing quantities. The page can show calculated component times, their sum, and the unresolved difference relative to a fitted `tau`; it does not assign arbitrary percentages. Relative contribution charts are displayed only for positive, fully calculated terms and are labeled model-based estimates.

## Characteristic time analysis

The page summarizes fitted total characteristic time and any separately supported electrical, diffusive, and kinetic terms. Every output is labeled fitted, derived, user input, measured, or assumed. The interpretation explicitly states that these are effective, model-dependent characteristic times rather than direct microscopic measurements.

Timescale charts use consistent units, propagate available parameter uncertainty, and offer sensitivity analysis by varying one supplied input over a disclosed range while holding others fixed. The page does not invent `tau_C` or `tau_D` definitions; a symbol appears only if its definition is tied to the selected validated equation.

## Thickness-dependent kinetics

Users can add, duplicate, and delete electrode datasets. Each dataset stores sample name, thickness, thickness unit, optional mass loading, rate-capacity data, selected validated model, fitted `tau`, and uncertainty.

Thickness is normalized to metres and time to seconds for cross-sample analysis. The page produces `tau` versus `L`, `tau` versus `L^2`, and log-`tau` versus log-`L`, and compares linear, quadratic, and power-law scaling. The power-law fit returns `alpha`, confidence interval when estimable, R-squared, and RMSE. The interpretation states that scaling may be consistent with a class of limitations but cannot establish a unique mechanism by itself.

## CA rate analysis

CA input contains time and current plus active mass, normalization basis, sign convention, integration range, and optional baseline correction. Smoothing is off by default and is not part of the initial production calculation.

Within the selected range, sorted unique time points are integrated by the trapezoidal rule:

`Q(t)/M = integral_0^t (I/M) dt`

The measured effective rate is reconstructed using the same Tian definition at each usable point:

`R(t) = (I(t)/M) / (Q(t)/M)`

Points with zero accumulated capacity or nonpositive/non-finite effective rate are excluded with reasons. Sign handling is explicit and reversible. Baseline correction is off by default; when enabled it uses a user-specified constant baseline and records it in results and exports. The page shows current-time, capacity-time, effective-rate-time, capacity-rate, and fitted-rate-model charts and exports the reconstructed rate-capacity table.

## Empirical model library

Each model card presents descriptive name, equation, parameter definitions, physical role, required independent variable, useful regime, assumptions, limitations, validation status, and primary reference. Validated cards offer Use This Model and Compare Models actions. Pending cards explain why fitting is disabled and do not produce numerical parameters.

## Energy and power analysis

Summary input accepts rate or current, capacity, average voltage, and discharge time. Specific energy and power are calculated only when the normalization basis is explicit. For full discharge curves, energy is integrated as `integral V dQ` using ordered curve points. Power uses integrated energy divided by the corresponding discharge duration. Volumetric values require explicit electrode or device volume/density information.

Multiple samples can be compared on a Ragone plot. Energy and power values retain whether they are active-material, electrode, or device normalized so unlike bases are not silently compared as equivalent.

## Model and Theory panel

Every analysis page uses the same structured theory presentation:

1. governing equation;
2. parameter definitions;
3. physical meaning;
4. units;
5. parameter type;
6. limiting behavior;
7. applicability;
8. assumptions;
9. limitations;
10. references;
11. citation guidance.

Parameter types are Measured, User Input, Fitted, Derived, and Assumed. Equations use accessible MathML or semantic HTML with readable text alternatives, avoiding a heavy global LaTeX runtime.

## References

References live in typed metadata with `id`, authors, title, journal, year, volume, pages or article number, DOI, URL, and role. JSX never contains duplicated citation strings. Citation copying uses one serializer and includes only verified metadata.

Core references are:

- Ruiyuan Tian, Sang-Hoon Park, Paul J. King, Graeme Cunningham, Joao Coelho, Valeria Nicolosi, and Jonathan N. Coleman, “Quantifying the factors limiting rate performance in battery electrodes,” Nature Communications 10, 1933 (2019), DOI `10.1038/s41467-019-09792-9`.
- Ruiyuan Tian, Paul J. King, Joao Coelho, Sang-Hoon Park, Dominik V. Horvath, Valeria Nicolosi, Colm O'Dwyer, and Jonathan N. Coleman, “Using chronoamperometry to rapidly measure and quantitatively analyse rate-performance in battery electrodes,” Journal of Power Sources 468, 228220 (2020), DOI `10.1016/j.jpowsour.2020.228220`.
- Jonathan N. Coleman and Ruiyuan Tian, “Developing models to fit capacity-rate data in battery systems,” Current Opinion in Electrochemistry 21, 1-6 (2020), DOI `10.1016/j.coelec.2019.12.003`.
- C. Heubner et al., “Semi-empirical master curve concept describing the rate capability of lithium insertion electrodes,” Journal of Power Sources 380, 83-91 (2018), DOI `10.1016/j.jpowsour.2018.01.077`.
- C. Heubner et al., “Comparison of chronoamperometric response and rate-performance of porous insertion electrodes: Towards an accelerated rate capability test,” Journal of Power Sources 397, 11-15 (2018), DOI `10.1016/j.jpowsour.2018.06.087`.

References beyond this list enter production metadata only after verification against the publisher or DOI record.

## Localization and accessibility

All user-facing prose, labels, buttons, validation messages, statuses, table headings, chart labels, empty states, warnings, and accessibility labels use the existing typed English/Chinese resources. Scientific symbols and standard abbreviations remain invariant.

Every form control has an associated label. Dynamic fit and import states use polite live regions. Native buttons and inputs retain keyboard behavior and visible focus. Page subnavigation exposes the current route. Tables scroll within bounded containers, layouts collapse at existing breakpoints, and charts include accessible titles plus adjacent numerical data or summaries.

## Export

The existing CSV, SVG, and PNG utilities remain authoritative. Rate-specific serializers provide original data, normalized/processed data, fitted curves, parameters and statistics, residuals, reconstructed CA rate-capacity data, and multi-sample energy/power data. Every export includes units, model identifier, rate definition, normalization basis, and relevant settings. Figure export reuses the existing SVG/PNG workflow.

## Error handling

Domain modules return typed results or throw typed domain errors with stable codes. UI translation maps codes to bilingual messages. Error classes distinguish input validation, unit conversion, file parsing, optimizer convergence, unavailable statistics, incomplete physical models, and export failures.

The UI never substitutes a missing scientific value, silently changes a unit definition, averages duplicates, hides rejected rows, extrapolates beyond the selected model range, reports non-converged parameters, or presents assumptions as measurements.

## Test strategy

Development follows test-first red-green cycles. Tests cover:

- Tian equation values and low-/high-rate limiting behavior;
- synthetic recovery of known `Q_M`, `tau`, and `n`;
- noise-added synthetic recovery and uncertainty availability;
- insufficient points, zero/negative rate, negative/non-finite capacity, duplicates, and optimizer failure;
- SSE, RMSE, R-squared, adjusted R-squared, AIC, AICc, BIC, delta AIC, and undefined-statistic paths;
- unit preservation and valid/blocked conversions among `h^-1`, C-rate, `A g^-1`, `mA g^-1`, `mAh g^-1`, and `Ah kg^-1`;
- CSV, TXT, XLSX, column mapping, missing values, invalid rows, and parser resource limits;
- CA trapezoidal integration, sign handling, time ordering, integration range, baseline settings, and reconstructed `R`;
- transport term availability, dimensional conversion, unresolved time, and absence of fabricated percentages;
- thickness linear, quadratic, and power-law fits without mechanism overclaiming;
- summary and curve-based energy/power calculations and normalization bases;
- bilingual resource parity, all eight routes, static build entries, navigation, empty/example states, accessibility, and exports;
- complete existing CV tests and the full repository regression suite.

Final verification runs `pnpm validate:data`, `pnpm test`, and `pnpm build`, inspects generated route entries and Vite chunks, and checks that Rate Performance, optimizer, XLSX, and example-data chunks are absent from the initial homepage path. Browser checks cover every new route in English and Chinese, mobile layout, direct refresh, manual entry, paste, file mapping, fit failures, chart interaction, and downloads.

## Success criteria

- Rate Performance is an extension of the existing Tools system and visually matches it.
- All eight routes exist and load directly on the static deployment.
- Rate Performance pages and heavy dependencies are lazy-loaded.
- Scientific calculations are independent of React rendering and ready for later Worker migration.
- The Tian model, transition-rate definition, CA reconstruction, transport terms, and references match verified literature.
- Unverified models cannot fit or produce numerical output.
- Raw data, normalized analysis data, and display data remain separate.
- Manual and uploaded input are usable, bilingual, accessible, bounded in height, and transparent about invalid rows.
- Failed fits and unavailable statistics are explicit.
- No arbitrary transport percentages or unsupported mechanism claims are produced.
- Existing CV logic and behavior remain untouched except for a behavior-preserving shared parser adapter if required.
- New scientific logic is covered by focused tests, and the existing Tools/CV regression suite and production build pass.
