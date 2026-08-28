import { useI18n } from "../../../i18n/I18nProvider";
import type {
  createTransportSensitivitySeries,
  TransportInputKey,
  TransportUnavailabilityReason,
} from "../analysis/transportTimes";
import { RateChartPanel } from "./RateChartPanel";
import {
  displayTransportUnit,
  FIELD_DEFINITIONS,
  fieldDefinition,
} from "./transportTimePresentation";

export function TransportSensitivityPanel({
  parameter,
  onParameterChange,
  series,
}: {
  parameter: TransportInputKey;
  onParameterChange: (parameter: TransportInputKey) => void;
  series: ReturnType<typeof createTransportSensitivitySeries>;
}) {
  const { t } = useI18n();
  const points = series.points.flatMap(({ inputValue, totalSeconds }) =>
    totalSeconds === undefined ? [] : [{ x: inputValue, y: totalSeconds }]);
  const validPoints = series.points.filter(({ status }) => status === "available").length;
  const minimumPercent = formatPercent(series.range.minimumFactor * 100);
  const maximumPercent = formatPercent(series.range.maximumFactor * 100);
  const unit = displayTransportUnit(series.baseline.unit);
  const unavailablePoints = series.points.flatMap((point, index) => point.status === "unavailable"
    ? [{ step: index + 1, inputValue: point.inputValue, reason: point.unavailableReason ?? "unavailable-terms" as const }]
    : []);
  return <section className="tool-section rate-transport-sensitivity">
    <h2>{t("rate.transport.sensitivityTitle")}</h2>
    <p>{t("rate.transport.sensitivityBody")}</p>
    <p>{t("rate.parameterType.derived")} · {t("rate.transport.provenance.sensitivity")}</p>
    <label>{t("rate.transport.sensitivityParameter")}
      <select value={parameter} onChange={(event) => onParameterChange(event.currentTarget.value as TransportInputKey)}>
        {FIELD_DEFINITIONS.map((definition) => <option key={definition.key} value={definition.key}>{t(definition.label)}</option>)}
      </select>
    </label>
    <p><strong>{t(fieldDefinition(parameter).label)}:</strong> {t("rate.transport.sensitivityBaseline", {
      value: series.baseline.value,
      unit,
      minimumPercent,
      maximumPercent,
      steps: series.range.steps,
    })}</p>
    <p>{t("rate.transport.sensitivityStatus", { valid: validPoints, steps: series.range.steps })}</p>
    {unavailablePoints.length > 0 ? <div className="tool-validation">
      <strong>{t("rate.transport.sensitivityUnavailableTitle")}</strong>
      <ul>{unavailablePoints.map(({ step, inputValue, reason }) => <li key={step}>{t("rate.transport.sensitivityUnavailablePoint", {
        step,
        value: inputValue,
        unit,
        reason: sensitivityReason(reason, t),
      })}</li>)}</ul>
    </div> : null}
    <RateChartPanel
      title={t("rate.transport.sensitivityChart")}
      xLabel={`${t("rate.transport.sensitivityXAxis")} (${unit})`}
      yLabel={t("rate.transport.sensitivityYAxis")}
      series={[{ id: "oat-total", label: t("rate.transport.sensitivitySeries"), points, color: "#366c75", mode: "line" }]}
      metadata={[t("rate.transport.sensitivityBody"), t("rate.transport.provenance.sensitivity")]}
    />
  </section>;
}

function formatPercent(value: number): string {
  return Number(value.toPrecision(6)).toString();
}

function sensitivityReason(
  reason: TransportUnavailabilityReason,
  t: ReturnType<typeof useI18n>["t"],
): string {
  switch (reason) {
    case "numerical-overflow": return t("rate.transport.reason.numericalOverflow");
    case "numerical-underflow": return t("rate.transport.reason.numericalUnderflow");
    case "no-available-terms": return t("rate.transport.reason.noAvailableTerms");
    case "unavailable-terms": return t("rate.transport.reason.unavailableTerms");
    case "missing-inputs": return t("rate.transport.reason.missingInputs");
    case "invalid-inputs": return t("rate.transport.reason.invalidInputs");
    case "missing-and-invalid-inputs": return t("rate.transport.reason.missingAndInvalidInputs");
  }
}
