# TMCC Database Design

## Goal

Build the first working version of the TMCC Materials Database as a static, data-driven scientific website for two-dimensional transition-metal carbon/nitrogen chalcogenides.

## Architecture

The project uses React, TypeScript, Vite, and JSON data files. Scientific records live under `data/`, frontend code imports them through typed data modules, and validation runs before build or deployment. The first version is static and suitable for GitHub Pages, Netlify, Vercel static output, or later migration to an API-backed database.

## Data Model

Each material record has a stable `id` distinct from the displayed formula. The host formula is `M2X2A`, where `A` is stored explicitly as `C` or `N`. Pristine records use `formula-stacking`, such as `Nb2S2C-P` or `Nb2S2N-P`. TM-intercalated records use `intercalantX-hostFormula-hostStacking-configuration`, such as `V0.25-Nb2S2C-P-config01`. Records store host composition, material type, stacking, intercalation metadata, scientific property groups, files, and provenance separately.

Missing scientific values are stored as `null`. The UI renders null scientific values as `Not calculated` and unavailable files as `Not available`.

## Interface

The homepage contains an academic header, computed database statistics, a material selector, a periodic table selector for host transition metals, a searchable Materials Explorer, and a material detail view. TM-intercalated records, structure comparison, electronic properties, phonons, energy storage, and experimental data have explicit sections or placeholders without invented values.

## Validation

The validation layer checks required identifiers, valid elements, material type, statuses, duplicate IDs, intercalation requirements, numeric fields, unit-bearing values, and referenced files when provided.

## Constraints

Do not fabricate lattice parameters, energies, space groups, stability, electronic, magnetic, phonon, or bond-length values. Keep experimental and computational fields independent. Keep statuses centrally defined. Render formulas with subscripts for users while preserving raw formulas internally.
