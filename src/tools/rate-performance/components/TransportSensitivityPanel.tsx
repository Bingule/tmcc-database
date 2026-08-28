import { useI18n } from "../../../i18n/I18nProvider";
import type {
  createTransportSensitivitySeries,
  TransportInputKey,
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
      unit: displayTransportUnit(series.baseline.unit),
      steps: series.range.steps,
    })}</p>
    <RateChartPanel
      title={t("rate.transport.sensitivityChart")}
      xLabel={t("rate.transport.sensitivityXAxis")}
      yLabel={t("rate.transport.sensitivityYAxis")}
      series={[{ id: "oat-total", label: t("rate.transport.sensitivitySeries"), points, color: "#366c75", mode: "line" }]}
      metadata={[t("rate.transport.sensitivityBody"), t("rate.transport.provenance.sensitivity")]}
    />
  </section>;
}
