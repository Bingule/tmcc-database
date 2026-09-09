# Explicit Manual Peak Branch Design

## Scope

Change only the manual **Add peak** interaction in CV peak-based b-value analysis. Automatic peak detection, regression formulas, peak limits, charts, exports, and existing point-adjustment behavior remain unchanged.

## Interaction

- Clicking **Add peak** reveals two compact actions: **Add oxidation peak** and **Add reduction peak**.
- Selecting oxidation creates one manual peak family on the forward sweep.
- Selecting reduction creates one manual peak family on the reverse sweep.
- The family starts from the strongest unoccupied original local extremum on the currently selected scan rate and the requested branch; matching points at other scan rates continue to use the existing manual-family matching logic.
- The new family becomes selected so its points can be adjusted with the existing controls.
- If the requested branch has no available original extremum, the existing visible snap error is shown and no data changes.
- The chooser closes after success, when Add peak is pressed again, when a peak is removed, or when analysis is invalidated.

## Localization and layout

Add stable English and Simplified Chinese resources for the two branch actions. Reuse the existing compact button layout and responsive wrapping.

## Acceptance checks

- A result containing only an oxidation peak can manually add a reduction family.
- A result containing only a reduction peak can manually add an oxidation family.
- Existing peak families and scientific calculations remain unchanged.
- English and Chinese labels render from centralized locale resources.
