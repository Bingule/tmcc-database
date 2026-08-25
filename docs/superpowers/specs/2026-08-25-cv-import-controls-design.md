# CV Import Formats, Point Interval, and R² Filtering Design

Date: 2026-08-25  
Branch: `enhance-cv-import-controls`  
Status: Draft for user review

## 1. Objective

Extend the existing bilingual CV Kinetics Analysis page with explicit input-format selection, Excel copy/paste, a shared point-interval control, and a configurable regression-quality threshold. The workflow must remain scientifically transparent: it must not guess an ambiguous column layout, smooth currents, silently delete low-quality fits, or alter the original uploaded curves.

## 2. Confirmed Decisions

- The user explicitly chooses `XYYYYY` or `XYXYXY`; the site does not auto-detect the layout.
- The user explicitly chooses whether the first row contains column titles or numeric data. The default is “first row contains column titles.”
- Data can come from `.csv`, `.txt`, or `.xlsx` upload, or from an Excel-compatible paste area.
- Scan rates are entered as one ordered list in `mV/s`.
- A dataset must contain 3–20 distinct positive scan rates.
- Point interval is an integer from 1–30, defaults to 1, and applies to both b-value and Dunn analysis.
- Point interval is subsampling, not smoothing.
- One R² threshold applies to both b-value and Dunn regressions. It accepts 0–1, steps by 0.01, and defaults to 0.95.
- Fits below the R² threshold are excluded from valid plots and Dunn contribution integration but remain visible in tables and CSV exports with an explicit status.
- English remains the default site language. All new visible, validation, help, ARIA, and export text has explicit English and Simplified Chinese resources.

## 3. Supported Data Layouts

### 3.1 `XYYYYY`: one shared potential column

```text
Potential   Current 1   Current 2   Current 3
0.00        0.12        0.25        0.38
0.10        0.15        0.29        0.44
```

- The first column is the shared potential axis.
- Every subsequent column is one current series.
- The number of current columns must equal the number of scan rates.
- Blank or non-finite current cells retain the existing sparse-data validation behavior; they are never converted to zero.

### 3.2 `XYXYXY`: independent potential/current pairs

```text
Potential 1   Current 1   Potential 2   Current 2
0.00          0.12        0.01          0.25
0.10          0.15        0.11          0.29
```

- Columns are paired strictly by position: columns 1–2 form curve 1, columns 3–4 form curve 2, and so on.
- The total column count must be even.
- Each pair may have a different potential range, spacing, or number of populated rows.
- A row may be blank for one pair while later pairs still contain data.
- The number of valid pairs must equal the number of scan rates.

### 3.3 Header handling

- “First row contains column titles” treats row 1 as labels and begins numeric parsing at row 2.
- “First row is data” treats every row as numeric and creates display-only labels:
  - `X`, `Y1`, `Y2`, ... for `XYYYYY`.
  - `X1`, `Y1`, `X2`, `Y2`, ... for `XYXYXY`.
- The system never infers the header setting from cell contents.

## 4. Input UI

The existing Import Data section becomes a single expanded workflow in this order:

1. Data format selector: `XYYYYY` or `XYXYXY`. No format is preselected; the user must choose one.
2. First-row selector: titles or data; titles is the default.
3. Data source selector: file upload or Excel paste.
4. File control or paste textarea, depending on the selected source.
5. Ordered scan-rate list.
6. Point interval selector.
7. R² threshold input.
8. Parsed preview and curve mapping.
9. Confirm and analyze button.

The paste textarea accepts tab-, comma-, semicolon-, or consistently whitespace-delimited content copied from spreadsheets. It does not invoke runtime translation or send data to a server.

Changing the layout, header setting, source data, scan-rate list, point interval, or R² threshold immediately invalidates confirmed mappings and previous analysis results. The user must confirm and run the analysis again.

## 5. Scan-Rate List

Accepted separators are commas, semicolons, spaces, tabs, and newlines.

```text
0.2, 0.4, 0.6, 0.8, 1, 2, 5, 10
```

Validation rules:

- 3–20 values inclusive.
- Every value is finite and greater than zero.
- Values are locale-neutral ASCII decimals; a decimal comma is not interpreted as a number.
- Duplicate rates are rejected.
- The list length must exactly equal the detected current-series or XY-pair count.
- Mapping is positional and shown before analysis:
  - `XYYYYY`: current column → scan rate.
  - `XYXYXY`: potential/current pair → scan rate.

The analysis engine may sort a copy by numerical scan rate for regressions and charts, but the preview preserves the source-column order.

## 6. Point Interval

The control is labeled `Point interval / 取点间隔` and contains integers 1–30.

