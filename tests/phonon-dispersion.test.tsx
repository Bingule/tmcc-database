import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PhononDispersionViewer, parsePhononBandData } from "../src/components/PhononDispersionViewer";
import { materials } from "../src/data/materials";
import { withI18n } from "./i18n-test-utils";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

const band = {
  material_id: "TMCC-0001", unit: "THz", band_path: "G-M-K",
  segments: [
    { segment: 1, qpoints: [[0, 0, 0, 0, 0], [1, 0.5, 0.5, 0, 0]],
      branches: [{ branch: 1, frequencies: [-0.01, 1] }, { branch: 2, frequencies: [2, 3] }] },
    { segment: 2, qpoints: [[0, 0.5, 0.5, 0, 0], [1, 1, 0.333, 0.333, 0]],
      branches: [{ branch: 1, frequencies: [1, 1.5] }, { branch: 2, frequencies: [3, 4] }] }
  ]
};

it("validates the compact multi-branch band format and rejects a wrong material", () => {
  expect(parsePhononBandData(band, "TMCC-0001").segments).toHaveLength(2);
  expect(() => parsePhononBandData(band, "TMCC-0002")).toThrow(/material/i);
});

it("loads only the selected material and renders segmented curves with zoom and reset", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => band });
  vi.stubGlobal("fetch", fetchMock);
  const material = {
    ...materials[0], phonons: { ...materials[0].phonons, band_data: "/phonons/TMCC-0001.json" }
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(withI18n(<PhononDispersionViewer material={material} />));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe("/phonons/TMCC-0001.json");
  expect(container.querySelectorAll("svg polyline")).toHaveLength(4);
  expect(container.textContent).toContain("Γ");
  expect(container.textContent).toContain("M");
  expect(container.textContent).toContain("K");
  expect(container.textContent).toContain("THz");
  const svg = container.querySelector("svg")!;
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, width: 780, height: 320, right: 780, bottom: 320, x: 0, y: 0, toJSON: () => ({})
  });
  await act(async () => svg.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -100, clientX: 390 })));
  expect(container.querySelector(".plot-reset")).not.toBeNull();
  const capture = vi.fn();
  Object.defineProperty(svg, "setPointerCapture", { value: capture, configurable: true });
  await act(async () => container.querySelector(".plot-reset")?.dispatchEvent(
    new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 700 })
  ));
  expect(capture).not.toHaveBeenCalled();
  await act(async () => container.querySelector<SVGGElement>(".plot-reset")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(container.querySelector(".plot-reset")).toBeNull();
  await act(async () => root.unmount());
  container.remove();
});
