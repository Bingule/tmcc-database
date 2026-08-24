# Changelog

## Unreleased

- Added standalone Materials Research Tools routes for CV kinetics analysis, theoretical capacity, and molecular weight calculations.
- Added explicit English and Simplified Chinese interface resources, a shared `EN | 中文` navigation control, and persistent English-default language selection.
- Added browser-local wide-format CSV, TXT, and XLSX CV import with scan-rate confirmation, overlapping-range interpolation, b-value fitting, and Dunn contribution analysis.
- Added six localized CSV result downloads and SVG/PNG downloads for four scientific figures.
- Added shared chemical-formula, molar-mass, and theoretical-specific-capacity utilities with localized validation and scientific explanations.
- Added static direct-route build entries, responsive Tools layouts, accessibility markup, sitemap entries, and regression coverage without changing the deployed version number.
- Added `read-excel-file@9.3.10` as the only new direct production dependency for browser-side XLSX row extraction.

## 2026-08-12

- Migrated active material records from formula-derived IDs to permanent `TMCC-XXXX` accession IDs.
- Added separate human-readable `slug` values for URL/search use.
- Removed the active P/R stacking field from schema, data validation, Materials Explorer, Material Selector, and detail pages.
- Represented former P/R demo structures directly as `P-3m1` and `R-3m` crystallographic records.
- Merged the duplicate `Nb2S2C-P` / `Nb2S2C-Pbar3m1` demo entries into `TMCC-0001`, preserving the GPAW result.
- Added full periodic-table element search and C/N A-site support.
- Added local `tmcc.database` development support.
