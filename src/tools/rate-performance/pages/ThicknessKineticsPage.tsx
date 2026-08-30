import { useEffect, useRef, useState } from "react";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { useI18n } from "../../../i18n/I18nProvider";
import { fitRatePerformance, MAX_SYNC_RATE_FIT_POINTS } from "../analysis/fitRatePerformance";
import { fitThicknessScaling, type ThicknessScalingConverged } from "../analysis/thicknessScaling";
import { RatePerformanceNav } from "../components/RatePerformanceNav";
import { ThicknessSampleInput, type ThicknessElectrodeDraft } from "../components/ThicknessSampleInput";
import { ThicknessScalingResults, type ThicknessSampleFailure } from "../components/ThicknessScalingResults";
import { THICKNESS_KINETICS_EXAMPLE } from "../data/thicknessExamples";
import { normalizeRatePoints } from "../utils/rateUnits";
import type { ThicknessFitExportRecord } from "../utils/thicknessExports";
import {
  cloneThicknessDraft,
  cloneThicknessRateInput,
  createBlankThicknessDraft,
  createExampleThicknessDrafts,
  mapSuccessfulThicknessFit,
  thicknessDisplayName,
  thicknessFitFailureLabel,
  thicknessSampleFailure,
  thicknessScalingFailureKey,
  type ThicknessMessageKey,
} from "../utils/thicknessWorkflow";

const MODEL_ID = "tian-characteristic-time";
interface Progress { readonly current: number; readonly total: number; readonly sampleName: string }

export default function ThicknessKineticsPage() {
  const { t } = useI18n();
  const nextId = useRef(1);
  const [samples, setSamples] = useState<ReadonlyArray<Readonly<ThicknessElectrodeDraft>>>(() => [createBlankThicknessDraft("thickness-sample-1", "Electrode 1")]);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<ThicknessScalingConverged | null>(null);
  const [failures, setFailures] = useState<ReadonlyArray<Readonly<ThicknessSampleFailure>>>([]);
  const [fitRecords, setFitRecords] = useState<ReadonlyArray<Readonly<ThicknessFitExportRecord>>>([]);
  const [isExample, setIsExample] = useState(false);
  const [message, setMessage] = useState<ThicknessMessageKey | null>(null);
  const generation = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const currentPath = "/tools/rate-performance/thickness-kinetics";

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
    setFitRecords([]);
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
    const nextFailures: ThicknessSampleFailure[] = [];
    const fittedSamples: Parameters<typeof fitThicknessScaling>[0][number][] = [];
    const nextFitRecords: ThicknessFitExportRecord[] = [];
    setPending(true);
    setResult(null);
    setFailures([]);
    setFitRecords([]);
    setMessage(null);

    for (const [index, sample] of snapshot.entries()) {
      if (!isCurrent(token, controller, generation, activeController)) return;
      setProgress({ current: index + 1, total: snapshot.length, sampleName: thicknessDisplayName(sample, index) });
      if (sample.thickness === null || !Number.isFinite(sample.thickness) || sample.thickness <= 0) {
        nextFailures.push(thicknessSampleFailure(sample, index, t("rate.thickness.failure.invalidThickness")));
        continue;
      }
      const populated = sample.rateInput.points.filter(({ rate, capacity }) => rate !== null || capacity !== null);
      if (populated.length <= 3) {
        nextFailures.push(thicknessSampleFailure(sample, index, t("rate.thickness.failure.noData")));
        continue;
      }

      let normalized;
      try {
        normalized = normalizeRatePoints(populated, sample.rateInput.normalizationContext);
      } catch {
        nextFailures.push(thicknessSampleFailure(sample, index, t("rate.thickness.failure.normalize")));
        continue;
      }
      if (normalized.length > MAX_SYNC_RATE_FIT_POINTS) {
        nextFailures.push(thicknessSampleFailure(sample, index, t("rate.thickness.failure.tooManyPoints")));
        continue;
      }
      try {
        const fit = await fitRatePerformance(
          normalized.map(({ analysisRate: rate, analysisCapacity: capacity }) => ({ rate, capacity })),
          { modelId: MODEL_ID, signal: controller.signal },
        );
        if (!isCurrent(token, controller, generation, activeController)) return;
        if (fit.status === "failed") {
          nextFailures.push(thicknessSampleFailure(sample, index, t("rate.thickness.failure.fit", { code: thicknessFitFailureLabel(fit.failure.code) })));
          continue;
        }
        const mapped = mapSuccessfulThicknessFit(sample, index, fit);
        fittedSamples.push(mapped.scalingSample);
        nextFitRecords.push(mapped.record);
      } catch {
        if (!isCurrent(token, controller, generation, activeController)) return;
        nextFailures.push(thicknessSampleFailure(sample, index, t("rate.thickness.failure.unexpected")));
      }
    }

    if (!isCurrent(token, controller, generation, activeController)) return;
    activeController.current = null;
    setPending(false);
    setProgress(null);
    setFailures(nextFailures);
    setFitRecords(nextFitRecords);
    const scaling = fitThicknessScaling(fittedSamples);
    if (scaling.status === "failed") {
      setResult(null);
      setMessage(thicknessScalingFailureKey(scaling.failure.code));
      return;
    }
    setResult(scaling);
  }

  function cancel() {
    if (!pending) return;
    invalidatePending(generation, activeController);
    setPending(false);
    setProgress(null);
    setResult(null);
    setFailures([]);
    setFitRecords([]);
    setMessage("rate.thickness.cancelled");
  }

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
    {result ? <ThicknessScalingResults result={result} failures={failures} totalSampleCount={samples.length}
      sourceSamples={samples} fitRecords={fitRecords} kind={isExample ? "example" : "user"}
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
