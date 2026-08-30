import { useState } from "react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { useI18n } from "../../../i18n/I18nProvider";
import {
  calculateSummaryEnergyPower,
  integrateDischargeCurve,
  toRagonePoints,
  type EnergyPowerResult,
  type SummaryEnergyPowerInput,
} from "../analysis/energyPower";
import { EnergyCurveInput, createEnergyCurveDraft, type EnergyCurveDraft } from "../components/EnergyCurveInput";
import { EnergyPowerResults } from "../components/EnergyPowerResults";
import { EnergySummaryInput, createEnergySummaryDraft, type EnergySummaryDraft } from "../components/EnergySummaryInput";
import { EnergyTheorySection } from "../components/EnergyTheorySection";
import { RatePerformanceNav } from "../components/RatePerformanceNav";
import { ResultCards } from "../components/ResultCards";
import { ENERGY_POWER_EXAMPLE } from "../data/energyExamples";
import {
  serializeEnergyCurvesCsv,
  serializeEnergyOriginalCsv,
  serializeEnergyResultsCsv,
  serializeRagoneCsv,
} from "../utils/energyExports";
import { validateEnergyCurvePoints } from "../utils/energyCurveValidation";

export default function EnergyPowerPage() {
  const { t } = useI18n();
  const [workflow, setWorkflow] = useState<"summary" | "curve">("summary");
  const [samples, setSamples] = useState<EnergySummaryDraft[]>([createEnergySummaryDraft()]);
  const [curves, setCurves] = useState<EnergyCurveDraft[]>([createEnergyCurveDraft()]);
  const [results, setResults] = useState<EnergyPowerResult[] | null>(null);
  const [source, setSource] = useState<"example" | "user">("user");

  function invalidate() { setResults(null); setSource("user"); }
  function changeSamples(next: EnergySummaryDraft[]) { setSamples(next); invalidate(); }
  function changeCurves(next: EnergyCurveDraft[]) { setCurves(next); invalidate(); }
  function changeWorkflow(next: "summary" | "curve") { setWorkflow(next); setResults(null); setSource("user"); }
  function loadExample() {
    setWorkflow("summary"); setSource("example"); setResults(null);
    setSamples(ENERGY_POWER_EXAMPLE.samples.map((sample) => ({
      id: sample.id, sampleName: sample.sampleName, capacity: sample.specificCapacity,
      capacityUnit: sample.capacityUnit, averageVoltage: sample.averageVoltage,
      dischargeTime: sample.dischargeTimeHours, dischargeTimeUnit: "h",
      basis: sample.normalizationBasis, massG: null, volumeCm3: null,
    })));
  }
  function calculateSummary() { setResults(samples.map(toSummaryInput).map(calculateSummaryEnergyPower)); }
  const curveDisplayName = (curve: Readonly<EnergyCurveDraft>, index: number) => curve.sampleName || t("rate.energy.curve.datasetNumber", { number: index + 1 });
  function integrateCurves() { setResults(curves.map((curve, index) => integrateCurve(curve, curveDisplayName(curve, index)))); }

  const metadata = { resultKind: source, exampleId: source === "example" ? ENERGY_POWER_EXAMPLE.id : null } as const;
  const ragone = toRagonePoints(results ?? []);
  const originalCsv = workflow === "summary"
    ? serializeEnergyOriginalCsv(samples.map(toSummaryInput), metadata)
    : serializeEnergyCurvesCsv(curves.map((curve, index) => ({
      points: curve.points.map((point) => ({ id: point.id, x: point.x, voltage: point.voltage, current: point.current })),
      context: curveExportContext(curve, curveDisplayName(curve, index), results?.[index]?.status === "success"),
    })), metadata);

  return <section className="tools-page energy-power-page">
    <Breadcrumbs current={t("rate.energyPower.title")} /><h1>{t("rate.energyPower.title")}</h1><p className="tool-lede">{t("rate.energy.subtitle")}</p>
    <RatePerformanceNav currentPath="/tools/rate-performance/energy-power" />
    <section className="tool-section"><h2>{t("rate.energy.input.title")}</h2><div className="rate-input-mode" role="group" aria-label={t("rate.energy.input.workflow")}>
      <button type="button" aria-pressed={workflow === "summary"} onClick={() => changeWorkflow("summary")}>{t("rate.energy.input.summary")}</button>
      <button type="button" aria-pressed={workflow === "curve"} onClick={() => changeWorkflow("curve")}>{t("rate.energy.input.curves")}</button>
    </div></section>
    {workflow === "summary" ? <EnergySummaryInput samples={samples} onChange={changeSamples} onLoadExample={loadExample} /> : <EnergyCurveInput values={curves} onChange={changeCurves} />}
    <section className="tool-section energy-run-panel"><button type="button" onClick={workflow === "summary" ? calculateSummary : integrateCurves}>{t(workflow === "summary" ? "rate.energy.action.calculate" : "rate.energy.action.integrate")}</button></section>
    {results ? <EnergyPowerResults results={results} sampleIds={workflow === "summary" ? samples.map((sample) => sample.sampleName || sample.id) : curves.map(curveDisplayName)} ragone={ragone} kind={source} csv={{ original: originalCsv, results: serializeEnergyResultsCsv(results, metadata, workflow === "summary" ? samples.map((sample) => sample.sampleName || sample.id) : curves.map(curveDisplayName)), ragone: serializeRagoneCsv(ragone, metadata) }} /> : <EnergyEmptyState onLoadExample={loadExample} />}
    <EnergyTheorySection />
  </section>;
}

