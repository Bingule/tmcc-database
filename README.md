# TMCC Materials Database

Two-Dimensional Transition-Metal Carbon/Nitrogen Chalcogenides.

This repository is a static, data-driven prototype for pristine TMCCs and future transition-metal-intercalated TMCCs. The host formula is modeled as `M2X2A`, where `M` is a transition metal, `X` is S/Se/Te, and `A` is C or N. Scientific values that have not been supplied are stored as `null` and rendered as `Not calculated` or `Not available`.

## Local Development

```bash
pnpm install
pnpm dev
```

The clean local preview address is:

```text
http://tmcc.database/
```

It uses this hosts entry:

```text
127.0.0.1 tmcc.database
```

Because this no-port address uses port 80, start it from an elevated shell:

```bash
pnpm dev:tmcc
```

Build and verify:

```bash
pnpm validate:data
pnpm test
pnpm build
```

## Bilingual Interface And Routes

English is the default interface language. The compact `EN | 中文` control in the shared desktop and mobile navigation switches between English and Simplified Chinese without changing the URL. The selection is saved in `localStorage` under `tmcc-language`; a missing, invalid, or inaccessible value falls back to English. All translations are explicit project resources—no runtime machine translation is used.

The static application exposes these routes:

```text
/                                   TMCC Materials Database
/tools                              Materials Research Tools
/tools/cv-kinetics                  CV Kinetics Analysis
/tools/theoretical-capacity         Theoretical Capacity Calculator
/tools/molecular-weight             Molecular Weight Calculator
```

The production build creates a route-specific `index.html` for the root and each Tools route so direct visits and refreshes work on static hosting.

## Materials Research Tools

All tool inputs and calculations remain in the browser. CV files and formulas are not uploaded to a server.

### CV Kinetics Analysis

The CV workflow accepts browser-local `.csv`, `.txt`, and `.xlsx` uploads, plus Excel-compatible pasted text. Pasted data is parsed in this browser only and is never uploaded to a server. Text import accepts quote-aware comma, tab, and semicolon delimiters plus consistently structured whitespace-separated data.

Choose the data format explicitly before importing; the application never guesses it:

```text
XYYYYY: Potential | Current 1 | Current 2 | Current 3
XYXYXY: Potential 1 | Current 1 | Potential 2 | Current 2
```

`XYYYYY` uses one shared potential column followed by current columns. `XYXYXY` pairs each potential column with the following current column, so pairs may have independent ranges, spacings, and populated lengths. Choose whether row 1 contains headings or numeric data. In headerless mode, all rows are read as numbers and display-only column labels are generated; neither header mode nor layout is inferred from cell contents.

Enter one ordered list of 3–20 distinct positive scan rates in `mV/s`, separated by commas, semicolons, spaces, tabs, or newlines. The list maps positionally to current columns or XY pairs and must match their count. Series are interpolated only within their overlapping potential range; the workflow never extrapolates.

Each imported dataset is retained as one sequential CV cycle, with zero to two turning points. The workflow splits the cycle into monotonic sweep branches only internally for interpolation, fitting, point selection, and integration, then recombines the branches in the original traversal order. Forward and return currents recorded at the same potential remain distinct observations and are never averaged. More than two turning points, repeated non-turning potentials, too-short branches, or inconsistent branch directions between scan-rate series produce a visible cycle-structure error instead of a truncated or silently altered result.

The point interval is an integer from 1 to 30. It subsamples the common potential grid independently within every sweep branch for both b-value and Dunn analysis, always retaining each branch endpoint. It is not smoothing: the workflow never averages, filters, or mutates original CV potential/current values. A larger interval lowers regression density and can hide narrow potential-dependent features.

The shared R² threshold ranges from 0 to 1 in 0.01 UI steps and defaults to 0.95; `0` disables quality exclusion while still reporting R². The threshold applies independently to both b-value and Dunn regressions. Fits below it are excluded from fitted result tables, copied table data, b-value potential navigation, and b-value/Dunn fit-record CSV exports; unavailable fits remain reported. Internal workflow records retain every status so quality counts and the grid-aligned Dunn mask remain correct. Original CV data, interpolated data, and scientific formulas remain unchanged. Valid-only figures preserve gaps, and Dunn integration uses the same valid-potential mask, reporting valid/sample coverage rather than silently including excluded fits.

For b-value analysis, the fit is:

```text
log(|i|) = log(a) + b log(v)
```

Negative current is included by magnitude, while zero or non-finite current is excluded from a fit. At least three distinct positive scan rates are required at a potential.

