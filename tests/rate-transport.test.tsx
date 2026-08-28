import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../src/i18n/I18nProvider";
import {
  calculateTransportTimes,
  calculateUnresolvedTime,
  createTransportSensitivitySeries,
  type TaggedTransportQuantity,
  type TransportTimeInput,
  type TransportInputKey,
  type TransportUnit,
} from "../src/tools/rate-performance/analysis/transportTimes";
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
      "electrodeConductivity",
      "separatorPorosity",
      "activeMaterialDiffusivity",
    ]);
    expect(result.terms.find(({ id }) => id === "electrode-electronic")?.missingInputs)
      .toContain("electrodeConductivity");
    expect(result.terms.find(({ id }) => id === "separator-diffusion")?.missingInputs)
      .toContain("separatorPorosity");
    expect(result.terms.find(({ id }) => id === "active-material-diffusion")?.missingInputs)
      .toContain("activeMaterialDiffusivity");
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
    expect(result.aggregates.calculatedTotal.status).toBe("unavailable");
    expect(result.relativeContributions).toBeUndefined();
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
    expect(calculateUnresolvedTime(undefined, calculateTransportTimes({}).terms)).toEqual({
      status: "unavailable",
      missingInputs: ["fittedTau"],
      unit: "s",
      type: "derived",
      provenance: "Difference between fitted tau and the sum of available Tian et al. (2019), Eq. 6a components.",
    });
  });
});

describe("deterministic one-at-a-time sensitivity", () => {
  it("discloses its baseline and range and changes only one input", () => {
    const input = completeInput();
    const series = createTransportSensitivitySeries(input, "electrodeThickness", {
      minimumFactor: 0.5,
      maximumFactor: 1.5,
      steps: 3,
    });
    expect(series.parameter).toBe("electrodeThickness");
    expect(series.baseline).toEqual(input.electrodeThickness);
    expect(series.range).toEqual({ minimumFactor: 0.5, maximumFactor: 1.5, steps: 3 });
    expect(series.method).toBe("deterministic-one-at-a-time");
    expect(series.points.map(({ factor }) => factor)).toEqual([0.5, 1, 1.5]);
    expect(series.points.map(({ inputValue }) => inputValue)).toEqual([50, 100, 150]);
    expect(series.points.every(({ variedInput }) =>
      variedInput.separatorThickness === input.separatorThickness
      && variedInput.electrodeConductivity === input.electrodeConductivity,
    )).toBe(true);
    expect(series.interpretation).toBe("No mechanism is inferred; each point changes only the selected input while all other inputs remain at baseline.");
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
    expect(view.textContent).toContain("50% to 150% of the disclosed baseline");
    expect(view.querySelector("svg")).not.toBeNull();
    await unmount();
  });

  it("does not render arbitrary percentages for an incomplete user calculation", async () => {
    const { view, unmount } = await renderPage(<TransportLimitationPage />);
    const electrodeThickness = view.querySelector<HTMLInputElement>('input[name="electrodeThickness"]');
    if (!electrodeThickness) throw new Error("Electrode thickness input not found.");
    await changeInput(electrodeThickness, "100");
    await click(view, "Calculate Times");
    expect(view.textContent).toContain("Unavailable — missing");
    expect(view.textContent).not.toContain("Relative contributions — complete model only");
    expect(view.textContent).not.toMatch(/\d+(?:\.\d+)?%/);
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
    expect(view.textContent).toContain("Fitted total τ");
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
    expect(view.textContent).toContain("Fitted total τNot estimable");
    expect(view.textContent).not.toContain("Fitted total τ-3600 s");
    await unmount();
  });

  it("shows the complete verified Eq. 6a form and marks relative and sensitivity outputs as derived", async () => {
    const { view, unmount } = await renderPage(<TransportLimitationPage />);
    expect(view.textContent).toContain("L_E^2 [C_V,eff / (2 sigma_E)");
    await click(view, "Try Example Inputs");
    const relative = view.querySelector(".rate-transport-relative");
    expect(relative?.textContent).toContain("Derived");
    expect(relative?.textContent).toContain("complete positive finite Eq. 6a decomposition");
    const sensitivity = view.querySelector(".rate-transport-sensitivity");
    expect(sensitivity?.textContent).toContain("Derived");
    expect(sensitivity?.textContent).toContain("one selected input changes");
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
    expect(characteristic.view.textContent).toContain("拟合 τ 与可用方程 6a 分量之和的差值");
    expect(characteristic.view.textContent).toContain("5 个步骤");
    expect(characteristic.view.textContent).toContain("P_E (1)");
    expect(characteristic.view.textContent).toContain("h / s");
    expect(characteristic.view.textContent).not.toContain("steps.");
    expect(characteristic.view.textContent).not.toContain("dimensionless");
    expect(characteristic.view.textContent).not.toContain("Sum of all seven Tian et al.");
    expect(characteristic.view.textContent).not.toContain("Difference between fitted tau");
    await characteristic.unmount();
  });
});