function integrateCurve(curve: Readonly<EnergyCurveDraft>, sampleId: string): EnergyPowerResult {
  const active = curve.points.filter((point) => point.x !== null || point.voltage !== null || point.current !== null);
  const validation = validateEnergyCurvePoints(curve.points, curve.mode, curve.currentSign);
  if (!validation.canIntegrate) {
    const invalid = validation.points.filter((point) => point.reason !== "blank-row" && point.reason !== "dataset-validation-failed");
    const code = active.length < 2 ? "insufficient-points"
      : invalid.some((point) => point.reason === "duplicate-axis") ? "duplicate-axis"
        : invalid.some((point) => point.reason === "non-monotonic-axis") ? "non-monotonic-axis" : "invalid-input";
    return { status: "failure", code, pointIds: invalid.map((point) => point.id) };
  }
  if (curve.mode === "capacity") return integrateDischargeCurve(active.map((point) => ({ id: point.id, capacity: point.x ?? Number.NaN, voltage: point.voltage ?? Number.NaN })), { mode: "capacity", capacityUnit: curve.xUnit as "mAh-g-1" | "Ah-kg-1" | "mAh", normalizationBasis: curve.basis, sampleId, massG: curve.massG ?? undefined, volumeCm3: curve.volumeCm3 ?? undefined, dischargeTimeHours: curve.dischargeTimeHours ?? undefined });
  const sign = curve.currentSign === "negative" ? -1 : 1;
  return integrateDischargeCurve(active.map((point) => ({ id: point.id, time: point.x ?? Number.NaN, voltage: point.voltage ?? Number.NaN, current: (point.current ?? Number.NaN) * sign })), { mode: "time", timeUnit: curve.xUnit as "s" | "min" | "h", currentUnit: curve.currentUnit, normalizationBasis: curve.basis, sampleId, massG: curve.massG ?? undefined, volumeCm3: curve.volumeCm3 ?? undefined });
}
function curveExportContext(curve: Readonly<EnergyCurveDraft>, sampleName: string, integrationSucceeded: boolean) { return { sampleId: curve.id, sampleName, mode: curve.mode, xUnit: curve.xUnit, currentUnit: curve.mode === "time" ? curve.currentUnit : null, currentSign: curve.currentSign, basis: curve.basis, massG: curve.massG, volumeCm3: curve.volumeCm3, dischargeTimeHours: curve.dischargeTimeHours, integrationMethod: curve.mode === "capacity" ? "trapezoidal-v-dq" as const : "trapezoidal-v-i-dt" as const, integrationSucceeded, source: curve.source }; }

function EnergyEmptyState({ onLoadExample }: { onLoadExample: () => void }) {
  const { t } = useI18n();
  return <section className="energy-empty-grid">
    <section className="tool-section"><h2>{t("rate.energy.empty.example")}</h2><p>{t("rate.energy.empty.exampleText")}</p><button type="button" onClick={onLoadExample}>{t("rate.energy.input.loadExample")}</button></section>
    <section className="tool-section"><h2>{t("rate.energy.empty.outputs")}</h2><ul><li>Wh kg^-1 / W kg^-1</li><li>{t("rate.energy.empty.volumetric")}</li><li>{t("rate.energy.empty.ragone")}</li></ul></section>
    <section className="tool-section"><h2>{t("rate.energy.empty.preview")}</h2><ResultCards kind="example" items={[{ id: "energy-preview", label: t("rate.energy.result.energy"), value: "≈ 936", unit: "Wh kg^-1", type: "derived" }, { id: "power-preview", label: t("rate.energy.result.power"), value: "≈ 187", unit: "W kg^-1", type: "derived" }]} /></section>
    <section className="tool-section"><h2>{t("rate.energy.empty.explanation")}</h2><p>{t("rate.energy.empty.explanationText")}</p><p className="rate-equation">E = ∫ V dQ</p></section>
  </section>;
}

function toSummaryInput(sample: Readonly<EnergySummaryDraft>): SummaryEnergyPowerInput {
  return {
    sampleId: sample.sampleName || sample.id, specificCapacity: sample.capacity ?? Number.NaN,
    capacityUnit: sample.capacityUnit, averageVoltage: sample.averageVoltage ?? Number.NaN,
    dischargeTime: sample.dischargeTime ?? Number.NaN, dischargeTimeUnit: sample.dischargeTimeUnit,
    normalizationBasis: sample.basis, massG: sample.massG ?? undefined, volumeCm3: sample.volumeCm3 ?? undefined,
  };
}