For Dunn analysis, the linearized fit and signed reconstructed components are:

```text
i / sqrt(v) = k1 sqrt(v) + k2
i_cap = k1 v
i_diff = k2 sqrt(v)
```

Capacitive and diffusion-controlled percentages use trapezoidal integration of `|i_cap|` and `|i_diff|`, summing branch-local intervals with `|ΔE|`; no interval is created across a branch boundary. Thus anodic and cathodic signs do not cancel. Failed fits remain unavailable rather than being replaced with zero.

Completed analyses enable six CSV downloads:

```text
cv-interpolated-data.csv
cv-b-value-results.csv
cv-dunn-k1-k2.csv
cv-capacitive-current.csv
cv-diffusion-current.csv
cv-contribution-summary.csv
```

The six CSV exports include applicable layout, source, interval, R² threshold, fit-status, and Dunn-coverage metadata. They are, respectively, interpolated current data; b-value fit records; Dunn fit records; capacitive-current components; diffusion-current components; and the contribution summary. The b-value and Dunn fit-record exports omit only fits below the configured R² threshold; the interpolated-current export remains unchanged. All six exports, every b-value/Dunn fit and integration, and all four plots represent the complete recombined loop in traversal order rather than a first sweep. Original CV series are retained independently and are not changed by point-interval analysis sampling, but are used only in the page and internal workflow: they do not create a seventh original-data CSV export. Chart rendering may use the display-only sampling described below for performance; that never changes the retained original series, fitting/integration inputs, or CSV data. Four figures—b-value, selected-potential fit, Dunn current components, and contribution percentage—can each be exported as SVG or PNG. Figures and their SVG/PNG exports identify the analysis settings and use deterministic display sampling with a target of at most 2,000 points per series; preserving unavailable-gap boundaries may increase display output to at most 4,000 points per series. Tables and charts use horizontally scrollable wide containers and responsive one-column layouts on narrow screens.

### Theoretical Capacity Calculator

The calculator uses a manually supplied positive electron-transfer number `n` and the molar mass `M` derived from the entered formula:

```text
Q = nF / (3.6M)
F = 96485 C mol−1
```

`F` is the Faraday constant (displayed as `96485 C mol−1`; calculations use `96485.33212 C mol−1`), `M` is molar mass in `g mol−1`, and `n` is the manually supplied electron-transfer number. The calculator displays the normalized formula, the substituted equation, and the resulting theoretical specific capacity in `mAh g−1`. Version 1 does not infer valence, oxidation state, insertion stoichiometry, or electron count.

### Molecular Weight Calculator

The shared formula engine supports element symbols, positive integer or decimal stoichiometric counts, and nested parentheses. It reports the formula, total molar mass, and a bilingual element-contribution table with per-element count, atomic weight, mass contribution, and mass percentage. Scientific identifiers, formulas, numerical values, element symbols, and units remain unchanged when the interface language changes.

### Current Limitations

- Hydrate/adduct dot notation such as `CuSO4·5H2O` or `CuSO4•5H2O` is not supported. An ASCII period between digits is interpreted as a decimal stoichiometric count, not a hydrate separator.
- Scan-rate lists use dot-decimal notation. Locale-comma or multiply punctuated values such as `1,5` or `1..5` are not valid rates and must be corrected before analysis.
- Legacy `.xls` files are not supported. For `.xlsx`, sheets are examined in workbook order and the first sheet satisfying the selected layout/header contract is used; earlier empty, descriptive, or invalid sheets are skipped.
- CV smoothing, extrapolation, automatic format detection, automatic electron-count inference, and XLSX result export are outside version 1.

`read-excel-file@9.3.10` is the sole new direct production dependency. It is loaded only with the lazily split CV route and is used only to extract XLSX worksheet rows; parsing validation, scan-rate confirmation, interpolation, fitting, calculations, charts, localization, and exports remain project code. The homepage and other Tools routes are separate route chunks.

## Repository Layout

```text
data/
  materials/       JSON material records
  calculations/    reserved for extracted calculation payloads
  experiments/     reserved for experimental payloads
  schema/          schema and status definitions
public/
  structures/      CIF and POSCAR files
  figures/         band, DOS, phonon, ELF, AIMD, microscopy figures
scripts/
  validate-data.js data validation CLI
src/
  components/      UI components
  data/            typed imports for static JSON records
  i18n/            lightweight language provider and persistence
  lib/             types, statuses, formatting, validation, statistics
  locales/         explicit English and Simplified Chinese resources
  pages/           homepage and standalone Tools route pages
  styles/          global CSS
```

