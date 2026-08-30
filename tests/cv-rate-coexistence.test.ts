import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "../src/locales/en";
import { normalizePathname } from "../src/lib/routes";

describe("CV and Rate Performance release integration", () => {
  it("ships the completed peak-resolved CV interface and Rate Performance together", () => {
    const translations = en as Record<string, string>;

    expect(translations["cv.b.mode.peak"]).toBe("Peak b-value");
    expect(existsSync(resolve("src/components/CvPeakAnalysisPanel.tsx"))).toBe(true);
    expect(normalizePathname("/tools/rate-performance")).toBe("ratePerformance");
    expect(existsSync(resolve("src/tools/rate-performance/pages/RatePerformanceAnalysisPage.tsx"))).toBe(true);
  });
});
