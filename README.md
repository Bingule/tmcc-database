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
  lib/             types, statuses, formatting, validation, statistics
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
