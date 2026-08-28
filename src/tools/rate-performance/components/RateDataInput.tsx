import { useI18n } from "../../../i18n/I18nProvider";
import type { TabularSheet } from "../../../lib/tabularParsing";
import { RATE_PERFORMANCE_EXAMPLE } from "../data/rateExamples";
import type {
  CapacityUnit,
  RateNormalizationContext,
  RatePoint,
  RateUnit,
} from "../models/types";
import { ManualRateTable, createBlankRatePoints } from "./ManualRateTable";
import { RateFileImport } from "./RateFileImport";

export interface RateDataInputValue {
  readonly mode: "manual" | "upload";
  readonly points: ReadonlyArray<Readonly<RatePoint>>;
  readonly normalizationContext: Readonly<RateNormalizationContext>;
}

export function createInitialRateDataInputValue(): RateDataInputValue {
  return { mode: "manual", points: createBlankRatePoints(), normalizationContext: {} };
}

export function RateDataInput({
  value,
  onChange,
  parseFile,
}: {
  value: Readonly<RateDataInputValue>;
  onChange: (value: RateDataInputValue) => void;
  parseFile?: (file: File) => Promise<TabularSheet[]>;
}) {
  const { t } = useI18n();
  const rateUnit: RateUnit = value.points[0]?.rateUnit ?? "h-1";
  const capacityUnit: CapacityUnit = value.points[0]?.capacityUnit ?? "mAh-g-1";

  function points(next: ReadonlyArray<Readonly<RatePoint>>) {
    onChange({ ...value, points: next.map((point) => ({ ...point })) });
  }

  function setRateUnit(next: RateUnit) {
    const normalizationContext: RateNormalizationContext = next === "h-1"
      ? { confirmHInverseMeasuredRate: value.normalizationContext.confirmHInverseMeasuredRate }
      : next === "C-rate"
        ? { theoreticalCapacity: value.normalizationContext.theoreticalCapacity }
        : {};
    onChange({
      ...value,
      points: value.points.map((point) => ({ ...point, rateUnit: next })),
      normalizationContext,
    });
  }

  function setCapacityUnit(next: CapacityUnit) {
    onChange({
      ...value,
      points: value.points.map((point) => ({ ...point, capacityUnit: next })),
    });
  }

  function clear() {
    const blank = createBlankRatePoints().map((point) => ({ ...point, rateUnit, capacityUnit }));
    onChange({ ...value, points: blank });
  }

  function example() {
    onChange({
      mode: "manual",
      points: RATE_PERFORMANCE_EXAMPLE.points.map((point) => ({ ...point })),
      normalizationContext: RATE_PERFORMANCE_EXAMPLE.normalizationContext ?? {},
    });
  }

  return <section className="tool-section rate-data-input">
    <h2>{t("rate.input.title")}</h2>
    <fieldset className="rate-input-mode">
      <legend>{t("rate.input.source")}</legend>
      <label><input
        type="radio"
        name="rate-input-mode"
        value="manual"
        checked={value.mode === "manual"}
        onChange={() => onChange({ ...value, mode: "manual" })}
      />{t("rate.input.manual")}</label>
      <label><input
        type="radio"
        name="rate-input-mode"
        value="upload"
        checked={value.mode === "upload"}
        onChange={() => onChange({ ...value, mode: "upload" })}
      />{t("rate.input.upload")}</label>
    </fieldset>
    <div className="rate-unit-controls">
      <label>{t("rate.input.rateUnit")}
        <select aria-label={t("rate.input.rateUnit")} value={rateUnit} onChange={(event) => setRateUnit(event.target.value as RateUnit)}>
          <option value="h-1">h^-1</option>
          <option value="C-rate">C-rate</option>
          <option value="A-g-1">A g^-1</option>
          <option value="mA-g-1">mA g^-1</option>
        </select>
      </label>
      <label>{t("rate.input.capacityUnit")}
        <select aria-label={t("rate.input.capacityUnit")} value={capacityUnit} onChange={(event) => setCapacityUnit(event.target.value as CapacityUnit)}>
          <option value="mAh-g-1">mAh g^-1</option>
          <option value="Ah-kg-1">Ah kg^-1</option>
        </select>
      </label>
    </div>
    {rateUnit === "h-1" ? <label className="rate-confirmation"><input
      type="checkbox"
      aria-label={t("rate.input.confirmMeasured")}
      checked={value.normalizationContext.confirmHInverseMeasuredRate === true}
      onChange={(event) => onChange({
        ...value,
        normalizationContext: { confirmHInverseMeasuredRate: event.target.checked },
      })}
    />{t("rate.input.confirmMeasured")}</label> : null}
    {rateUnit === "C-rate" ? <div className="rate-theoretical-capacity">
      <label>{t("rate.input.theoreticalCapacity")}
        <input
          type="number"
          step="any"
          aria-label={t("rate.input.theoreticalCapacity")}
          value={value.normalizationContext.theoreticalCapacity?.value ?? ""}
          onChange={(event) => onChange({
            ...value,
            normalizationContext: event.target.value === "" ? {} : {
              theoreticalCapacity: {
                value: Number(event.target.value),
                unit: value.normalizationContext.theoreticalCapacity?.unit ?? capacityUnit,
              },
            },
          })}
        />
      </label>
      <label>{t("rate.input.theoreticalUnit")}
        <select
          value={value.normalizationContext.theoreticalCapacity?.unit ?? capacityUnit}
          onChange={(event) => onChange({
            ...value,
            normalizationContext: value.normalizationContext.theoreticalCapacity ? {
              theoreticalCapacity: { ...value.normalizationContext.theoreticalCapacity, unit: event.target.value as CapacityUnit },
            } : {},
          })}
        >
          <option value="mAh-g-1">mAh g^-1</option>
          <option value="Ah-kg-1">Ah kg^-1</option>
        </select>
      </label>
    </div> : null}
    <p className="rate-unit-notice">{t("rate.input.unitNotice")}</p>
    {value.mode === "manual"
      ? <ManualRateTable points={value.points} rateUnit={rateUnit} capacityUnit={capacityUnit} onChange={points} />
      : <RateFileImport rateUnit={rateUnit} capacityUnit={capacityUnit} onImport={points} parseFile={parseFile} />}
    <div className="rate-input-actions">
      <button type="button" onClick={clear}>{t("rate.input.clear")}</button>
      <button type="button" onClick={example}>{t("rate.input.loadExample")}</button>
    </div>
  </section>;
}
