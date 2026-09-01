import { useEffect, useRef, useState } from "react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { useI18n } from "../../../i18n/I18nProvider";
import { fitRatePerformance, MAX_SYNC_RATE_FIT_POINTS, type RateFitResult } from "../analysis/fitRatePerformance";
import { INITIAL_CA_FIT_ATTEMPT, type CaFitAttempt } from "../analysis/caFitAttempt";
import { reconstructCaRate, type CaReconstructionFailure, type CaReconstructionSuccess } from "../analysis/reconstructCaRate";
import { CaAnalysisResults } from "../components/CaAnalysisResults";
import { CaDataInput, completeCaPoints, createInitialCaPoints, validateCaDraftPoints, type CaDraftPoint, type CaInputMode } from "../components/CaDataInput";
import { CaProcessingControls, DEFAULT_CA_PROCESSING, toCaOptions, type CaProcessingValue } from "../components/CaProcessingControls";
import { CaRawExport } from "../components/CaRawExport";
import { FitStatus } from "../components/FitStatus";
import { ModelTheoryPanel, type RateTheoryContent } from "../components/ModelTheoryPanel";
import { RatePerformanceNav } from "../components/RatePerformanceNav";
import { RateChartPanel } from "../components/RateChartPanel";
import { ReferenceList } from "../components/ReferenceList";
import { ResultCards } from "../components/ResultCards";
import { CA_RATE_EXAMPLE } from "../data/caExamples";
import { getRateReference } from "../references/rateReferences";
import { getRateModel } from "../models/registry";
import { translatedRegistryText } from "../utils/rateModelPresentation";
import { RATE_DISPLAY_EQUATIONS } from "../models/displayEquations";
import { ScientificSymbol } from "../components/ScientificTypography";

type CompletedFit = Extract<RateFitResult, { status: "converged" }>;

