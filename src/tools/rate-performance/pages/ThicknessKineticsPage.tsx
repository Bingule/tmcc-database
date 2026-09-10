import { useEffect, useRef, useState } from "react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { useI18n } from "../../../i18n/I18nProvider";
import { fitThicknessSeries, type ThicknessSeriesOutcome } from "../analysis/fitThicknessSeries";
import { fitThicknessScaling, type ThicknessScalingConverged, type ThicknessScalingFailure } from "../analysis/thicknessScaling";
import { RatePerformanceNav } from "../components/RatePerformanceNav";
import { ThicknessExportPanel } from "../components/ThicknessExportPanel";
import { ThicknessSampleInput, type ThicknessElectrodeDraft } from "../components/ThicknessSampleInput";
import { ThicknessScalingResults, type ThicknessSampleFailure } from "../components/ThicknessScalingResults";
import { THICKNESS_KINETICS_EXAMPLE } from "../data/thicknessExamples";
import type { ThicknessExportContext } from "../utils/thicknessExports";
import {
  cloneThicknessDraft,
  cloneThicknessRateInput,
  createBlankThicknessDraft,
  createExampleThicknessDrafts,
  mapSuccessfulThicknessFit,
  thicknessDisplayName,
  thicknessSampleFailure,
  thicknessScalingFailureKey,
  type ThicknessMessageKey,
} from "../utils/thicknessWorkflow";

interface Progress { readonly current: number; readonly total: number; readonly sampleName: string }

