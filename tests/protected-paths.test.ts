// @vitest-environment node

import { describe, expect, it } from "vitest";
import { findProtectedPaths } from "../scripts/check-protected-paths.mjs";

describe("protected scientific and data path audit", () => {
  it("finds CV, Rate Performance, dataset, database, and import paths", () => {
    expect(findProtectedPaths([
      "src/pages/CvKineticsPage.tsx",
      "src/components/CvImportPanel.tsx",
      "src/lib/cvAnalysis.ts",
      "src/tools/rate-performance/models/registry.ts",
      "src/data/materials.ts",
      "scripts/validate-data.js",
      "scripts/import-website-bundles.mjs",
      "src/components/ToolFeedbackPanel.tsx"
    ])).toEqual([
      "src/pages/CvKineticsPage.tsx",
      "src/components/CvImportPanel.tsx",
      "src/lib/cvAnalysis.ts",
      "src/tools/rate-performance/models/registry.ts",
      "src/data/materials.ts",
      "scripts/validate-data.js",
      "scripts/import-website-bundles.mjs"
    ]);
  });

  it("normalizes Windows separators without matching test prose", () => {
    expect(findProtectedPaths([
      "src\\tools\\rate-performance\\analysis\\energyPower.ts",
      "tests/tools-markup.test.tsx",
      "docs/superpowers/plans/reviewer-two.md"
    ])).toEqual(["src/tools/rate-performance/analysis/energyPower.ts"]);
  });
});
