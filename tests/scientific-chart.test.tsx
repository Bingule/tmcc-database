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
});