export default function ThicknessKineticsPage() {
  const { t } = useI18n();
  const nextId = useRef(1);
  const [samples, setSamples] = useState<ReadonlyArray<Readonly<ThicknessElectrodeDraft>>>(() => [createBlankThicknessDraft("thickness-sample-1", "Electrode 1")]);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<ThicknessScalingConverged | null>(null);
  const [failures, setFailures] = useState<ReadonlyArray<Readonly<ThicknessSampleFailure>>>([]);
  const [outcomes, setOutcomes] = useState<ReadonlyArray<Readonly<ThicknessSeriesOutcome>>>([]);
  const [scalingFailure, setScalingFailure] = useState<ThicknessScalingFailure["failure"] | null>(null);
  const [isExample, setIsExample] = useState(false);
  const [message, setMessage] = useState<ThicknessMessageKey | null>(null);
  const generation = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const currentPath = "/tools/rate-performance/thickness-kinetics";

  function seriesFailureReason(code: string) {
    if (code === "invalid-thickness") return t("rate.thickness.failure.invalidThickness");
    if (code === "no-complete-data") return t("rate.thickness.failure.noData");
    if (code === "too-many-points") return t("rate.thickness.failure.tooManyPoints");
    if (code === "unexpected-fit") return t("rate.thickness.failure.unexpected");
    if (code.includes("unit") || code.includes("normalization")) return t("rate.thickness.failure.normalize");
    return t("rate.thickness.failure.fit", { code: code.replace(/-/g, " ") });
  }

  useEffect(() => () => invalidatePending(generation, activeController), []);

  function createId() {
    nextId.current += 1;
    return `thickness-sample-${nextId.current}`;
  }

  function replaceSamples(next: ReadonlyArray<Readonly<ThicknessElectrodeDraft>>, nextIsExample = false) {
    invalidatePending(generation, activeController);
    setSamples(next);
    setPending(false);
    setProgress(null);
    setResult(null);
    setFailures([]);
    setOutcomes([]);
    setScalingFailure(null);
    setIsExample(nextIsExample);
    setMessage(null);
  }

  function updateSample(id: string, next: ThicknessElectrodeDraft) {
    replaceSamples(samples.map((sample) => sample.id === id ? next : sample));
  }

  function addSample() {
    const id = createId();
    replaceSamples([...samples, createBlankThicknessDraft(id, `Electrode ${samples.length + 1}`)]);
  }

  function duplicateSample(id: string) {
    const index = samples.findIndex((sample) => sample.id === id);
    if (index < 0) return;
    const duplicateId = createId();
    const source = samples[index];
    const duplicate: ThicknessElectrodeDraft = {
      ...source,
      id: duplicateId,
      sampleName: `${source.sampleName} copy`,
      rateInput: cloneThicknessRateInput(source.rateInput, duplicateId),
    };
    replaceSamples([...samples.slice(0, index + 1), duplicate, ...samples.slice(index + 1)]);
  }

  function deleteSample(id: string) {
    replaceSamples(samples.filter((sample) => sample.id !== id));
  }

  function loadExample() {
    replaceSamples(createExampleThicknessDrafts(THICKNESS_KINETICS_EXAMPLE, createId), true);
  }

  async function analyze() {
    invalidatePending(generation, activeController);
    const token = generation.current;
    const controller = new AbortController();
    activeController.current = controller;
    const snapshot = samples.map(cloneThicknessDraft);
    setPending(true);
    setResult(null);
    setFailures([]);
    setOutcomes([]);
    setScalingFailure(null);
    setMessage(null);
    const nextOutcomes = await fitThicknessSeries(snapshot.map((sample, index) => ({
      id: sample.id,
      sampleName: thicknessDisplayName(sample, index),
      thickness: sample.thickness,
      thicknessUnit: sample.thicknessUnit,
      massLoading: sample.massLoading,
      modelId: sample.modelId,
      points: sample.rateInput.points,
      normalizationContext: sample.rateInput.normalizationContext,
    })), {
      signal: controller.signal,
      onProgress: (current, total, sample) => setProgress({ current, total, sampleName: sample.sampleName }),
    });
    if (!isCurrent(token, controller, generation, activeController)) return;
    activeController.current = null;
    setPending(false);
    setProgress(null);
    const nextFailures = nextOutcomes.flatMap((outcome, index) => outcome.status === "failed"
      ? [thicknessSampleFailure(snapshot[index], index, seriesFailureReason(outcome.failureCode))]
      : []);
    setFailures(nextFailures);
    setOutcomes(nextOutcomes);
    const scaling = fitThicknessScaling(nextOutcomes.flatMap((outcome, index) => outcome.status === "converged"
      ? [mapSuccessfulThicknessFit(snapshot[index], index, outcome)]
      : []));
    if (scaling.status === "failed") {
      setResult(null);
      setScalingFailure(scaling.failure);
      setMessage(thicknessScalingFailureKey(scaling.failure.code));
      return;
    }
    setScalingFailure(null);
    setResult(scaling);
  }

  function cancel() {
    if (!pending) return;
    invalidatePending(generation, activeController);
    setPending(false);
    setProgress(null);
    setResult(null);
    setFailures([]);
    setOutcomes([]);
    setScalingFailure(null);
    setMessage("rate.thickness.cancelled");
  }

  const exportContext: ThicknessExportContext = {
    resultKind: isExample ? "example" : "user",
    exampleId: isExample ? THICKNESS_KINETICS_EXAMPLE.id : null,
    sources: samples,
    outcomes,
    scalingFailure,
  };

  return <section className="tools-page">
    <Breadcrumbs current={t("rate.thicknessKinetics.title")} />
    <header className="tool-page-header"><h1>{t("rate.thicknessKinetics.title")}</h1><p>{t("rate.thickness.subtitle")}</p></header>
    <RatePerformanceNav currentPath={currentPath} />
    <section className="rate-thickness-datasets">
      <div className="tool-section rate-thickness-datasets-intro">
        <h2>{t("rate.thickness.datasetsTitle")}</h2><p>{t("rate.thickness.datasetsHelp")}</p>
        <div className="rate-input-actions">
          <button type="button" onClick={addSample}>{t("rate.thickness.add")}</button>
          <button type="button" onClick={loadExample}>{t("rate.thickness.loadExample")}</button>
        </div>
      </div>
      {samples.map((sample) => <ThicknessSampleInput key={sample.id} sample={sample}
        onChange={(next) => updateSample(sample.id, next)} onDuplicate={() => duplicateSample(sample.id)}
        onDelete={() => deleteSample(sample.id)} />)}
    </section>
    <section className="tool-section rate-thickness-actions">
      <h2>{t("rate.thickness.runTitle")}</h2><p>{t("rate.thickness.runHelp")}</p><p>{t("rate.thickness.policy")}</p>
      <div className="rate-input-actions">
        <button type="button" disabled={pending} onClick={() => void analyze()}>{t("rate.thickness.analyze")}</button>
        {pending ? <button type="button" onClick={cancel}>{t("rate.thickness.cancel")}</button> : null}
      </div>
      <div role="status" aria-live="polite">{pending && progress
        ? t("rate.thickness.progress", { current: progress.current, total: progress.total, name: progress.sampleName })
        : message ? t(message) : !result ? t("rate.thickness.idle") : null}</div>
    </section>
    {!result && failures.length > 0 ? <section className="tool-section rate-thickness-failures">
      <h2>{t("rate.thickness.failuresTitle")}</h2><ul>{failures.map((item) => <li key={item.id}><strong>{item.sampleName}</strong>: {item.reason}</li>)}</ul>
    </section> : null}
    {!result && scalingFailure?.conflicts ? <section className="tool-section rate-thickness-failures">
      <h2>{t("rate.thickness.failure.duplicate")}</h2>
      <ul>{scalingFailure.conflicts.flatMap((conflict) => conflict.samples.map((sample) =>
        <li key={sample.id}><strong>{sample.sampleName}</strong> ({sample.id}): {sample.thickness} {sample.thicknessUnit === "um" ? "µm" : sample.thicknessUnit}</li>))}</ul>
    </section> : null}
    {result ? <ThicknessScalingResults result={result} failures={failures} totalSampleCount={samples.length}
      exportContext={exportContext}
      onExportError={() => setMessage("rate.thickness.failure.unexpected")} /> : null}
    {!result && scalingFailure ? <ThicknessExportPanel result={null} context={exportContext}
      onExportError={() => setMessage("rate.thickness.failure.unexpected")} /> : null}
  </section>;
}

function invalidatePending(generation: React.MutableRefObject<number>, controller: React.MutableRefObject<AbortController | null>) {
  generation.current += 1;
  controller.current?.abort();
  controller.current = null;
}
function isCurrent(token: number, controller: AbortController, generation: React.MutableRefObject<number>, activeController: React.MutableRefObject<AbortController | null>) {
  return generation.current === token && activeController.current === controller;
}
