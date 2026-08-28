import { useId, useLayoutEffect, useRef, useState } from "react";
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
  const inputId = useId();
  const radioName = `rate-input-mode-${inputId}`;
  const [importSession, setImportSession] = useState(0);
  const latestValue = useRef(value);
  const previousValue = useRef(value);
  const lastEmittedValue = useRef<RateDataInputValue | null>(null);

  useLayoutEffect(() => {
    latestValue.current = value;
    if (previousValue.current === value) return;
    const semanticallyChanged = !sameRateInputValue(previousValue.current, value);
    const originatedHere = semanticallyChanged
      && lastEmittedValue.current !== null
      && sameRateInputValue(lastEmittedValue.current, value);
    previousValue.current = value;
    lastEmittedValue.current = null;
    if (semanticallyChanged && !originatedHere && value.mode === "upload") {
      setImportSession((session) => session + 1);
    }
  }, [value]);

  const rateUnit: RateUnit = value.points[0]?.rateUnit ?? "h-1";
  const capacityUnit: CapacityUnit = value.points[0]?.capacityUnit ?? "mAh-g-1";

  function emit(next: RateDataInputValue) {
    latestValue.current = next;
    lastEmittedValue.current = next;
    onChange(next);
  }

  function invalidateImport() {
    setImportSession((session) => session + 1);
  }

  function points(next: ReadonlyArray<Readonly<RatePoint>>) {
    const current = latestValue.current;
    emit({ ...current, points: next.map((point) => ({ ...point })) });
  }

  function importedPoints(next: ReadonlyArray<Readonly<RatePoint>>) {
    const current = latestValue.current;
    if (current.mode !== "upload") return;
    emit({ ...current, points: next.map((point) => ({ ...point })) });
  }

  function setRateUnit(next: RateUnit) {
    invalidateImport();
    const current = latestValue.current;
    const normalizationContext: RateNormalizationContext = next === "h-1"
      ? { confirmHInverseMeasuredRate: current.normalizationContext.confirmHInverseMeasuredRate }
      : next === "C-rate"
        ? { theoreticalCapacity: current.normalizationContext.theoreticalCapacity }
        : {};
    emit({
      ...current,
      points: current.points.map((point) => ({ ...point, rateUnit: next })),
      normalizationContext,
    });
  }

  function setCapacityUnit(next: CapacityUnit) {
    invalidateImport();
    const current = latestValue.current;
    emit({
      ...current,
      points: current.points.map((point) => ({ ...point, capacityUnit: next })),
    });
  }

  function clear() {
    invalidateImport();
    const blank = createBlankRatePoints().map((point) => ({ ...point, rateUnit, capacityUnit }));
    emit({ ...latestValue.current, points: blank });
  }

  function example() {
    invalidateImport();
    emit({
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
        name={radioName}
        value="manual"
        checked={value.mode === "manual"}
        onChange={() => {
          invalidateImport();
          emit({ ...latestValue.current, mode: "manual" });
        }}
      />{t("rate.input.manual")}</label>
      <label><input
        type="radio"
        name={radioName}
        value="upload"
        checked={value.mode === "upload"}
        onChange={() => {
          invalidateImport();
          emit({ ...latestValue.current, mode: "upload" });
        }}
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
      onChange={(event) => emit({
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
          onChange={(event) => emit({
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
          onChange={(event) => emit({
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
      : <RateFileImport
        key={importSession}
        rateUnit={rateUnit}
        capacityUnit={capacityUnit}
        onImport={importedPoints}
        parseFile={parseFile}
      />}
    <div className="rate-input-actions">
      <button type="button" onClick={clear}>{t("rate.input.clear")}</button>
      <button type="button" onClick={example}>{t("rate.input.loadExample")}</button>
    </div>
  </section>;
}

function sameRateInputValue(left: Readonly<RateDataInputValue>, right: Readonly<RateDataInputValue>) {
  if (left === right) return true;
  if (left.mode !== right.mode || left.points.length !== right.points.length) return false;
  if (!sameNormalizationContext(left.normalizationContext, right.normalizationContext)) return false;
  if (left.points === right.points) return true;
  return left.points.every((point, index) => {
    const candidate = right.points[index];
    return point === candidate || (candidate !== undefined
      && point.id === candidate.id
      && Object.is(point.rate, candidate.rate)
      && point.rateUnit === candidate.rateUnit
      && Object.is(point.capacity, candidate.capacity)
      && point.capacityUnit === candidate.capacityUnit);
  });
}

function sameNormalizationContext(
  left: Readonly<RateNormalizationContext>,
  right: Readonly<RateNormalizationContext>,
) {
  if (left === right) return true;
  if (left.confirmHInverseMeasuredRate !== right.confirmHInverseMeasuredRate) return false;
  const leftTheoretical = left.theoreticalCapacity;
  const rightTheoretical = right.theoreticalCapacity;
  return leftTheoretical === rightTheoretical || (
    Object.is(leftTheoretical?.value, rightTheoretical?.value)
    && leftTheoretical?.unit === rightTheoretical?.unit
  );
}
