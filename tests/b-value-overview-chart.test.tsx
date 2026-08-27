import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BValueOverviewChart } from "../src/components/BValueOverviewChart";
import type { BValuePoint, CvFitRecord, CvFitStatus } from "../src/lib/cvTypes";

const containers: HTMLDivElement[] = [];

function makeRecord(sequenceIndex: number, branchIndex: number, potential: number, b: number | null, status: CvFitStatus): CvFitRecord<BValuePoint> {
  return {
    sequenceIndex,
    branchIndex,
    potential,
    status,
    fit: b === null ? null : {
      potential,
      b,
      intercept: 0.1,
      rSquared: status === "belowRSquaredThreshold" ? 0.8 : 0.99,
      pointCount: 5,
      fitPoints: [],
      minimumCurrentMagnitude: 0.1,
      currentStabilityFloor: 1e-6,
      currentStabilityRatio: 0.1
    }
  };
}

afterEach(() => {
  containers.splice(0).forEach((container) => container.remove());
});

describe("BValueOverviewChart", () => {
  it("separates branches, references, quality markers, and selection", async () => {
    const onSelect = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    const records = [
      makeRecord(0, 0, -1, 0.6, "valid"),
      makeRecord(1, 0, 0, 1.2, "valid"),
      makeRecord(2, 0, 1, 0.8, "belowRSquaredThreshold"),
      makeRecord(3, 1, 1, 0.7, "valid"),
      makeRecord(4, 1, 0, 0.9, "nearZeroCurrentUnstable"),
      makeRecord(5, 1, -1, null, "regressionFailed")
    ];

    await act(async () => root.render(<BValueOverviewChart
      records={records}
      selectedSequenceIndex={3}
      onSelectSequenceIndex={onSelect}
      title="b value vs potential"
      xLabel="Potential (V)"
      yLabel="b value"
      legendLabel="Legend"
      forwardLabel="Forward sweep"
      reverseLabel="Reverse sweep"
      validLabel="Conventional range"
      outsideLabel="Outside conventional range"
      excludedLabel="Excluded by R²"
      unstableLabel="Unavailable / unstable"
      diffusionLabel="Diffusion-controlled"
      capacitiveLabel="Surface/capacitive-controlled"
      exportId="cv-b-chart"
    />));

    expect(container.querySelectorAll('[data-b-branch-path="forward"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-b-branch-path="reverse"]')).toHaveLength(1);
    expect(container.querySelector('[data-b-reference="0.5"]')).not.toBeNull();
    expect(container.querySelector('[data-b-reference="1"]')).not.toBeNull();
    expect(container.querySelector('[data-b-quality="outside"]')).not.toBeNull();
    expect(container.querySelector('[data-b-quality="excluded"]')).not.toBeNull();
    expect(container.querySelector('[data-b-quality="unstable"]')).not.toBeNull();
    expect(container.querySelector('[data-selected-point-id="3"]')).not.toBeNull();
    expect(container.querySelector('svg[data-export-id="cv-b-chart"]')).not.toBeNull();

    const selectable = container.querySelector<SVGElement>('[data-b-sequence-index="1"]')!;
    await act(async () => selectable.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith(1);
    await act(async () => root.unmount());
  });
});
