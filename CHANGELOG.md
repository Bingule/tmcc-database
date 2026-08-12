# Changelog

## 2026-08-12

- Migrated active material records from formula-derived IDs to permanent `TMCC-XXXX` accession IDs.
- Added separate human-readable `slug` values for URL/search use.
- Removed the active P/R stacking field from schema, data validation, Materials Explorer, Material Selector, and detail pages.
- Represented former P/R demo structures directly as `P-3m1` and `R-3m` crystallographic records.
- Merged the duplicate `Nb2S2C-P` / `Nb2S2C-Pbar3m1` demo entries into `TMCC-0001`, preserving the GPAW result.
- Added full periodic-table element search and C/N A-site support.
- Added local `tmcc.database` development support.
