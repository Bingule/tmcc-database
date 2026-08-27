import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ScientificStackedBarChart,
  type ScientificStackedBarChartProps
} from "../src/components/ScientificStackedBarChart";
import { downloadSvg } from "../src/lib/toolExport";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderChart(props: ScientificStackedBarChartProps) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<ScientificStackedBarChart {...props} />));
  return container;
}

const baseProps: ScientificStackedBarChartProps = {
  title: "Contribution percentage by scan rate",
  xLabel: "Scan rate (mV/s)",
  yLabel: "%",
  emptyLabel: "No chart data",
  legendLabel: "Series legend",
  lowerLabel: "Capacitive contribution",
  upperLabel: "Diffusion-controlled contribution",
  lowerColor: "#e07a5f",
  upperColor: "#3d405b",
  data: [
    { id: "50", x: 50, lower: 75.95, upper: 24.05 },
    { id: "2", x: 2, lower: 4, upper: 96 },
    { id: "10", x: 10, lower: 55, upper: 45 }
  ],
  exportId: "cv-contribution-chart",
  metadata: ["XYXYXY · uploaded file", "R² >= 0.95"]
};

describe("ScientificStackedBarChart", () => {
  it("sorts scan rates and renders one normalized 100% stacked bar per rate", async () => {
    const view = await renderChart(baseProps);
    const bars = [...view.querySelectorAll<SVGGElement>("[data-stacked-bar]")];

    expect(bars.map((bar) => bar.getAttribute("data-x"))).toEqual(["2", "10", "50"]);
    expect(view.querySelectorAll('[data-bar-segment="capacitive"]')).toHaveLength(3);
    expect(view.querySelectorAll('[data-bar-segment="diffusion"]')).toHaveLength(3);
    for (const bar of bars) {
      const values = [...bar.querySelectorAll<SVGRectElement>("[data-segment-value]")]
        .map((segment) => Number(segment.dataset.segmentValue));
      expect(values).toHaveLength(2);
      expect(values[0]! + values[1]!).toBeCloseTo(100, 8);
    }
    expect(view.textContent).toContain("75.95%");
    expect(view.textContent).toContain("24.05%");
    expect(view.querySelector('[data-export-id="cv-contribution-chart"]')).not.toBeNull();
  });

  it("places small labels externally and ordinary labels inside with a leader", async () => {
    const view = await renderChart(baseProps);
    const smallLabel = view.querySelector('[data-bar-id="2"][data-segment="capacitive"]');
    const ordinaryLabel = view.querySelector('[data-bar-id="50"][data-segment="capacitive"]');

    expect(smallLabel?.getAttribute("data-label-placement")).toBe("external");
    expect(smallLabel?.textContent).toBe("4.00%");
    expect(view.querySelector('[data-label-leader-for="2-capacitive"]')).not.toBeNull();
    expect(ordinaryLabel?.getAttribute("data-label-placement")).toBe("inside");
  });

  it("provides localized accessible title, description, legend and fixed percentage ticks", async () => {
    const view = await renderChart({
      ...baseProps,
      title: "不同扫描速率下的贡献率",
      xLabel: "扫描速率 (mV/s)",
      lowerLabel: "电容贡献",
      upperLabel: "扩散控制贡献",
      legendLabel: "图例"
    });
    const svg = view.querySelector("svg")!;
    const title = svg.querySelector("title")!;

    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-labelledby")).toBe(title.id);
    expect(title.textContent).toBe("不同扫描速率下的贡献率");
    expect(svg.querySelector("desc")?.textContent).toContain("R² >= 0.95");
    expect(svg.querySelector('[data-chart-legend="true"]')?.getAttribute("aria-label")).toBe("图例");
    expect(view.textContent).toContain("电容贡献");
    expect(view.textContent).toContain("扩散控制贡献");
    expect([...svg.querySelectorAll('[data-y-tick]')].map((tick) => tick.getAttribute("data-y-tick")))
      .toEqual(["0", "25", "50", "75", "100"]);
    expect(view.textContent).toContain("扫描速率 (mV/s)");
  });

  it("uses a count-aware minimum width and a stable empty state", async () => {
    const populated = await renderChart(baseProps);
    const svg = populated.querySelector<SVGSVGElement>("svg")!;
    expect(svg.classList.contains("scientific-stacked-bar-chart-svg")).toBe(true);
    expect(svg.style.getPropertyValue("--scientific-stacked-bar-min-width")).toMatch(/px$/);

    const empty = await renderChart({ ...baseProps, data: [] });
    expect(empty.querySelector('[role="status"]')?.textContent).toBe("No chart data");
    expect(empty.querySelector("svg")).toBeNull();
  });

  it("grows its internal plot geometry so labels remain separated across twenty bars", async () => {
    const data = Array.from({ length: 20 }, (_, index) => ({
      id: String(index + 1),
      x: index + 1,
      lower: index % 2 === 0 ? 4 : 56.25,
      upper: index % 2 === 0 ? 96 : 43.75
    }));
    const view = await renderChart({ ...baseProps, data });
    const svg = view.querySelector("svg")!;
    const [, , viewBoxWidth] = svg.getAttribute("viewBox")!.split(/\s+/).map(Number);
    const bars = [...svg.querySelectorAll<SVGGElement>("[data-stacked-bar]")];

    expect(viewBoxWidth).toBeGreaterThanOrEqual(68 + 20 * 84 + 38);
    expect(Number.parseFloat(svg.style.getPropertyValue("--scientific-stacked-bar-min-width")))
      .toBeGreaterThanOrEqual(viewBoxWidth);
    expect(bars).toHaveLength(20);

    for (let index = 0; index < bars.length - 1; index += 1) {
      const currentBounds = [...bars[index]!.querySelectorAll<SVGTextElement>("[data-label-placement]")]
        .map(estimatedTextBounds);
      const nextBounds = [...bars[index + 1]!.querySelectorAll<SVGTextElement>("[data-label-placement]")]
        .map(estimatedTextBounds);
      const currentRight = Math.max(...currentBounds.map((bounds) => bounds.right));
      const nextLeft = Math.min(...nextBounds.map((bounds) => bounds.left));
      expect(nextLeft - currentRight).toBeGreaterThanOrEqual(4);

      const currentRect = bars[index]!.querySelector<SVGRectElement>('[data-bar-segment="capacitive"]')!;
      const nextRect = bars[index + 1]!.querySelector<SVGRectElement>('[data-bar-segment="capacitive"]')!;
      expect(Number(nextRect.getAttribute("x"))
        - (Number(currentRect.getAttribute("x")) + Number(currentRect.getAttribute("width"))))
        .toBeGreaterThan(0);
    }
  });

  it("serializes bars, value labels, accessibility text and metadata for SVG export", async () => {
    const view = await renderChart(baseProps);
    const svg = view.querySelector("svg")!;
    const blobs: Blob[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return "blob:stacked-chart"; }),
      revokeObjectURL: vi.fn()
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    downloadSvg(svg, "cv-contribution-chart.svg");

    const serialized = await readBlob(blobs[0]!);
    expect(serialized).toContain('data-export-id="cv-contribution-chart"');
    expect(serialized).toContain('data-stacked-bar="true"');
    expect(serialized).toContain('data-bar-segment="capacitive"');
    expect(serialized).toContain("75.95%");
    expect(serialized).toContain("Contribution percentage by scan rate");
    expect(serialized).toContain("R² &gt;= 0.95");
  });
});

function estimatedTextBounds(label: SVGTextElement): { left: number; right: number } {
  const x = Number(label.getAttribute("x"));
  const width = (label.textContent?.length ?? 0) * 6.3;
  return label.getAttribute("text-anchor") === "start"
    ? { left: x, right: x + width }
    : { left: x - width / 2, right: x + width / 2 };
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