export default function CaRateAnalysisPage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<CaInputMode>("manual");
  const [points, setPoints] = useState<CaDraftPoint[]>(createInitialCaPoints);
  const [processing, setProcessing] = useState<CaProcessingValue>(DEFAULT_CA_PROCESSING);
  const [source, setSource] = useState<"example" | "user">("user");
  const [reconstruction, setReconstruction] = useState<CaReconstructionSuccess | null>(null);
  const [fatalFailure, setFatalFailure] = useState<{ result: CaReconstructionFailure; points: CaDraftPoint[] } | null>(null);
  const [fit, setFit] = useState<CompletedFit | null>(null);
  const [fitAttempt, setFitAttempt] = useState<CaFitAttempt>(INITIAL_CA_FIT_ATTEMPT);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => invalidate(), []);

  function invalidate() { generation.current += 1; controller.current?.abort(); controller.current = null; }
  function resetResults() { setReconstruction(null); setFatalFailure(null); setFit(null); setFitAttempt(INITIAL_CA_FIT_ATTEMPT); setPending(false); setMessage(""); setCancelled(false); }
  function changeInput(next: CaDraftPoint[]) { invalidate(); setPoints(next); setSource("user"); resetResults(); }
  function changeProcessing(next: CaProcessingValue) { invalidate(); setProcessing(next); setSource("user"); resetResults(); }
  function changeMode(next: CaInputMode) { invalidate(); setMode(next); setPoints(createInitialCaPoints()); setSource("user"); resetResults(); }
  function loadExample() {
    invalidate(); setMode("manual"); setSource("example");
    setPoints(CA_RATE_EXAMPLE.points.map((point, index) => ({ id: `${CA_RATE_EXAMPLE.id}-${index + 1}`, ...point, source: { kind: "example" } })));
    setProcessing({ ...DEFAULT_CA_PROCESSING, activeMassG: CA_RATE_EXAMPLE.activeMassG }); resetResults();
  }

  async function analyze() {
    invalidate(); resetResults();
    const validation = validateCaDraftPoints(points);
    const input = validation.points;
    if (validation.invalidPointIds.length) { setFatalFailure({ result: { status: "failure", code: "invalid-point", pointIds: validation.invalidPointIds }, points: [...points] }); setMessage(t("rate.ca.error.invalidRows", { rows: validation.invalidPointIds.join(", ") })); return; }
    if (input.length < 2) { setFatalFailure({ result: { status: "failure", code: "insufficient-points", pointIds: input.map(({ id }) => id) }, points: [...points] }); setMessage(t("rate.ca.error.insufficientInput")); return; }
    const options = toCaOptions(processing);
    const rebuilt = reconstructCaRate(input, options);
    if (rebuilt.status === "failure") { setFatalFailure({ result: rebuilt, points: input }); setMessage(t(`rate.ca.error.${rebuilt.code}`)); return; }
    setReconstruction(rebuilt);
    if (rebuilt.ratePoints.length > MAX_SYNC_RATE_FIT_POINTS) { setFitAttempt({ ...INITIAL_CA_FIT_ATTEMPT, failureCode: "too-many-points", attemptedPointCount: rebuilt.ratePoints.length }); setMessage(t("rate.ca.error.tooMany", { max: MAX_SYNC_RATE_FIT_POINTS.toLocaleString("en-US") })); return; }
    if (rebuilt.ratePoints.length < 4) { setFitAttempt({ ...INITIAL_CA_FIT_ATTEMPT, failureCode: "insufficient-data", attemptedPointCount: rebuilt.ratePoints.length }); setMessage(t("rate.ca.error.insufficientRatePoints")); return; }
    const token = generation.current;
    const nextController = new AbortController(); controller.current = nextController;
    setPending(true); setMessage("");
    setFitAttempt({ modelId: "rational-characteristic-time", status: "pending", attemptedPointCount: rebuilt.ratePoints.length });
    try {
      const result = await fitRatePerformance(rebuilt.ratePoints.map((point) => ({ rate: point.rate as number, capacity: point.capacity as number })), { modelId: "rational-characteristic-time", signal: nextController.signal });
      if (generation.current !== token || nextController.signal.aborted) return;
      if (result.status === "converged") { setFit(result); setFitAttempt({ modelId: "rational-characteristic-time", status: "converged", attemptedPointCount: rebuilt.ratePoints.length, usedPointCount: result.usedPointCount }); setMessage(t("rate.ca.success", { points: rebuilt.ratePoints.length })); }
      else { const wasCancelled = result.failure.code === "cancelled"; setCancelled(wasCancelled); setFitAttempt({ modelId: "rational-characteristic-time", status: wasCancelled ? "cancelled" : "failed", failureCode: result.failure.code, attemptedPointCount: rebuilt.ratePoints.length }); setMessage(t(wasCancelled ? "rate.ca.error.cancelled" : "rate.ca.error.fitFailed")); }
    } catch {
      if (generation.current === token && !nextController.signal.aborted) { setFitAttempt({ modelId: "rational-characteristic-time", status: "error", failureCode: "unexpected-error", attemptedPointCount: rebuilt.ratePoints.length }); setMessage(t("rate.ca.error.unexpected")); }
    } finally {
      if (generation.current === token) { setPending(false); controller.current = null; }
    }
  }

  const input = completeCaPoints(points);
  const options = toCaOptions(processing);
  return <section className="tools-page ca-rate-page">
    <Breadcrumbs current={t("rate.caAnalysis.title")} /><h1>{t("rate.caAnalysis.title")}</h1><p className="tool-lede">{t("rate.ca.subtitle")}</p>
    <RatePerformanceNav currentPath="/tools/rate-performance/ca-analysis" />
    <CaDataInput mode={mode} points={points} onModeChange={changeMode} onChange={changeInput} onLoadExample={loadExample} />
    <CaProcessingControls value={processing} onChange={changeProcessing} />
    <CaRawExport points={points} options={options} failure={fatalFailure} metadata={{ resultKind: source, exampleId: source === "example" ? CA_RATE_EXAMPLE.id : null }} />
    <section className="tool-section ca-run-panel"><h2>{t("rate.ca.workflow.title")}</h2><p className="ca-workflow">I(t) ↓ Q(t) ↓ {t("rate.ca.workflow.rate")} ↓ Q(R) ↓ {t("rate.ca.workflow.fit")}</p>
      <button type="button" disabled={pending} onClick={() => void analyze()}>{t("rate.ca.action.analyze")}</button>
      {pending ? <button type="button" onClick={() => { invalidate(); setPending(false); setCancelled(true); setFitAttempt((current) => ({ ...current, status: "cancelled", failureCode: "cancelled" })); setMessage(t("rate.ca.error.cancelled")); }}>{t("rate.analysis.cancel")}</button> : null}
      <FitStatus status={pending ? "loading" : fit ? "converged" : cancelled ? "cancelled" : message ? "failed" : "idle"} message={message || undefined} />
    </section>
    {reconstruction ? <CaAnalysisResults input={points} options={options} reconstruction={reconstruction} fit={fit} fitAttempt={fitAttempt} metadata={{ resultKind: source, exampleId: source === "example" ? CA_RATE_EXAMPLE.id : null }} onExportError={() => setMessage(t("rate.ca.error.export"))} /> : <CaEmptyState onLoadExample={loadExample} />}
    <CaTheory />
  </section>;
}

