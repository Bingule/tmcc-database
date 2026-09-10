import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import App from "../src/App";
import { I18nProvider } from "../src/i18n/I18nProvider";
import { normalizePathname } from "../src/lib/routes";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  history.replaceState(null, "", "/");
  localStorage.clear();
});

async function renderRoute(path: string) {
  history.replaceState(null, "", path);
  const view = document.createElement("div");
  document.body.appendChild(view);
  const root = createRoot(view);
  roots.push(root);
  await act(async () => {
    root.render(<I18nProvider><App /></I18nProvider>);
    if (path === "/tools") await import("../src/pages/ToolsPage");
    if (path === "/tools/rate-performance") {
      await import("../src/tools/rate-performance/pages/RatePerformanceAnalysisPage");
    }
  });
  return view;
}

const rateRoutes = [
  ["/tools/rate-performance", "ratePerformance", "Rate Performance Analysis"],
  ["/tools/rate-performance/model-comparison", "rateModelComparison", "Model Comparison"],
  ["/tools/rate-performance/transport-limitations", "rateTransportLimitations", "Transport Limitations"],
  ["/tools/rate-performance/characteristic-time", "rateCharacteristicTime", "Characteristic Time"],
  ["/tools/rate-performance/thickness-kinetics", "rateThicknessKinetics", "Thickness Kinetics"],
  ["/tools/rate-performance/ca-analysis", "rateCaAnalysis", "Chronoamperometry Analysis"],
  ["/tools/rate-performance/empirical-models", "rateEmpiricalModels", "Empirical Models"],
  ["/tools/rate-performance/energy-power", "rateEnergyPower", "Energy and Power"]
] as const;

describe("Rate Performance routes", () => {
  it.each(rateRoutes)("normalizes %s to %s", (pathname, route) => {
    expect(normalizePathname(pathname)).toBe(route);
  });

  it("renders the Rate Performance analysis page with its local navigation", async () => {
    const view = await renderRoute("/tools/rate-performance");

    expect(view.querySelector("h1")?.textContent).toBe("Rate Performance Analysis");
    expect(view.querySelector(".rate-performance-nav")).not.toBeNull();
    expect(view.querySelectorAll(".rate-performance-nav a")).toHaveLength(8);
    expect(view.querySelector('.rate-performance-nav a[aria-current="page"]')?.getAttribute("href"))
      .toBe("/tools/rate-performance");
    expect(view.querySelector('[role="status"]')?.textContent).toContain("Ready for analysis");
  });

  it("adds Rate Performance to the existing Tools cards", async () => {
    const view = await renderRoute("/tools");

    expect(view.querySelector('a[href="/tools/rate-performance"]')?.textContent)
      .toContain("Rate Performance");
  });
});
