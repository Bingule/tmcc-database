import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "../src/i18n/I18nProvider";
import {
  calculateTransportTimes,
  calculateUnresolvedTime,
  createTransportSensitivitySeries,
  getTransportInputDefinition,
  type TaggedTransportQuantity,
  type TransportTimeInput,
  type TransportInputKey,
  type TransportUnavailabilityReason,
  type TransportUnit,
} from "../src/tools/rate-performance/analysis/transportTimes";
import { transportUnavailabilityReasonText } from "../src/tools/rate-performance/components/transportTimePresentation";
import CharacteristicTimePage from "../src/tools/rate-performance/pages/CharacteristicTimePage";
import TransportLimitationPage from "../src/tools/rate-performance/pages/TransportLimitationPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

async function renderPage(
  page: React.ReactNode,
  language: "en" | "zh" = "en",
): Promise<{ view: HTMLDivElement; unmount: () => Promise<void> }> {
  localStorage.setItem("tmcc-language", language);
  const view = document.createElement("div");
  const root = createRoot(view);
  document.body.appendChild(view);
  await act(async () => root.render(<I18nProvider>{page}</I18nProvider>));
  return {
    view,
    unmount: async () => act(async () => root.unmount()),
  };
}

async function click(view: HTMLElement, label: string) {
  const button = [...view.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes(label));
  if (!button) throw new Error(`Button not found: ${label}`);
  await act(async () => button.click());
}