function CaEmptyState({ onLoadExample }: { onLoadExample: () => void }) {
  const { t } = useI18n();
  return <section className="ca-empty-grid">
    <section className="tool-section"><h2>{t("rate.ca.empty.example")}</h2><p>{t("rate.ca.empty.exampleText")}</p><button type="button" onClick={onLoadExample}>{t("rate.ca.input.loadExample")}</button></section>
    <section className="tool-section"><h2>{t("rate.ca.empty.outputs")}</h2><ul><li>I(t), Q(t), R(t), Q(R)</li><li><ScientificSymbol value="Q_M" />, <ScientificSymbol value="τ" />, n, R², RMSE</li><li>{t("rate.ca.empty.exports")}</li></ul></section>
    <section className="tool-section"><h2>{t("rate.ca.empty.preview")}</h2><ResultCards kind="example" items={[{ id: "qM", label: "Q_M", value: "≈ 300", unit: "mAh g^-1", type: "fitted" }, { id: "tau", label: "τ", value: "≈ 0.4", unit: "h", type: "fitted" }]} /></section>
    <RateChartPanel title={t("rate.ca.chart.current")} xLabel={t("rate.ca.axis.time", { unit: "s" })} yLabel={t("rate.ca.axis.current", { unit: "mA" })} series={[{ id: "ca-example-preview", label: "I(t)", color: "#1f6f78", points: CA_RATE_EXAMPLE.points.map((point) => ({ x: point.time, y: point.current })) }]} />
    <section className="tool-section"><h2>{t("rate.ca.empty.explanation")}</h2><p>{t("rate.ca.empty.explanationText")}</p></section>
  </section>;
}

function CaTheory() {
  const { t } = useI18n();
  const theory: RateTheoryContent = {
    title: t("rate.ca.theory.name"), equation: RATE_DISPLAY_EQUATIONS.ca.source,
    equationTex: RATE_DISPLAY_EQUATIONS.ca.tex,
    equationDescription: t("rate.ca.theory.equationDescription"),
    parameters: [{ symbol: "I_adj", name: t("rate.ca.chart.adjustedCurrent"), meaning: `${t("rate.ca.processing.sign")} → ${t("rate.ca.processing.baseline")} (${t("rate.ca.processing.baselineValue", { unit: "mA" })})`, unit: "mA", type: "derived" }, { symbol: "m", name: t("rate.ca.theory.mass"), meaning: t("rate.ca.theory.massMeaning"), unit: "g", type: "user-input" }, { symbol: "R", name: t("rate.ca.theory.rate"), meaning: t("rate.ca.theory.rateMeaning"), unit: "h^-1", type: "derived" }, { symbol: "Q_M", name: t("rate.ca.theory.qM"), meaning: t("rate.ca.theory.qMMeaning"), unit: "mAh g^-1", type: "fitted" }, { symbol: "τ", name: t("rate.ca.theory.tau"), meaning: t("rate.ca.theory.tauMeaning"), unit: "h", type: "fitted" }, { symbol: "n", name: t("rate.ca.theory.n"), meaning: t("rate.ca.theory.nMeaning"), unit: "dimensionless", type: "fitted" }],
    physicalMeaning: t("rate.ca.theory.physical"), limitingBehavior: t("rate.ca.theory.limits"), applicability: t("rate.ca.theory.applicability"), assumptions: [t("rate.ca.theory.assumption1"), t("rate.ca.theory.assumption2")], limitations: (getRateModel("rational-characteristic-time")?.limitations ?? []).map((value) => translatedRegistryText(value, t)), citationGuidance: t("rate.ca.theory.cite"),
  };
  const reference = getRateReference("tian-2020-chronoamperometry");
  return <><ModelTheoryPanel content={theory} /><ReferenceList references={reference ? [reference] : []} /></>;
}
