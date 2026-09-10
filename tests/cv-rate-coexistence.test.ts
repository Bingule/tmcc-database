import { describe, expect, it } from "vitest";
import { en } from "../src/locales/en";
import { normalizePathname } from "../src/lib/routes";

const completedToolModules = import.meta.glob([
  "../src/components/CvPeakAnalysisPanel.tsx",
  "../src/tools/rate-performance/pages/RatePerformanceAnalysisPage.tsx"
]);

describe("CV and Rate Performance release integration", () => {
  it("ships the completed peak-resolved CV interface and Rate Performance together", () => {
    const translations = en as Record<string, string>;

    expect(translations["cv.b.mode.peak"]).toBe("Peak b-value");
    expect(completedToolModules["../src/components/CvPeakAnalysisPanel.tsx"]).toBeTypeOf("function");
    expect(normalizePathname("/tools/rate-performance")).toBe("ratePerformance");
    expect(completedToolModules["../src/tools/rate-performance/pages/RatePerformanceAnalysisPage.tsx"]).toBeTypeOf("function");
  });
});
