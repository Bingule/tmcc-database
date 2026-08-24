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

The CV workflow accepts `.csv`, `.txt`, and `.xlsx` files in wide layout: one potential column and at least two current columns, with one current series per scan rate. Text import supports quote-aware comma, tab, and semicolon delimiters plus consistently structured whitespace-separated data. Scan rates are inferred from common headings such as `1`, `2 mV/s`, and `Current 5 mV s-1`, then remain editable for confirmation. Series are interpolated only within their overlapping potential range; the workflow never extrapolates.

For b-value analysis, the fit is:

```text
log(|i|) = log(a) + b log(v)
```

Negative current is included by magnitude, while zero or non-finite current is excluded from a fit. At least two distinct positive scan rates are required at a potential.

For Dunn analysis, the linearized fit and signed reconstructed components are:

```text
i / sqrt(v) = k1 sqrt(v) + k2
i_cap = k1 v
i_diff = k2 sqrt(v)
```

Capacitive and diffusion-controlled percentages use trapezoidal integration of `|i_cap|` and `|i_diff|`, so anodic and cathodic signs do not cancel. Failed fits remain unavailable rather than being replaced with zero.

Valid combined results enable six CSV downloads:

```text
cv-interpolated-data.csv
cv-b-value-results.csv
cv-dunn-k1-k2.csv
cv-capacitive-current.csv
cv-diffusion-current.csv
cv-contribution-summary.csv
```

Four figures—b-value, selected-potential fit, Dunn current components, and contribution percentage—can each be exported as SVG or PNG. Figures and their SVG/PNG exports use deterministic display sampling (normally at most 2,000 points per series) to keep browser rendering bounded; every scientific fit, integration, numeric result, and CSV export continues to use the complete accepted dataset. Tables and charts use horizontally scrollable wide containers and responsive one-column layouts on narrow screens.

### Theoretical Capacity Calculator

The calculator uses a manually supplied positive electron-transfer number `n` and the molar mass `M` derived from the entered formula:

```text
Q = nF / (3.6M)
F = 96485.33212 C/mol
```

`M` is in g/mol and `Q` is reported in mAh/g. Version 1 does not infer valence, oxidation state, insertion stoichiometry, or electron count.

### Molecular Weight Calculator

The shared formula engine supports element symbols, positive integer or decimal stoichiometric counts, and nested parentheses. It reports total molar mass plus per-element count, atomic weight, mass contribution, and mass percentage. Scientific identifiers, formulas, numerical values, element symbols, and units remain unchanged when the interface language changes.

### Current Limitations

- Hydrate/adduct dot notation such as `CuSO4·5H2O` or `CuSO4•5H2O` is not supported. An ASCII period between digits is interpreted as a decimal stoichiometric count, not a hydrate separator.
- Scan-rate headers use dot-decimal notation. Locale-comma or multiply punctuated values such as `1,5 mV/s` or `1..5 mV/s` are not inferred and must be corrected in the confirmation fields.
- Legacy `.xls` files are not supported. For `.xlsx`, sheets are examined in workbook order and the first sheet containing a usable wide CV table is used; earlier empty, descriptive, or invalid sheets are skipped.
- CV smoothing, extrapolation, paste-from-Excel, XLSX result export, and automatic electron-count inference are outside version 1.

`read-excel-file@9.3.10` is the sole new direct production dependency. It is used only to extract XLSX worksheet rows; parsing validation, scan-rate confirmation, interpolation, fitting, calculations, charts, localization, and exports remain project code.

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
