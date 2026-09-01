import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("route code splitting", () => {
  it("keeps the homepage static while lazily importing every Tools route", async () => {
    const source = await readFile("src/App.tsx", "utf8");

    expect(source).toMatch(/import\s+\{\s*HomePage\s*\}\s+from\s+"\.\/pages\/HomePage"/);
    for (const page of [
      "ToolsPage",
      "CvKineticsPage",
      "TheoreticalCapacityPage",
      "MolecularWeightPage",
      "NotFoundPage"
    ]) {
      expect(source).toContain(`lazy(() => import("./pages/${page}"))`);
      expect(source).not.toMatch(new RegExp(`import\\s+\\{[^}]*${page}[^}]*\\}\\s+from`));
    }

    for (const page of [
      "RatePerformanceAnalysisPage",
      "ModelComparisonPage",
      "TransportLimitationPage",
      "CharacteristicTimePage",
      "ThicknessKineticsPage",
      "CaRateAnalysisPage",
      "EmpiricalModelsPage",
      "EnergyPowerPage"
    ]) {
      expect(source).toContain(`lazy(() => import("./tools/rate-performance/pages/${page}"))`);
      expect(source).not.toMatch(new RegExp(`import\\s+\\{[^}]*${page}[^}]*\\}\\s+from`));
    }
  });

  it("keeps KaTeX inside the lazy Rate Performance module boundary", async () => {
    const files = await sourceFiles("src");
    const katexImports: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (/from\s+["']katex["']|katex\/dist/.test(source)) katexImports.push(file.replaceAll("\\", "/"));
    }

    expect(katexImports).toEqual([
      "src/tools/rate-performance/components/ScientificTypography.tsx",
    ]);
  });
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat().sort();
}