## Material Identity

Database identity is a permanent accession number:

```text
material_id: TMCC-0001
```

The ID is never reused and does not encode formula, structure, composition, intercalation state, concentration, or configuration. Human-readable URLs/search handles use a separate slug:

```text
slug: nb2s2c-p-3m1
```

Scientific references should cite the permanent `TMCC-XXXX` accession, not the slug.

## Scientific Structure Model

Do not use P/R labels as a separate scientific category. Structures are distinguished directly by crystallography:

```json
{
  "material_id": "TMCC-0001",
  "slug": "nb2s2c-p-3m1",
  "formula": "Nb2S2C",
  "structure": {
    "space_group_symbol": "P-3m1",
    "space_group_number": 164,
    "crystal_system": "trigonal"
  }
}
```

The hierarchy is:

```text
Composition -> Crystal Structure -> Properties
```

Multiple records may share a formula when they are distinct structures, for example `Nb2S2C / P-3m1` and `Nb2S2C / R-3m`.

## Adding A New Pristine TMCC

Create the next permanent accession file under `data/materials/`, for example `TMCC-0009.json`.

```json
{
  "material_id": "TMCC-0009",
  "slug": "mo2te2c-p-3m1",
  "family": "TMCC",
  "material_type": "pristine",
  "formula": "Mo2Te2C",
  "host": {
    "formula": "Mo2Te2C",
    "metal": "Mo",
    "chalcogen": "Te",
    "anion": "C"
  },
  "intercalation": null,
  "experimental_status": null,
  "calculation_status": "not_calculated",
  "structure": {
    "space_group_symbol": "P-3m1",
    "space_group_number": 164,
    "crystal_system": "trigonal"
  },
  "thermodynamics": {},
  "phonons": {},
  "mechanical": {},
  "electronic": {},
  "energy_storage": {},
  "files": {
    "cif": null,
    "poscar": null
  },
  "provenance": {}
}
```

Then import it in `src/data/materials.ts` and run:

```bash
pnpm validate:data
```

## Adding A TM-Intercalated TMCC

Create a distinct record with `material_type: "tm_intercalated"` and explicit intercalation metadata. Different intercalants such as Fe or Cu, concentrations, sites, and configurations are separate structural entries when accepted.

```json
{
  "material_id": "TMCC-0010",
  "slug": "fe0-25-nb2s2c-p-3m1-config01",
  "family": "TMCC",
  "material_type": "tm_intercalated",
  "formula": "Fe0.25Nb2S2C",
  "host": {
    "formula": "Nb2S2C",
    "metal": "Nb",
    "chalcogen": "S",
    "anion": "C"
  },
  "intercalation": {
    "intercalant": "Fe",
    "x": 0.25,
    "mode": "hetero",
    "site": null,
    "ordering": null,
    "configuration": "config01"
  },
  "experimental_status": null,
  "calculation_status": "not_calculated",
  "structure": {
    "space_group_symbol": null,
    "space_group_number": null,
    "crystal_system": null
  },
  "thermodynamics": {},
  "phonons": {},
  "mechanical": {},
  "electronic": {},
  "energy_storage": {},
  "files": {
    "cif": null,
    "poscar": null
  },
  "provenance": {}
}
```

Use `mode: "self"` when the intercalant equals the host metal, and `mode: "hetero"` when it differs.

## Adding CIF Or POSCAR Files

Place files under `public/structures/`, for example:

```text
public/structures/TMCC-0001/structure.cif
public/structures/TMCC-0001/POSCAR
```

Reference them from the record:

```json
"files": {
  "cif": "/structures/TMCC-0001/structure.cif",
  "poscar": "/structures/TMCC-0001/POSCAR"
}
```

## Validation

Run:

```bash
pnpm validate:data
```

The validator checks accession IDs, slugs, transition-metal symbols, chalcogens, A-site elements (`C` or `N`), material type, statuses, duplicate IDs/slugs, intercalation metadata, obsolete structure labels, and file paths.

## Deployment

The project builds to a static `dist/` folder:

```bash
pnpm build
```

Deploy `dist/` to GitHub Pages, Netlify, Vercel, Cloudflare Pages, or any static host.

## Scientific Disclaimer

Computationally predicted materials have not necessarily been experimentally synthesized. Stability classifications depend on the computational methodology and should not be interpreted as guarantees of experimental synthesizability.

Experimental values and calculated values must remain separate and should not overwrite each other.
