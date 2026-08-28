import { useState } from "react";
import { parseDelimitedTable, TabularParseError } from "../../../lib/tabularParsing";
import { useI18n } from "../../../i18n/I18nProvider";
import type { CapacityUnit, RatePoint, RateUnit } from "../models/types";

export const DEFAULT_RATE_INPUT_ROWS = 6;

export function createBlankRatePoints(count = DEFAULT_RATE_INPUT_ROWS): RatePoint[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `rate-row-${index + 1}`,
    rate: null,
    rateUnit: "h-1",
    capacity: null,
    capacityUnit: "mAh-g-1",
  }));
}

export function ManualRateTable({
  points,
  rateUnit,
  capacityUnit,
  onChange,
}: {
  points: ReadonlyArray<Readonly<RatePoint>>;
  rateUnit: RateUnit;
  capacityUnit: CapacityUnit;
  onChange: (points: RatePoint[]) => void;
}) {
  const { t } = useI18n();
  const [pasteError, setPasteError] = useState("");

  function update(id: string, field: "rate" | "capacity", text: string) {
    const value = text.trim() === "" ? null : Number(text);
    onChange(points.map((point) => point.id === id ? { ...point, [field]: value } : { ...point }));
  }

  function paste(text: string) {
    try {
      const rows = parseDelimitedTable(text);
      if (rows.some((row) => row.length !== 2)) throw new TabularParseError("malformedFile", { reason: "twoColumnsRequired" });
      const parsed = rows.map((row, index): RatePoint => ({
        id: `rate-row-${index + 1}`,
        rate: numericCell(row[0]),
        rateUnit,
        capacity: numericCell(row[1]),
        capacityUnit,
      }));
      setPasteError("");
      onChange(parsed);
    } catch {
      setPasteError(t("rate.input.pasteError"));
    }
  }

  return <section className="rate-manual-input">
    <div className="rate-manual-toolbar">
      <button type="button" onClick={() => onChange([...points.map((point) => ({ ...point })), blankNext(points, rateUnit, capacityUnit)])}>{t("rate.input.addRow")}</button>
    </div>
    <div
      className="tool-table-wrap rate-table-frame-scroll"
      data-rate-table-viewport="true"
      data-visible-rows="6"
      tabIndex={0}
      aria-label={t("rate.input.tableViewport")}
    >
      <table>
        <thead><tr>
          <th>{t("rate.input.row")}</th>
          <th>{t("rate.input.rate")} ({rateUnit})</th>
          <th>{t("rate.input.capacity")} ({capacityUnit})</th>
          <th>{t("rate.input.actions")}</th>
        </tr></thead>
        <tbody>{points.map((point, index) => <tr key={point.id}>
          <th scope="row">{index + 1}</th>
          <td><input
            name={`rate-${point.id}`}
            type="number"
            step="any"
            value={finiteValue(point.rate)}
            aria-label={t("rate.input.rateRow", { row: index + 1 })}
            onChange={(event) => update(point.id, "rate", event.target.value)}
          /></td>
          <td><input
            name={`capacity-${point.id}`}
            type="number"
            step="any"
            value={finiteValue(point.capacity)}
            aria-label={t("rate.input.capacityRow", { row: index + 1 })}
            onChange={(event) => update(point.id, "capacity", event.target.value)}
          /></td>
          <td><button type="button" onClick={() => onChange(points.filter(({ id }) => id !== point.id).map((item) => ({ ...item })))}>{t("rate.input.deleteRow", { row: index + 1 })}</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <label className="rate-paste-field">{t("rate.input.paste")}
      <textarea
        aria-label={t("rate.input.pasteAria")}
        placeholder={t("rate.input.pastePlaceholder")}
        onPaste={(event) => {
          event.preventDefault();
          paste(event.clipboardData.getData("text"));
        }}
      />
      <small>{t("rate.input.pasteHelp")}</small>
    </label>
    {pasteError ? <p className="tool-validation" role="alert">{pasteError}</p> : null}
  </section>;
}

function numericCell(cell: string | number | null): number | null {
  if (cell === null || cell === "") return null;
  const value = typeof cell === "number" ? cell : Number(cell);
  return Number.isFinite(value) ? value : Number.NaN;
}

function finiteValue(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function blankNext(
  points: ReadonlyArray<Readonly<RatePoint>>,
  rateUnit: RateUnit,
  capacityUnit: CapacityUnit,
): RatePoint {
  let index = points.length + 1;
  while (points.some(({ id }) => id === `rate-row-${index}`)) index += 1;
  return { id: `rate-row-${index}`, rate: null, rateUnit, capacity: null, capacityUnit };
}
