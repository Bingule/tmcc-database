import { useMemo, useState } from "react";
import { useI18n } from "../../../i18n/I18nProvider";
import {
  calculateTransportTimes,
  createTransportSensitivitySeries,
  type TransportInputKey,
} from "../analysis/transportTimes";
import { TransportInputForm } from "./TransportInputForm";
import { TransportSensitivityPanel } from "./TransportSensitivityPanel";
import { TransportTheorySection } from "./TransportTheorySection";
import { TransportEmptyState, TransportTimeResults } from "./TransportTimeResults";
import {
  buildFittedTau,
  buildTransportInput,
  emptyTransportForm,
  exampleTransportForm,
  type CompletedTransportAnalysis,
  type FormState,
  type TransportWorkspaceMode,
} from "./transportTimePresentation";

export function TransportTimeWorkspace({ mode }: { mode: TransportWorkspaceMode }) {
  const { t } = useI18n();
  const [form, setForm] = useState<FormState>(emptyTransportForm);
  const [analysis, setAnalysis] = useState<CompletedTransportAnalysis | null>(null);
  const [sensitivityParameter, setSensitivityParameter] = useState<TransportInputKey>("electrodeThickness");

  function updateField(key: TransportInputKey, text: string) {
    setForm((current) => ({
      ...current,
      fields: { ...current.fields, [key]: { text, type: "user-input" } },
    }));
    setAnalysis(null);
  }

  function updateFittedTau(text: string) {
    setForm((current) => ({ ...current, fittedTau: { text, type: "user-input" } }));
    setAnalysis(null);
  }

  function run(nextForm = form, origin: CompletedTransportAnalysis["origin"] = "user") {
    const input = buildTransportInput(nextForm, t);
    setAnalysis({
      origin,
      input,
      fittedTau: buildFittedTau(nextForm, t),
      transport: calculateTransportTimes(input),
    });
  }

  function loadExample() {
    const example = exampleTransportForm();
    setForm(example);
    run(example, "example");
  }

  function clear() {
    setForm(emptyTransportForm());
    setAnalysis(null);
  }

  const sensitivity = useMemo(() => {
    if (!analysis?.transport.complete || !analysis.input[sensitivityParameter]) return null;
    return createTransportSensitivitySeries(analysis.input, sensitivityParameter);
  }, [analysis, sensitivityParameter]);

  return <>
    <div className="tool-layout">
      <TransportInputForm
        form={form}
        onFieldChange={updateField}
        onFittedTauChange={updateFittedTau}
        onCalculate={() => run()}
        onTryExample={loadExample}
        onClear={clear}
      />
      <section className="tool-section" aria-live="polite">
        <h2>{t("rate.transport.interpretationTitle")}</h2>
        <p>{t("rate.transport.effectiveNotice")}</p>
        {mode === "characteristic" ? <>
          <h3>{t("rate.transport.undefinedSymbols")}</h3>
          <p>{t("rate.transport.undefinedSymbolsReason")}</p>
        </> : null}
      </section>
    </div>
    <div className="rate-transport-dynamic" aria-live="polite">
      {analysis
        ? <TransportTimeResults analysis={analysis} mode={mode} />
        : <TransportEmptyState onTryExample={loadExample} />}
      {sensitivity ? <TransportSensitivityPanel
        parameter={sensitivityParameter}
        onParameterChange={setSensitivityParameter}
        series={sensitivity}
      /> : null}
    </div>
    <TransportTheorySection />
  </>;
}
