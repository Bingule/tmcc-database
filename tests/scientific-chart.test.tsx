import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScientificLineChart } from "../src/components/ScientificLineChart";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
});

async function renderChart(props: React.ComponentProps<typeof ScientificLineChart>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<ScientificLineChart {...props} />));
  return container;
}

const baseProps = {
  title: "CV kinetics",
  xLabel: "Potential (V)",
  yLabel: "Current (A)",
  emptyLabel: "No chart data",
  legendLabel: "Series legend",
  series: [
    { id: "measured", label: "Measured", color: "#1155cc", points: [{ x: 0, y: 1 }, { x: 1, y: 3 }] },
    { id: "fit", label: "Fit", color: "#cc3311", dash: "6 4", points: [{ x: 0, y: 1.5 }, { x: 1, y: 2.5 }] }
  ]
};

describe("ScientificLineChart", () => {
  it("renders an accessible responsive chart with labeled multi-series line styles", async () => {
    const view = await renderChart({ ...baseProps, exportId: "b-value-chart" });
    const svg = view.querySelector("svg");

    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("viewBox")).toMatch(/^0 0 \d+ \d+$/);
    expect(svg?.getAttribute("width")).toBe("100%");
    expect(svg?.getAttribute("data-export-id")).toBe("b-value-chart");
    expect(svg?.querySelector("title")?.textContent).toBe("CV kinetics");
    expect(view.textContent).toContain("Potential (V)");
    expect(view.textContent).toContain("Current (A)");
    expect(view.textContent).toContain("Measured");
    expect(view.textContent).toContain("Fit");
    expect(svg?.querySelector('path[data-series-id="fit"]')?.getAttribute("stroke-dasharray")).toBe("6 4");
    expect(svg?.querySelector('[data-chart-legend="true"]')?.getAttribute("aria-label")).toBe("Series legend");
    expect(svg?.querySelector('[data-chart-legend="true"]')?.textContent).toContain("Measured");
    expect(svg?.querySelector('[data-chart-legend="true"]')?.textContent).toContain("Fit");
    expect(svg?.querySelector('.scientific-chart-axes > line')?.getAttribute("stroke")).toBeTruthy();
    expect(svg?.querySelector('.scientific-chart-grid > line')?.getAttribute("stroke")).toBeTruthy();
    expect(svg?.querySelector('.scientific-chart-axes text')?.getAttribute("fill")).toBeTruthy();
    expect(view.querySelector('.scientific-chart-legend:not([data-chart-legend="true"])')).toBeNull();
  });

  it("shows a stable empty state when no finite points exist", async () => {
    const view = await renderChart({
      ...baseProps,
      series: [{ id: "empty", label: "Empty", color: "#000", points: [{ x: Number.NaN, y: 1 }] }]
    });

    expect(view.querySelector('[role="status"]')?.textContent).toBe("No chart data");
    expect(view.querySelector("svg")).toBeNull();
  });

  it("keeps paths and ticks finite for ordinary, maximum, and mixed non-finite values", async () => {
    for (const points of [
      [{ x: 4, y: 9 }, { x: 4, y: 9 }],
      [{ x: Number.MAX_VALUE, y: Number.MAX_VALUE }],
      [{ x: Number.NEGATIVE_INFINITY, y: 1 }, { x: 0, y: 0 }, { x: Number.NaN, y: 2 }]
    ]) {
      const view = await renderChart({
        ...baseProps,
        series: [{ id: "extreme", label: "Extreme", color: "#000", points }]
      });
      const svgMarkup = view.querySelector("svg")?.outerHTML ?? "";
      expect(svgMarkup).not.toMatch(/(?:NaN|Infinity)/);
    }
  });

  it("computes a domain for more than 150,000 finite points without argument spreading", async () => {
    const points = Array.from({ length: 150_001 }, (_, index) => ({ x: index, y: index % 17 }));
    const view = await renderChart({
      ...baseProps,
      series: [{ id: "large", label: "Large", color: "#000", points }]
    });

    expect(view.querySelector('path[data-series-id="large"]')?.getAttribute("d")).not.toMatch(/(?:NaN|Infinity)/);
  });

  it("selects a data point with the mouse and marks the selected x value", async () => {
    const onSelectX = vi.fn();
    const view = await renderChart({ ...baseProps, selectedX: 1, onSelectX });
    const target = view.querySelector<SVGCircleElement>('circle[data-point-x="0"]');

    await act(async () => target?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(onSelectX).toHaveBeenCalledWith(0);
    expect(view.querySelector('circle[data-selected-x="1"]')).not.toBeNull();
  });

  it("selects repeated coordinates by stable point identity with distinct accessible labels", async () => {
    const onSelectPointId = vi.fn();
    const view = await renderChart({
      ...baseProps,
      selectedPointId: "return-1",
      onSelectPointId,
      series: [{
        id: "loop",
        label: "b value",
        color: "#1155cc",
        points: [
          { id: "forward-1", x: 1, y: 0.5, accessibilityLabel: "b value: Potential 1 V, Branch 1" },
          { id: "return-1", x: 1, y: 0.5, accessibilityLabel: "b value: Potential 1 V, Branch 2" }
        ]
      }]
    });
    const forward = view.querySelector<SVGCircleElement>('circle[data-point-id="forward-1"]')!;
    const returned = view.querySelector<SVGCircleElement>('circle[data-point-id="return-1"]')!;

    expect(forward.getAttribute("aria-label")).toContain("Branch 1");
    expect(returned.getAttribute("aria-label")).toContain("Branch 2");
    expect(returned.getAttribute("aria-label")).not.toBe(forward.getAttribute("aria-label"));
    expect(view.querySelector('circle[data-selected-point-id="return-1"]')).not.toBeNull();
    await act(async () => returned.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => returned.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onSelectPointId).toHaveBeenNthCalledWith(1, "return-1");
    expect(onSelectPointId).toHaveBeenNthCalledWith(2, "return-1");
  });

  it("marks keyboard-selectable SVG points with the focus-visible styling hook", async () => {
    const view = await renderChart({ ...baseProps, onSelectX: vi.fn() });
    const target = view.querySelector<SVGCircleElement>('circle[role="button"]');

    expect(target?.classList.contains("scientific-chart-point")).toBe(true);
    expect(target?.getAttribute("tabindex")).toBe("0");
  });

  it("renders observed point series without a misleading connecting line", async () => {
    const view = await renderChart({
      ...baseProps,
      series: [{ id: "observed", label: "Observed", color: "#123456", mode: "points", points: [{ x: 2, y: 3 }, { x: 1, y: 2 }] }]
    });

    expect(view.querySelector('path[data-series-id="observed"]')).toBeNull();
    expect(view.querySelectorAll('[data-point-series-id="observed"]')).toHaveLength(2);
  });

  it("breaks a line path at null values instead of connecting across unavailable data", async () => {
    const view = await renderChart({
      ...baseProps,
      series: [{ id: "gapped", label: "Gapped", color: "#123456", points: [{ x: 0, y: 1 }, { x: 1, y: null }, { x: 2, y: 3 }] }]
    });
    const path = view.querySelector('path[data-series-id="gapped"]')?.getAttribute("d") ?? "";
    expect(path.match(/\bM\b/g)).toHaveLength(2);
  });

  it("does not substitute the nearest rendered point for an exact unavailable selection", async () => {
    const view = await renderChart({
      ...baseProps,
      selectedX: 1,
      series: [{
        id: "gapped",
        label: "Gapped",
        color: "#123456",
        points: [{ x: 0, y: 1 }, { x: 1, y: null }, { x: 2, y: 3 }]
      }]
    });

    expect(view.querySelector('[data-selected-x="1"]')).toBeNull();
  });

  it("renders export settings as visible SVG text", async () => {
    const view = await renderChart({
      ...baseProps,
      metadata: "XYYYYY · File upload · interval = 5 · R² ≥ 0.95"
    });

    const metadata = view.querySelector('[data-chart-metadata="true"]');
    expect(metadata?.textContent).toBe("XYYYYY · File upload · interval = 5 · R² ≥ 0.95");
  });

  it("wraps a 20-rate metadata line within the viewBox", async () => {
    const rates = Array.from({ length: 20 }, (_, index) => `0.${String(index + 1).padStart(15, "0")}`);
    const view = await renderChart({
      ...baseProps,
      metadata: `rates = ${rates.join(", ")} mV/s · interval = 30 · R² ≥ 0.987654321`
    });

    const lines = [...view.querySelectorAll<SVGTextElement>('[data-chart-metadata="true"] text')];
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => (line.textContent?.length ?? 0) <= 60)).toBe(true);
    expect(lines.every((line) => Number(line.getAttribute("x")) + 60 * 11 <= 800 - 24)).toBe(true);
  });

  it("exposes all settings and the current figure selection through an SVG description", async () => {
    const metadata = [
      "XYYYYY · File upload · First row contains headers",
      "rates = 0.123456789, 0.987654321 mV/s · interval = 5 · R² ≥ 0.876543219",
      "potential = 0.123456789 V"
    ];
    const view = await renderChart({ ...baseProps, metadata });
    const svg = view.querySelector("svg")!;
    const descriptionId = svg.getAttribute("aria-describedby");
    const description = svg.querySelector("desc");

    expect(descriptionId).toBeTruthy();
    expect(description?.id).toBe(descriptionId);
    expect(description?.textContent).toBe(metadata.join(". "));
  });
});
