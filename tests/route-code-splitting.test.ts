import { readFile } from "node:fs/promises";
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
  });
});