async function changeInput(target: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(target, value);
    target.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function changeSelect(target: HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(target, value);
    target.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function LanguageSwitchHarness({ children }: { children: React.ReactNode }) {
  const { setLanguage } = useI18n();
  return <>
    <button type="button" onClick={() => setLanguage("zh")}>Switch to Chinese</button>
    {children}
  </>;
}

const UNAVAILABILITY_REASONS: ReadonlyArray<TransportUnavailabilityReason> = [
  "missing-inputs",
  "invalid-inputs",
  "missing-and-invalid-inputs",
  "numerical-overflow",
  "numerical-underflow",
  "unavailable-terms",
  "no-available-terms",
];

function UnavailabilityReasonHarness() {
  const { t } = useI18n();
  return <ul>{UNAVAILABILITY_REASONS.map((reason) =>
    <li key={reason} data-reason={reason}>{transportUnavailabilityReasonText(reason, t)}</li>)}</ul>;
}

function quantity<Unit extends TransportUnit>(
  value: number,
  unit: Unit,
  type: TaggedTransportQuantity<Unit>["type"] = "measured",
  provenance = "Laboratory measurement",
): TaggedTransportQuantity<Unit> {
  return { value, unit, type, provenance };
}

function completeInput(): TransportTimeInput {
  return {
    electrodeThickness: quantity(100, "um"),
    separatorThickness: quantity(25, "um"),
    activeMaterialLength: quantity(3, "um"),
    effectiveVolumetricCapacitance: quantity(1000, "F-cm-3"),
    electrodeConductivity: quantity(100, "S-m-1"),
    bulkElectrolyteConductivity: quantity(0.5, "S-m-1"),
    electrodePorosity: quantity(0.5, "fraction"),
    separatorPorosity: quantity(0.4, "fraction"),
    bulkElectrolyteDiffusivity: quantity(3e-10, "m2-s-1"),
    activeMaterialDiffusivity: quantity(1e-14, "m2-s-1"),
    kineticTime: quantity(25, "s", "user-input", "Butler-Volmer estimate supplied by user"),
  };
}

function availableValue(input: TransportTimeInput, id: string): number {
  const term = calculateTransportTimes(input).terms.find((candidate) => candidate.id === id);
  expect(term?.status).toBe("available");
  if (!term || term.status !== "available") throw new Error(`Expected ${id} to be available.`);
  expect(term.unit).toBe("s");
  expect(term.provenance).toContain("Tian et al. (2019), Eq. 6a");
  return term.value;
}

describe("Tian Eq. 5a-6a transport times", () => {
  it("converts micrometres and F cm^-3 to SI for electrode electronic transport", () => {
    // (100e-6 m)^2 * (1000e6 F m^-3) / (2 * 100 S m^-1) = 0.05 s.
    expect(availableValue(completeInput(), "electrode-electronic")).toBeCloseTo(0.05, 12);
  });

  it("calculates pore ionic and separator ionic electrical terms with the published coefficients", () => {
    const input = completeInput();
    expect(availableValue(input, "pore-ionic-electrical")).toBeCloseTo(
      (100e-6) ** 2 * (1000e6) / (2 * 0.5 * 0.5 ** 1.5),
      12,
    );
    expect(availableValue(input, "separator-ionic-electrical")).toBeCloseTo(
      100e-6 * 25e-6 * (1000e6) / (0.5 * 0.4 ** 1.5),
      12,
    );
  });

  it("calculates pore, separator, and active-material diffusion terms dimensionally in seconds", () => {
    const input = completeInput();
    expect(availableValue(input, "pore-diffusion")).toBeCloseTo(
      (100e-6) ** 2 / (3e-10 * 0.5 ** 1.5),
      12,
    );
    expect(availableValue(input, "separator-diffusion")).toBeCloseTo(
      (25e-6) ** 2 / (3e-10 * 0.4 ** 1.5),
      12,
    );
    expect(availableValue(input, "active-material-diffusion")).toBeCloseTo(
      (3e-6) ** 2 / 1e-14,
      12,
    );
  });

  it("preserves kinetic time as a sourced input rather than deriving an unsupported coefficient", () => {
    const result = calculateTransportTimes(completeInput());
    const kinetic = result.terms.find(({ id }) => id === "kinetic");
    expect(kinetic).toMatchObject({
      status: "available",
      value: 25,
      unit: "s",
      type: "user-input",
      provenance: "Butler-Volmer estimate supplied by user; Tian et al. (2019), Eq. 6a term 7",
    });
  });

  it("reports each unavailable term and the exact inputs needed by that term", () => {
    const result = calculateTransportTimes({});
    expect(result.complete).toBe(false);
    expect(result.relativeContributions).toBeUndefined();
    expect(result.terms.every((term) => term.invalidInputs.length === 0)).toBe(true);
    expect(result.terms.map((term) => [term.id, term.status, term.missingInputs])).toEqual([
      ["electrode-electronic", "unavailable", ["electrodeThickness", "effectiveVolumetricCapacitance", "electrodeConductivity"]],
      ["pore-ionic-electrical", "unavailable", ["electrodeThickness", "effectiveVolumetricCapacitance", "bulkElectrolyteConductivity", "electrodePorosity"]],
      ["pore-diffusion", "unavailable", ["electrodeThickness", "bulkElectrolyteDiffusivity", "electrodePorosity"]],
      ["separator-ionic-electrical", "unavailable", ["electrodeThickness", "separatorThickness", "effectiveVolumetricCapacitance", "bulkElectrolyteConductivity", "separatorPorosity"]],
      ["separator-diffusion", "unavailable", ["separatorThickness", "bulkElectrolyteDiffusivity", "separatorPorosity"]],
      ["active-material-diffusion", "unavailable", ["activeMaterialLength", "activeMaterialDiffusivity"]],
      ["kinetic", "unavailable", ["kineticTime"]],
    ]);
  });

  it("treats nonpositive, nonfinite, and out-of-range porosity values as unusable inputs", () => {
    const input = completeInput();
    const result = calculateTransportTimes({
      ...input,
      electrodeConductivity: quantity(0, "S-m-1"),
      separatorPorosity: quantity(1.2, "fraction"),
      activeMaterialDiffusivity: quantity(Number.NaN, "m2-s-1"),
    });
    expect(result.invalidInputs).toEqual([
      { key: "electrodeConductivity", reason: "non-positive" },
      { key: "separatorPorosity", reason: "out-of-range" },
      { key: "activeMaterialDiffusivity", reason: "non-finite" },
    ]);
    expect(result.terms.find(({ id }) => id === "electrode-electronic")).toMatchObject({
      status: "unavailable",
      missingInputs: [],
      invalidInputs: [{ key: "electrodeConductivity", reason: "non-positive" }],
      unavailabilityReason: "invalid-inputs",
    });
    expect(result.terms.find(({ id }) => id === "separator-diffusion")).toMatchObject({
      missingInputs: [],
      invalidInputs: [{ key: "separatorPorosity", reason: "out-of-range" }],
    });
    expect(result.terms.find(({ id }) => id === "active-material-diffusion")).toMatchObject({
      missingInputs: [],
      invalidInputs: [{ key: "activeMaterialDiffusivity", reason: "non-finite" }],
    });
  });

  it("records SI-conversion overflow separately from missing inputs", () => {
    const result = calculateTransportTimes({
      ...completeInput(),
      effectiveVolumetricCapacitance: quantity(1e308, "F-cm-3"),
    });
    expect(result.invalidInputs).toContainEqual({
      key: "effectiveVolumetricCapacitance",
      reason: "numerical-overflow",
    });
    expect(result.terms.find(({ id }) => id === "electrode-electronic")).toMatchObject({
      status: "unavailable",
      missingInputs: [],
      invalidInputs: [{ key: "effectiveVolumetricCapacitance", reason: "numerical-overflow" }],
      unavailabilityReason: "invalid-inputs",
    });
  });

  it("never exposes nonfinite or underflowed term results as available", () => {
    const overflow = calculateTransportTimes({
      ...completeInput(),
      electrodeThickness: quantity(1e200, "m"),
      effectiveVolumetricCapacitance: quantity(1, "F-m-3"),
      electrodeConductivity: quantity(1, "S-m-1"),
    }).terms.find(({ id }) => id === "electrode-electronic");
    expect(overflow).toMatchObject({
      status: "unavailable",
      missingInputs: [],
      invalidInputs: [],
      unavailabilityReason: "numerical-overflow",
    });

    const underflow = calculateTransportTimes({
      ...completeInput(),
      activeMaterialLength: quantity(Number.MIN_VALUE, "m"),
      activeMaterialDiffusivity: quantity(1, "m2-s-1"),
    }).terms.find(({ id }) => id === "active-material-diffusion");
    expect(underflow).toMatchObject({
      status: "unavailable",
      missingInputs: [],
      invalidInputs: [],
      unavailabilityReason: "numerical-underflow",
    });
  });

  it("creates relative contributions only for a complete positive finite decomposition", () => {
    const complete = calculateTransportTimes(completeInput());
    expect(complete.complete).toBe(true);
    expect(complete.relativeContributions).toHaveLength(7);
    expect(complete.relativeContributions?.reduce((sum, item) => sum + item.percent, 0))
      .toBeCloseTo(100, 12);

    const incomplete = calculateTransportTimes({
      ...completeInput(),
      kineticTime: undefined,
    });
    expect(incomplete.relativeContributions).toBeUndefined();
  });

  it("withholds totals and percentages when finite component values overflow their sum", () => {
    const result = calculateTransportTimes({
      ...completeInput(),
      activeMaterialLength: quantity(1, "m"),
      activeMaterialDiffusivity: quantity(1e-308, "m2-s-1"),
      kineticTime: quantity(1e308, "s"),
    });
    expect(result.terms.every(({ status }) => status === "available")).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.aggregates.calculatedTotal).toMatchObject({
      status: "unavailable",
      unavailabilityReason: "numerical-overflow",
    });
    expect(result.relativeContributions).toBeUndefined();
  });

  it("provides a dedicated partial sum with included term IDs and partial-only provenance", () => {
    const result = calculateTransportTimes({
      kineticTime: quantity(25, "s", "user-input", "Kinetic estimate"),
    });
    expect(result.aggregates.availablePartialSum).toMatchObject({
      status: "available",
      value: 25,
      includedTermIds: ["kinetic"],
    });
    expect(result.aggregates.availablePartialSum.provenance).toContain("term 7");
    expect(result.aggregates.availablePartialSum.provenance).not.toContain("all seven");
    expect(result.aggregates.calculatedTotal.status).toBe("unavailable");
  });

  it("does not expose an available zero when no Eq. 6a term can be summed", () => {
    const result = calculateTransportTimes({});
    expect(result.availableSum).toBeUndefined();
    expect(result.aggregates.availablePartialSum).toMatchObject({
      status: "unavailable",
      unavailabilityReason: "no-available-terms",
      includedTermIds: [],
    });
    expect(result.aggregates.availablePartialSum).not.toHaveProperty("value");
  });
});

describe("unresolved fitted characteristic time", () => {
  it("returns a nonnegative unresolved contribution when the fitted total exceeds available components", () => {
    const components = calculateTransportTimes(completeInput()).terms;
    const sum = components.reduce((total, component) => total + (component.status === "available" ? component.value : 0), 0);
    const result = calculateUnresolvedTime(
      quantity(0.5, "h", "fitted", "Tian rate-model fit"),
      components,
    );
    expect(result).toMatchObject({
      status: "available",
      difference: 1800 - sum,
      unresolvedContribution: 1800 - sum,
      unit: "s",
      type: "derived",
      consistencyWarning: false,
    });
  });

  it("reports a negative difference only as a consistency warning, never as a physical contribution", () => {
    const result = calculateUnresolvedTime(
      quantity(0.1, "h", "fitted", "Tian rate-model fit"),
      calculateTransportTimes(completeInput()).terms,
    );
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Expected an available comparison.");
    expect(result.difference).toBeLessThan(0);
    expect(result.unresolvedContribution).toBeNull();
    expect(result.consistencyWarning).toBe(true);
    expect(result.warningCode).toBe("components-exceed-fitted-total");
    expect(result).not.toHaveProperty("percent");
  });

  it("is unavailable when no positive finite fitted time is supplied", () => {
    expect(calculateUnresolvedTime(undefined, calculateTransportTimes(completeInput()).terms)).toEqual({
      status: "unavailable",
      missingInputs: ["fittedTau"],
      invalidInputs: [],
      unavailabilityReason: "missing-inputs",
      unit: "s",
      type: "derived",
      provenance: "Difference between fitted tau and the sum of available Tian et al. (2019), Eq. 6a components.",
    });
  });

  it("uses no-available-terms consistently when an unresolved comparison has no components", () => {
    const result = calculateUnresolvedTime(
      quantity(1, "h", "user-input", "User comparison time"),
      calculateTransportTimes({}).terms,
    );
    expect(result).toMatchObject({
      status: "unavailable",
      missingInputs: [],
      invalidInputs: [],
      unavailabilityReason: "no-available-terms",
    });
    expect(result).not.toHaveProperty("availableComponentSum");
    expect(result).not.toHaveProperty("difference");
  });

  it("rejects fitted-time conversion and component-sum overflow with typed reasons", () => {
    expect(calculateUnresolvedTime(
      quantity(1e308, "h", "user-input", "User comparison time"),
      calculateTransportTimes(completeInput()).terms,
    )).toMatchObject({
      status: "unavailable",
      missingInputs: [],
      invalidInputs: [{ key: "fittedTau", reason: "numerical-overflow" }],
      unavailabilityReason: "invalid-inputs",
    });

    const overflowingComponents = calculateTransportTimes({
      ...completeInput(),
      activeMaterialLength: quantity(1, "m"),
      activeMaterialDiffusivity: quantity(1e-308, "m2-s-1"),
      kineticTime: quantity(1e308, "s"),
    }).terms;
    expect(calculateUnresolvedTime(
      quantity(1, "s", "user-input", "User comparison time"),
      overflowingComponents,
    )).toMatchObject({
      status: "unavailable",
      missingInputs: [],
      invalidInputs: [],
      unavailabilityReason: "numerical-overflow",
    });
  });
});

describe("deterministic one-at-a-time sensitivity", () => {
  it("publishes physical bounds and adapts a P_E=0.9 sweep to five valid deterministic points", () => {
    expect(getTransportInputDefinition("electrodePorosity").bounds).toEqual({
      exclusiveMinimum: 0,
      inclusiveMaximum: 1,
    });
    const input = { ...completeInput(), electrodePorosity: quantity(0.9, "fraction") };
    const series = createTransportSensitivitySeries(input, "electrodePorosity");
    expect(series.requestedRange).toEqual({ minimumFactor: 0.5, maximumFactor: 1.5, steps: 5 });
    expect(series.range.minimumFactor).toBe(0.5);
    expect(series.range.maximumFactor).toBeCloseTo(1 / 0.9, 12);
    expect(series.points).toHaveLength(5);
    expect(series.points.map(({ factor }) => factor)).toEqual([
      0.5,
      0.75,
      1,
      expect.closeTo((1 + 1 / 0.9) / 2, 12),
      expect.closeTo(1 / 0.9, 12),
    ]);
    expect(series.points[2]).toMatchObject({ factor: 1, inputValue: 0.9 });
    expect(series.points.slice(0, 2).every(({ factor }) => factor < 1)).toBe(true);
    expect(series.points.slice(3).every(({ factor }) => factor > 1)).toBe(true);
    expect(series.points.every((point) => point.status === "available" && Number.isFinite(point.totalSeconds))).toBe(true);
    expect(series.points.map(({ inputValue }) => inputValue).every((value) => value > 0 && value <= 1)).toBe(true);
  });

  it("discloses its baseline and range and changes only one input", () => {
    const input = completeInput();
    const series = createTransportSensitivitySeries(input, "electrodeThickness", {
      minimumFactor: 0.5,
      maximumFactor: 1.5,
      steps: 5,
    });
    expect(series.parameter).toBe("electrodeThickness");
    expect(series.baseline).toEqual(input.electrodeThickness);
    expect(series.range).toEqual({ minimumFactor: 0.5, maximumFactor: 1.5, steps: 5 });
    expect(series.method).toBe("deterministic-one-at-a-time");
    expect(series.points.map(({ factor }) => factor)).toEqual([0.5, 0.75, 1, 1.25, 1.5]);
    expect(series.points.map(({ inputValue }) => inputValue)).toEqual([50, 75, 100, 125, 150]);
    expect(series.points.every(({ variedInput }) =>
      variedInput.separatorThickness === input.separatorThickness
      && variedInput.electrodeConductivity === input.electrodeConductivity,
    )).toBe(true);
    expect(series.interpretation).toBe("No mechanism is inferred; each point changes only the selected input while all other inputs remain at baseline.");
  });

  it("requires the five-point OAT contract and a range spanning the 1x baseline", () => {
    expect(() => createTransportSensitivitySeries(completeInput(), "electrodeThickness", {
      minimumFactor: 0.5,
      maximumFactor: 1.5,
      steps: 3,
    })).toThrow(/exactly five/i);
    expect(() => createTransportSensitivitySeries(completeInput(), "electrodeThickness", {
      minimumFactor: 1,
      maximumFactor: 1.5,
      steps: 5,
    })).toThrow(/two valid points on each side/i);
  });

  it("retains the root term failure when an OAT point overflows", () => {
    const input = {
      ...completeInput(),
      activeMaterialLength: quantity(1e154, "m"),
      activeMaterialDiffusivity: quantity(1, "m2-s-1"),
    };
    const series = createTransportSensitivitySeries(input, "activeMaterialLength");
    expect(series.points[4]).toMatchObject({
      status: "unavailable",
      unavailableReason: "numerical-overflow",
      termFailures: [{
        termId: "active-material-diffusion",
        reason: "numerical-overflow",
        missingInputs: [],
        invalidInputs: [],
      }],
    });
  });

  it("does not mask aggregate numerical overflow as unavailable terms in an OAT point", () => {
    const input = {
      ...completeInput(),
      activeMaterialLength: quantity(1, "m"),
      activeMaterialDiffusivity: quantity(2e-308, "m2-s-1"),
      kineticTime: quantity(1.1e308, "s"),
    };
    const series = createTransportSensitivitySeries(input, "kineticTime");
    expect(series.points[3]).toMatchObject({
      status: "unavailable",
      unavailableReason: "numerical-overflow",
      termFailures: [],
    });
  });

  it.each<TransportInputKey>([
    "electrodeThickness",
    "separatorThickness",
    "activeMaterialLength",
    "effectiveVolumetricCapacitance",
    "electrodeConductivity",
    "bulkElectrolyteConductivity",
    "electrodePorosity",
    "separatorPorosity",
    "bulkElectrolyteDiffusivity",
    "activeMaterialDiffusivity",
    "kineticTime",
  ])("is reproducible for %s", (parameter) => {
    expect(createTransportSensitivitySeries(completeInput(), parameter))
      .toEqual(createTransportSensitivitySeries(completeInput(), parameter));
  });
});

describe("transport and characteristic-time pages", () => {
  it("maps every typed unavailability reason in English and Chinese", async () => {
    const english = await renderPage(<UnavailabilityReasonHarness />);
    expect(english.view.textContent).toContain("required inputs are missing");
    expect(english.view.textContent).toContain("supplied inputs are invalid");
    expect(english.view.textContent).toContain("required inputs are both missing and invalid");
    expect(english.view.textContent).toContain("numerical overflow");
    expect(english.view.textContent).toContain("numerical underflow to a nonpositive result");
    expect(english.view.textContent).toContain("one or more required terms are unavailable");
    expect(english.view.textContent).toContain("no Eq. 6a term is available");
    await english.unmount();

    const chinese = await renderPage(<UnavailabilityReasonHarness />, "zh");
    expect(chinese.view.textContent).toContain("缺少所需输入");
    expect(chinese.view.textContent).toContain("提供的输入无效");
    expect(chinese.view.textContent).toContain("所需输入同时存在缺失和无效值");
    expect(chinese.view.textContent).toContain("数值溢出");
    expect(chinese.view.textContent).toContain("数值下溢为非正结果");
    expect(chinese.view.textContent).toContain("一个或多个所需项不可用");
    expect(chinese.view.textContent).toContain("没有可用的方程 6a 项");
    await chinese.unmount();
  });

  it("renders typed aggregate, partial, and unresolved reasons without empty included-term provenance", async () => {
    const english = await renderPage(<TransportLimitationPage />);
    await click(english.view, "Calculate Times");
    expect(english.view.textContent).toContain("one or more required terms are unavailable");
    expect(english.view.textContent).toContain("no Eq. 6a term is available");
    expect(english.view.textContent).toContain("required inputs are missing");
    expect(english.view.textContent).not.toContain("Included Eq. 6a terms:");
    await english.unmount();

    const chinese = await renderPage(<TransportLimitationPage />, "zh");
    await click(chinese.view, "计算时间");
    expect(chinese.view.textContent).toContain("一个或多个所需项不可用");
    expect(chinese.view.textContent).toContain("没有可用的方程 6a 项");
    expect(chinese.view.textContent).toContain("缺少所需输入");
    expect(chinese.view.textContent).not.toContain("包含的方程 6a 项：");
    await chinese.unmount();
  });
  it("renders the transport empty state, tagged inputs, theory, and primary reference", async () => {
    const { view, unmount } = await renderPage(<TransportLimitationPage />);
    expect(view.querySelector("h1")?.textContent).toBe("Transport Limitations");
    expect(view.textContent).toContain("No transport calculation has been run");
    expect(view.textContent).toContain("User Input");
    expect(view.textContent).toContain("Value entered in this tool");
    expect(view.textContent).toContain("Tian Eq. 6a");
    expect(view.textContent).toContain("10.1038/s41467-019-09792-9");
    expect(view.textContent).toContain("effective, model-dependent estimates");
    await unmount();
  });

  it("loads the example and reports all seven terms, complete-only percentages, and OAT disclosure", async () => {
    const { view, unmount } = await renderPage(<TransportLimitationPage />);
    await click(view, "Try Example Inputs");
    expect(view.querySelectorAll("tbody tr[data-transport-term]")).toHaveLength(7);
    expect(view.textContent).toContain("Assumed");
    expect(view.textContent).toContain("Illustrative example; replace with measured values");
    expect(view.textContent).toContain("Relative contributions — complete model only");
    expect(view.textContent).toContain("Deterministic one-at-a-time sensitivity");
    expect(view.textContent).toContain("physically valid range");
    expect(view.textContent).toContain("50%–150%");
    expect(view.querySelector(".rate-transport-dynamic[aria-live='polite']")).not.toBeNull();
    expect(view.querySelector(".rate-transport-dynamic .rate-results-example")).not.toBeNull();
    expect(view.querySelector(".rate-transport-dynamic .rate-results-user")).toBeNull();
    expect(view.querySelector("svg")).not.toBeNull();
    await unmount();
  });

  it("marks the hard-coded comparison time as an assumed example", async () => {
    const { view, unmount } = await renderPage(<CharacteristicTimePage />);
    await click(view, "Try Example Inputs");
    const comparisonCard = [...view.querySelectorAll(".rate-result-card")]
      .find((card) => card.querySelector("dt")?.textContent === "Comparison total τ");
    expect(comparisonCard?.textContent).toContain("Assumed");
    expect(comparisonCard?.textContent).toContain("Illustrative example");
    expect(comparisonCard?.textContent).not.toContain("Fitted");
    await unmount();
  });

  it("does not render arbitrary percentages for an incomplete user calculation", async () => {
    const { view, unmount } = await renderPage(<TransportLimitationPage />);
    const electrodeThickness = view.querySelector<HTMLInputElement>('input[name="electrodeThickness"]');
    if (!electrodeThickness) throw new Error("Electrode thickness input not found.");
    await changeInput(electrodeThickness, "100");
    await click(view, "Calculate Times");
    expect(view.textContent).toContain("Unavailable — Missing");
    expect(view.textContent).not.toContain("Relative contributions — complete model only");
    expect(view.textContent).not.toMatch(/\d+(?:\.\d+)?%/);
    await unmount();
  });

  it("labels manual comparison time as user input", async () => {
    const { view, unmount } = await renderPage(<CharacteristicTimePage />);
    await changeInput(view.querySelector("input[name='fittedTau']") as HTMLInputElement, "0.5");
    await changeInput(view.querySelector("input[name='kineticTime']") as HTMLInputElement, "25");
    await click(view, "Calculate Times");
    const comparisonCard = [...view.querySelectorAll(".rate-result-card")]
      .find((card) => card.querySelector("dt")?.textContent === "Comparison total τ");
    expect(comparisonCard?.textContent).toContain("User Input");
    expect(comparisonCard?.textContent).toContain("Value entered in this tool");
    expect(comparisonCard?.textContent).not.toContain("Fitted");
    expect(view.querySelector(".rate-transport-dynamic .rate-results-user")).not.toBeNull();
    await unmount();
  });

  it("gives partial sums dedicated provenance with included term IDs", async () => {
    const { view, unmount } = await renderPage(<TransportLimitationPage />);
    await changeInput(view.querySelector("input[name='kineticTime']") as HTMLInputElement, "25");
    await click(view, "Calculate Times");
    const partialCard = [...view.querySelectorAll(".rate-result-card")]
      .find((card) => card.querySelector("dt")?.textContent === "Sum of available components");
    expect(partialCard?.textContent).toContain("Included Eq. 6a terms: 7");
    expect(partialCard?.textContent).not.toContain("all seven");
    await unmount();
  });

  it("distinguishes missing and invalid term inputs in the UI", async () => {
    const { view, unmount } = await renderPage(<TransportLimitationPage />);
    await changeInput(view.querySelector("input[name='electrodeConductivity']") as HTMLInputElement, "0");
    await click(view, "Calculate Times");
    const row = view.querySelector("[data-transport-term='electrode-electronic']");
    expect(row?.textContent).toContain("Missing:");
    expect(row?.textContent).toContain("Electrode thickness L_E");
    expect(row?.textContent).toContain("Invalid:");
    expect(row?.textContent).toContain("must be positive");
    await unmount();
  });

  it("adapts porosity sensitivity to five valid points and puts the selected unit on the x-axis", async () => {
    const { view, unmount } = await renderPage(<CharacteristicTimePage />);
    await click(view, "Try Example Inputs");
    await changeInput(view.querySelector("input[name='electrodePorosity']") as HTMLInputElement, "0.9");
    await click(view, "Calculate Times");
    const select = view.querySelector(".rate-transport-sensitivity select") as HTMLSelectElement;
    await changeSelect(select, "electrodePorosity");
    const sensitivity = view.querySelector(".rate-transport-sensitivity");
    expect(sensitivity?.textContent).toContain("50%–111.111%");
    expect(sensitivity?.textContent).toContain("5/5 valid points");
    expect(sensitivity?.textContent).toContain("Selected input value (1)");
    expect(sensitivity?.textContent).toContain("1× = 0.9 1");
    expect(sensitivity?.textContent).toContain("1.11111× = 1 1");
    expect(sensitivity?.textContent).not.toContain("50% to 150%");
    await unmount();
  });

  it("discloses the step and reason when a numerical OAT point is unavailable", async () => {
    const { view, unmount } = await renderPage(<CharacteristicTimePage />);
    await click(view, "Try Example Inputs");
    await changeInput(view.querySelector("input[name='activeMaterialLength']") as HTMLInputElement, "1000000");
    await changeInput(view.querySelector("input[name='activeMaterialDiffusivity']") as HTMLInputElement, "2e-308");
    await changeInput(view.querySelector("input[name='kineticTime']") as HTMLInputElement, "1.1e308");
    await click(view, "Calculate Times");
    await changeSelect(view.querySelector(".rate-transport-sensitivity select") as HTMLSelectElement, "kineticTime");
    const sensitivity = view.querySelector(".rate-transport-sensitivity");
    expect(sensitivity?.textContent).toContain("Unavailable sensitivity points");
    expect(sensitivity?.textContent).toContain("Step 4");
    expect(sensitivity?.textContent).toContain("numerical overflow");
    await unmount();
  });

  it("does not present a zero partial sum when no Eq. 6a component is available", async () => {
    const { view, unmount } = await renderPage(<TransportLimitationPage />);
    await click(view, "Calculate Times");
    expect(view.textContent).toContain("Sum of available componentsNot estimable");
    expect(view.textContent).not.toContain("Sum of available components0 s");
    await unmount();
  });

  it("shows only literature-defined characteristic aggregates and marks tau C/tau D unavailable", async () => {
    const { view, unmount } = await renderPage(<CharacteristicTimePage />);
    await click(view, "Try Example Inputs");
    expect(view.textContent).toContain("Comparison total τ");
    expect(view.textContent).not.toContain("Fitted total τ");
    expect(view.textContent).toContain("Electrical aggregate τ_Electrical");
    expect(view.textContent).toContain("Diffusive aggregate τ_Diffusive");
    expect(view.textContent).toContain("τ_C and τ_D: unavailable");
    expect(view.textContent).toContain("Tian et al. (2019) does not define these symbols in Eqs. 5a–6a");
    expect(view.textContent).not.toMatch(/τ_C\s*=\s*\d/);
    expect(view.textContent).not.toMatch(/τ_D\s*=\s*\d/);
    await unmount();
  });

  it("renders a negative fitted-minus-components difference only as a consistency warning", async () => {
    const { view, unmount } = await renderPage(<CharacteristicTimePage />);
    await click(view, "Try Example Inputs");
    const fittedTau = view.querySelector<HTMLInputElement>('input[name="fittedTau"]');
    if (!fittedTau) throw new Error("Fitted tau input not found.");
    await changeInput(fittedTau, "0.01");
    await click(view, "Calculate Times");
    expect(view.textContent).toContain("Consistency warning");
    expect(view.textContent).toContain("difference is negative");
    expect(view.textContent).not.toContain("Negative physical contribution");
    await unmount();
  });

  it("does not present a nonpositive fitted tau as a valid characteristic time", async () => {
    const { view, unmount } = await renderPage(<CharacteristicTimePage />);
    await click(view, "Try Example Inputs");
    const fittedTau = view.querySelector<HTMLInputElement>('input[name="fittedTau"]');
    if (!fittedTau) throw new Error("Fitted tau input not found.");
    await changeInput(fittedTau, "-1");
    await click(view, "Calculate Times");
    expect(view.textContent).toContain("Comparison total τNot estimable");
    expect(view.textContent).not.toContain("Comparison total τ-3600 s");
    await unmount();
  });

  it("shows the complete verified Eq. 6a form and marks relative and sensitivity outputs as derived", async () => {
    const { view, unmount } = await renderPage(<TransportLimitationPage />);
    expect(view.textContent).toContain("L_E^2 [C_V,eff / (2 sigma_E)");
    expect(view.textContent).toContain("Eq. 5a: τ = τ_Electrical + τ_Diffusive + t_c");
    expect(view.textContent).toContain("Eq. 5b: τ_Diffusive = L_E^2 / D_P + L_S^2 / D_S + L_AM^2 / D_AM");
    expect(view.textContent).toContain("Eq. 5c: τ_Electrical = C_eff (R_E,E + R_I,P + R_I,S)");
    expect(view.textContent).toContain("Eq. 5d: τ = C_eff (R_E,E + R_I,P + R_I,S)");
    expect(view.textContent).toContain("Eq. 6b: τ = a L_E^2 + b L_E + c");
    expect(view.textContent).toContain("a groups Eq. 6a terms 1–3");
    expect(view.textContent).toContain("b is term 4");
    expect(view.textContent).toContain("c groups terms 5–7");
    const theoryRows = [...view.querySelectorAll(".rate-theory-panel tbody tr")];
    expect(theoryRows.find((row) => row.textContent?.includes("Comparison total τ"))?.textContent).toContain("h");
    expect(theoryRows.find((row) => row.textContent?.includes("Calculated Eq. 6a total"))?.textContent).toContain("s");
    await click(view, "Try Example Inputs");
    const relative = view.querySelector(".rate-transport-relative");
    expect(relative?.textContent).toContain("Derived");
    expect(relative?.textContent).toContain("complete positive finite Eq. 6a decomposition");
    const sensitivity = view.querySelector(".rate-transport-sensitivity");
    expect(sensitivity?.textContent).toContain("Derived");
    expect(sensitivity?.textContent).toContain("one selected input changes");
    await unmount();
  });

  it("relocalizes cached example result provenance after an in-place language switch", async () => {
    const { view, unmount } = await renderPage(
      <LanguageSwitchHarness><CharacteristicTimePage /></LanguageSwitchHarness>,
    );
    await click(view, "Try Example Inputs");
    expect(view.querySelector(".rate-transport-dynamic")?.textContent).toContain("Illustrative example");
    await click(view, "Switch to Chinese");
    const dynamic = view.querySelector(".rate-transport-dynamic");
    expect(dynamic?.textContent).toContain("说明性示例");
    expect(dynamic?.textContent).not.toContain("Illustrative example");
    expect(dynamic?.textContent).not.toContain("Fitted with the validated Tian rate model");
    await unmount();
  });

  it("localizes both pages in Chinese", async () => {
    const transport = await renderPage(<TransportLimitationPage />, "zh");
    expect(transport.view.querySelector("h1")?.textContent).toBe("传输限制");
    expect(transport.view.textContent).toContain("试用示例输入");
    expect(transport.view.textContent).toContain("用户输入");
    await transport.unmount();

    const characteristic = await renderPage(<CharacteristicTimePage />, "zh");
    expect(characteristic.view.querySelector("h1")?.textContent).toBe("特征时间");
    expect(characteristic.view.textContent).toContain("τ_C 与 τ_D：不可用");
    expect(characteristic.view.textContent).toContain("有效且依赖模型的估计值");
    await click(characteristic.view, "试用示例输入");
    expect(characteristic.view.textContent).toContain("Tian 等（2019）方程 5c 与 6a 的电学项");
    expect(characteristic.view.textContent).toContain("对比 τ 与可用方程 6a 分量之和的差值");
    expect(characteristic.view.textContent).toContain("5 个步骤");
    expect(characteristic.view.textContent).toContain("P_E (1)");
    const theoryRows = [...characteristic.view.querySelectorAll(".rate-theory-panel tbody tr")];
    expect(theoryRows.find((row) => row.textContent?.includes("对比总时间 τ"))?.textContent).toContain("h");
    expect(theoryRows.find((row) => row.textContent?.includes("方程 6a 计算总时间"))?.textContent).toContain("s");
    expect(characteristic.view.textContent).not.toContain("拟合总时间 τ");
    expect(characteristic.view.textContent).not.toContain("在本分解之外使用经验证的 Tian 倍率模型拟合");
    expect(characteristic.view.textContent).not.toContain("steps.");
    expect(characteristic.view.textContent).not.toContain("dimensionless");
    expect(characteristic.view.textContent).not.toContain("Sum of all seven Tian et al.");
    expect(characteristic.view.textContent).not.toContain("Difference between fitted tau");
    await characteristic.unmount();
  });
});
