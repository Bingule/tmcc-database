import { useI18n } from "../../../i18n/I18nProvider";
import type { CaReconstructionOptions } from "../analysis/reconstructCaRate";

export interface CaProcessingValue {
  readonly timeUnit: CaReconstructionOptions["timeUnit"];
  readonly currentUnit: CaReconstructionOptions["currentUnit"];
  readonly activeMassG: number;
  readonly sign: CaReconstructionOptions["sign"];
  readonly baselineMode: "off" | "constant";
  readonly baselineValue: number;
  readonly rangeEnabled: boolean;
  readonly rangeStart: number;
  readonly rangeEnd: number;
  readonly rateRangeEnabled: boolean;
  readonly minimumRateH1: number;
  readonly maximumRateH1: number;
}

export const DEFAULT_CA_PROCESSING: CaProcessingValue = {
  timeUnit: "s", currentUnit: "mA", activeMassG: 0.01, sign: "positive",
  baselineMode: "off", baselineValue: 0, rangeEnabled: false, rangeStart: 0, rangeEnd: 240,
  rateRangeEnabled: false, minimumRateH1: 0.01, maximumRateH1: 100,
};

export function CaProcessingControls({ value, onChange }: {
  value: Readonly<CaProcessingValue>;
  onChange: (value: CaProcessingValue) => void;
}) {
  const { t } = useI18n();
  const update = <K extends keyof CaProcessingValue>(key: K, next: CaProcessingValue[K]) => onChange({ ...value, [key]: next });
  return <section className="tool-section ca-processing-controls">
    <h2>{t("rate.ca.processing.title")}</h2>
    <div className="ca-processing-grid">
      <label>{t("rate.ca.processing.timeUnit")}<select value={value.timeUnit} onChange={(e) => update("timeUnit", e.target.value as CaProcessingValue["timeUnit"])}><option value="s">s</option><option value="min">min</option><option value="h">h</option></select></label>
      <label>{t("rate.ca.processing.currentUnit")}<select value={value.currentUnit} onChange={(e) => update("currentUnit", e.target.value as CaProcessingValue["currentUnit"])}><option value="mA">mA</option><option value="A">A</option></select></label>
      <label>{t("rate.ca.processing.mass")} (g)<input type="number" min="0" step="any" value={value.activeMassG} onChange={(e) => update("activeMassG", Number(e.target.value))} /></label>
      <label>{t("rate.ca.processing.sign")}<select value={value.sign} onChange={(e) => update("sign", e.target.value as CaProcessingValue["sign"])}><option value="positive">{t("rate.ca.processing.positive")}</option><option value="negative">{t("rate.ca.processing.negative")}</option></select></label>
      <label>{t("rate.ca.processing.baseline")}<select value={value.baselineMode} onChange={(e) => update("baselineMode", e.target.value as CaProcessingValue["baselineMode"])}><option value="off">{t("rate.ca.processing.off")}</option><option value="constant">{t("rate.ca.processing.constant")}</option></select></label>
      <label>{t("rate.ca.processing.baselineValue", { unit: value.currentUnit })}<input type="number" min="0" step="any" disabled={value.baselineMode === "off"} value={value.baselineValue} onChange={(e) => update("baselineValue", Number(e.target.value))} /></label>
      <label className="ca-checkbox"><input type="checkbox" checked={value.rangeEnabled} onChange={(e) => update("rangeEnabled", e.target.checked)} />{t("rate.ca.processing.range")}</label>
      <label>{t("rate.ca.processing.start")}<input type="number" disabled={!value.rangeEnabled} value={value.rangeStart} onChange={(e) => update("rangeStart", Number(e.target.value))} /></label>
      <label>{t("rate.ca.processing.end")}<input type="number" disabled={!value.rangeEnabled} value={value.rangeEnd} onChange={(e) => update("rangeEnd", Number(e.target.value))} /></label>
      <label className="ca-checkbox"><input type="checkbox" checked={value.rateRangeEnabled} onChange={(e) => update("rateRangeEnabled", e.target.checked)} />{t("rate.ca.processing.rateRange")}</label>
      <label>{t("rate.ca.processing.minimumRate")}<input type="number" min="0" disabled={!value.rateRangeEnabled} value={value.minimumRateH1} onChange={(e) => update("minimumRateH1", Number(e.target.value))} /></label>
      <label>{t("rate.ca.processing.maximumRate")}<input type="number" min="0" disabled={!value.rateRangeEnabled} value={value.maximumRateH1} onChange={(e) => update("maximumRateH1", Number(e.target.value))} /></label>
      <label>{t("rate.ca.processing.smoothing")}<select disabled value="off"><option value="off">{t("rate.ca.processing.offDefault")}</option></select></label>
    </div>
    <p>{t("rate.ca.processing.help")}</p>
  </section>;
}

export function toCaOptions(value: Readonly<CaProcessingValue>): CaReconstructionOptions {
  return {
    timeUnit: value.timeUnit, currentUnit: value.currentUnit, activeMassG: value.activeMassG, sign: value.sign,
    baseline: value.baselineMode === "constant" ? { mode: "constant", value: value.baselineValue } : { mode: "off" },
    fitRange: value.rangeEnabled || value.rateRangeEnabled ? {
      timeStart: value.rangeEnabled ? value.rangeStart : undefined,
      timeEnd: value.rangeEnabled ? value.rangeEnd : undefined,
      minimumRateH1: value.rateRangeEnabled ? value.minimumRateH1 : undefined,
      maximumRateH1: value.rateRangeEnabled ? value.maximumRateH1 : undefined,
    } : undefined,
  };
}