- `1` uses every point on the common potential grid.
- `5` retains indices 0, 5, 10, 15, and so on, displayed to users as the 1st, 6th, 11th, 16th points.
- The last common-grid point is always retained if the regular sequence does not include it.
- Subsampling occurs after the curves are restricted to their overlapping potential range and linearly interpolated to the common grid.
- The same retained grid drives both b-value and Dunn regressions.
- Original CV series remain unchanged and are plotted/exported at their original resolution.
- No moving average, Savitzky–Golay filter, interpolation smoothing, or current-value averaging is introduced.

The page explains that a larger interval reduces potential-axis regression density and computation time but may hide narrow potential-dependent features.

## 7. R² Threshold and Fit Status

The threshold control accepts values from 0 through 1, with a default of 0.95 and a UI step of 0.01.

- A threshold of 0 disables quality exclusion while still reporting R².
- The threshold is evaluated independently for each potential point after its regression is calculated.
- A fit is valid when R² is finite and greater than or equal to the threshold.
- Low-quality and failed fits remain present in the full result model.

Stable fit statuses:

- `valid`
- `belowRSquaredThreshold`
- `insufficientData`
- `zeroCurrentLogUnavailable`
- `regressionFailed`

The b-value and Dunn tables show potential, fitted values, R², point count, and localized status. Plots render only valid fits and preserve null gaps so lines never bridge an excluded interval.

## 8. Dunn Contribution Integration

- Dunn `k1` and `k2` coefficients below the R² threshold are excluded from contribution integration.
- Capacitive, diffusion-controlled, and total-current areas use the same valid-potential mask.
- Trapezoidal magnitude integration is performed separately for each contiguous valid segment; gaps are never bridged.
- A segment requires at least two valid potential points to contribute area.
- The result reports valid point count, sampled point count, excluded point count, and valid potential coverage percentage.
- If no segment can be integrated, the contribution for that scan rate is unavailable rather than reported as zero.

This preserves the current signed current decomposition while preventing a poor fit from silently entering the percentage calculation.

## 9. Results and Exports

An analysis-quality summary appears before the plots and tables:

- selected data layout and source;
- curve count and ordered scan rates;
- overlapping potential range;
- original common-grid point count;
- point interval and retained point count;
- R² threshold;
- valid, below-threshold, and unavailable fit counts;
- Dunn valid potential coverage.

Existing CSV, SVG, and PNG exports remain available. Relevant CSV schemas add stable fields for layout, point interval, R² threshold, fit status, and coverage. Low-quality or unavailable rows are retained with blank scientific outputs and an explicit status. Figure legends or adjacent export descriptions state the point interval and R² threshold. Scientific identifiers, formulas, numerical values, units, and element symbols are not translated.

## 10. Validation and Error Handling

New stable validation cases include:

- format not selected;
- odd XY column count;
- no current columns or no XY pairs;
- malformed numeric cells;
- fewer than 3 or more than 20 curves/rates;
- rate count does not match curve count;
- duplicate, zero, negative, non-finite, or locale-comma scan rate;
- point interval outside 1–30;
- R² threshold outside 0–1;
- fewer than two usable points in any individual series;
- no overlapping potential range;
- no valid fits after quality filtering.

All errors are displayed in an accessible bilingual live region. Parsing and analysis stay browser-local and retain the existing file, workbook, row, column, cell, and ZIP preflight resource limits.

## 11. State and Persistence

- The selected site language continues to persist through the existing `tmcc-language` localStorage key.
- Imported or pasted scientific data and analysis results remain in component memory and are not persisted to localStorage.
- A fresh page uses point interval 1, R² threshold 0.95, first-row-is-header, and no preselected data format.
- Language switching must not clear imported data, mappings, settings, or completed results.

## 12. Testing and Acceptance Criteria

Automated tests cover:

- `XYYYYY` and `XYXYXY` with and without headers;
- CSV, TXT, XLSX, and Excel paste paths;
- different potential ranges and lengths in XY pairs;
- positional rate mapping and all accepted list separators;
- the 3- and 20-rate boundaries plus too few, too many, mismatch, duplicate, and invalid values;
- point intervals 1, 5, and 30, including mandatory last-point retention;
- proof that original currents are not smoothed or mutated;
- thresholds 0, 0.95, and 1;
- low-R² table retention, plot gaps, and same-mask Dunn integration;
- bilingual help, validation, ARIA, status, summary, and export labels;
- EN → 中文 → EN switching without state or result loss;
- full CSV content and SVG/PNG metadata descriptions;
- regression tests for current file import, b-value, Dunn, calculators, homepage, routes, and static production entries.

Acceptance requires the full test suite, TypeScript check, data validation, production build, direct-route inspection, and live responsive browser verification to pass before deployment.
