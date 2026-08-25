import { useI18n } from "../i18n/I18nProvider";
import {
  CvParseError,
  parseScanRateList,
  type CvDataLayout,
  type CvHeaderMode,
  type CvParseErrorCode
} from "../lib/cvImport";
import type { ParsedCvTable } from "../lib/cvParsing";

export interface CvImportDraft {
  options: { layout: CvDataLayout | ""; headerMode: CvHeaderMode };
  source: "file" | "paste";
  pasteText: string;
  scanRateText: string;
  pointInterval: number;
  rSquaredThreshold: number;
}

export type CvUiError = CvParseErrorCode
  | "invalidPointInterval"
  | "invalidRSquaredThreshold"
  | "noOverlap"
  | "noBFit"
  | "analysis"
  | "export";

export interface CvImportPanelProps {
  draft: CvImportDraft;
  table: ParsedCvTable | null;
  busy: boolean;
  error: CvUiError | null;
  onDraftChange(next: CvImportDraft): void;
  onFile(file: File): void;
  onParsePaste(): void;
  onAnalyze(): void;
}

const intervalOptions = Array.from({ length: 30 }, (_, index) => index + 1);

export function CvImportPanel({
  draft,
  table,
  busy,
  error,
  onDraftChange,
  onFile,
  onParsePaste,
  onAnalyze
}: CvImportPanelProps) {
  const { t } = useI18n();
  const validation = validateDraft(draft, table);
  const displayedError = error ?? validation.visibleCode;
  const rates = validation.rates;

  const update = (patch: Partial<CvImportDraft>) => onDraftChange({ ...draft, ...patch });
  const updateOptions = (patch: Partial<CvImportDraft["options"]>) => {
    onDraftChange({ ...draft, options: { ...draft.options, ...patch } });
  };

  return <section className="tool-section cv-import">
    <h2>{t("cv.import.title")}</h2>
    <p>{t("cv.import.help")}</p>
    <p>{t("cv.import.accepted")}</p>

    <fieldset className="cv-import-fieldset cv-format-choices" role="radiogroup" aria-required="true" aria-label={t("cv.aria.layout")}>
      <legend>{t("cv.import.layout")}</legend>
      <p>{t("cv.import.layout.help")}</p>
      <label>
        <input
          type="radio"
          name="cv-layout"
          value="sharedPotential"
          required
          checked={draft.options.layout === "sharedPotential"}
          aria-label={t("cv.aria.layout.shared")}
          onChange={() => updateOptions({ layout: "sharedPotential" })}
        />
        {t("cv.import.layout.shared")}
      </label>
      <code>{t("cv.import.layout.shared.example")}</code>
      <label>
        <input
          type="radio"
          name="cv-layout"
          value="pairedPotentialCurrent"
          required
          checked={draft.options.layout === "pairedPotentialCurrent"}
          aria-label={t("cv.aria.layout.paired")}
          onChange={() => updateOptions({ layout: "pairedPotentialCurrent" })}
        />
        {t("cv.import.layout.paired")}
      </label>
      <code>{t("cv.import.layout.paired.example")}</code>
    </fieldset>

    <fieldset className="cv-import-fieldset" role="radiogroup" aria-label={t("cv.aria.headerMode")}>
      <legend>{t("cv.import.headerMode")}</legend>
      <p>{t("cv.import.headerMode.help")}</p>
      <label>
        <input
          type="radio"
          name="cv-header-mode"
          value="header"
          checked={draft.options.headerMode === "header"}
          onChange={() => updateOptions({ headerMode: "header" })}
        />
        {t("cv.import.headerMode.header")}
      </label>
      <label>
        <input
          type="radio"
          name="cv-header-mode"
          value="data"
          checked={draft.options.headerMode === "data"}
          onChange={() => updateOptions({ headerMode: "data" })}
        />
        {t("cv.import.headerMode.data")}
      </label>
    </fieldset>

    <fieldset className="cv-import-fieldset" role="radiogroup" aria-label={t("cv.aria.source")}>
      <legend>{t("cv.import.source")}</legend>
      <p>{t("cv.import.source.help")}</p>
      <label>
        <input
          type="radio"
          name="cv-source"
          value="file"
          checked={draft.source === "file"}
          onChange={() => update({ source: "file" })}
        />
        {t("cv.import.source.file")}
      </label>
      <label>
        <input
          type="radio"
          name="cv-source"
          value="paste"
          checked={draft.source === "paste"}
          onChange={() => update({ source: "paste" })}
        />
        {t("cv.import.source.paste")}
      </label>
    </fieldset>

    {draft.source === "file" ? <label htmlFor="cv-file-input">
      {t("cv.upload")}
      <input
        id="cv-file-input"
        aria-label={t("cv.aria.file")}
        type="file"
        accept=".csv,.txt,.xlsx"
        disabled={busy}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onFile(file);
        }}
      />
    </label> : <div className="cv-paste-source">
      <label htmlFor="cv-paste-text">{t("cv.import.paste.label")}</label>
      <textarea
        id="cv-paste-text"
        name="cv-paste-text"
        aria-label={t("cv.aria.paste")}
        placeholder={t("cv.import.paste.placeholder")}
        value={draft.pasteText}
        onChange={(event) => update({ pasteText: event.target.value })}
      />
      <button type="button" disabled={busy || draft.pasteText.trim() === ""} onClick={onParsePaste}>
        {busy ? t("cv.import.parsing") : t("cv.import.paste.parse")}
      </button>
    </div>}

    <label htmlFor="cv-scan-rates">
      {t("cv.import.scanRates")} (mV/s)
      <input
        id="cv-scan-rates"
        name="cv-scan-rates"
        type="text"
        inputMode="decimal"
        aria-label={t("cv.aria.scanRates")}
        placeholder="0.2, 0.4, 0.6, 0.8, 1"
        value={draft.scanRateText}
        onChange={(event) => update({ scanRateText: event.target.value })}
      />
    </label>
    <p>{t("cv.import.scanRates.help")}</p>

    <label htmlFor="cv-point-interval">
      {t("cv.import.pointInterval")}
      <select
        id="cv-point-interval"
        name="cv-point-interval"
        aria-label={t("cv.aria.pointInterval")}
        value={draft.pointInterval}
        onChange={(event) => update({ pointInterval: Number(event.target.value) })}
      >
        {intervalOptions.map((interval) => <option key={interval} value={interval}>{interval}</option>)}
      </select>
    </label>
    <p>{t("cv.import.pointInterval.help")}</p>

    <label htmlFor="cv-r-squared-threshold">
      {t("cv.import.rSquaredThreshold")}
      <input
        id="cv-r-squared-threshold"
        name="cv-r-squared-threshold"
        type="number"
        min="0"
        max="1"
        step="0.01"
        aria-label={t("cv.aria.rSquaredThreshold")}
        value={Number.isFinite(draft.rSquaredThreshold) ? draft.rSquaredThreshold : ""}
        onChange={(event) => update({
          rSquaredThreshold: event.target.value === "" ? Number.NaN : Number(event.target.value)
        })}
      />
    </label>
    <p>{t("cv.import.rSquaredThreshold.help")}</p>

    <p className="tool-validation" aria-live="polite" role="status">
      {displayedError ? errorMessage(displayedError, t, table?.pairs.length) : ""}
    </p>

    <section className="cv-preview" aria-label={t("cv.aria.preview")}>
      <h3>{t("cv.preview.title")}</h3>
      {!table ? <p>{t("cv.preview.emptyControlled")}</p> : <>
        <h4>{t("cv.preview.mapping")}</h4>
        <ul className="cv-mapping-list">
          {table.pairs.map((pair, index) => <li key={`${pair.potentialColumn}-${pair.currentColumn}`}>
            {table.layout === "sharedPotential"
              ? t("cv.import.mapping.shared", { current: pair.currentHeader, rate: rates[index] ?? "—" })
              : t("cv.import.mapping.paired", {
                potential: pair.potentialHeader,
                current: pair.currentHeader,
                rate: rates[index] ?? "—"
              })}
          </li>)}
        </ul>
        <h4>{t("cv.preview.rows")}</h4>
        <PreviewTable table={table} />
      </>}
    </section>

    <p>{t("cv.analysis.notice")}</p>
    <button
      type="button"
      name="cv-analyze"
      aria-label={t("cv.aria.analyze")}
      disabled={!validation.ready || busy}
      onClick={onAnalyze}
    >
      {t("cv.analysis.run")}
    </button>
  </section>;
}

function validateDraft(draft: CvImportDraft, table: ParsedCvTable | null) {
  if (!draft.options.layout) {
    return { ready: false, visibleCode: "formatRequired" as const, rates: [] as number[] };
  }
  if (!table) return { ready: false, visibleCode: null, rates: [] as number[] };
  let rates: number[];
  if (draft.scanRateText.trim() === "") {
    return { ready: false, visibleCode: "missingScanRate" as const, rates: [] as number[] };
  }
  try {
    rates = parseScanRateList(draft.scanRateText);
  } catch (error) {
    return {
      ready: false,
      visibleCode: error instanceof CvParseError ? error.code : "invalidScanRate" as const,
      rates: [] as number[]
    };
  }
  if (rates.length !== table.pairs.length) {
    return { ready: false, visibleCode: "scanRateCountMismatch" as const, rates };
  }
  if (!Number.isInteger(draft.pointInterval) || draft.pointInterval < 1 || draft.pointInterval > 30) {
    return { ready: false, visibleCode: "invalidPointInterval" as const, rates };
  }
  if (!Number.isFinite(draft.rSquaredThreshold)
    || draft.rSquaredThreshold < 0
    || draft.rSquaredThreshold > 1) {
    return { ready: false, visibleCode: "invalidRSquaredThreshold" as const, rates };
  }
  return { ready: true, visibleCode: null, rates };
}

function errorMessage(
  code: CvUiError,
  t: ReturnType<typeof useI18n>["t"],
  pairCount?: number
) {
  const keys = {
    emptyFile: "cv.error.emptyFile",
    malformedFile: "cv.error.malformedFile",
    potentialColumnMissing: "cv.error.potentialColumnMissing",
    currentColumnsMissing: "cv.error.currentColumnsMissing",
    formatRequired: "cv.error.formatRequired",
    oddPairColumnCount: "cv.error.oddPairColumnCount",
    missingScanRate: "cv.error.missingScanRate",
    duplicateScanRate: "cv.error.duplicateScanRate",
    invalidScanRate: "cv.error.invalidScanRate",
    insufficientSeries: "cv.error.insufficientSeries",
    tooManySeries: "cv.error.tooManySeries",
    scanRateCountMismatch: "cv.error.scanRateCountMismatch",
    resourceLimitExceeded: "cv.error.resourceLimitExceeded",
    invalidPointInterval: "cv.error.invalidPointInterval",
    invalidRSquaredThreshold: "cv.error.invalidRSquaredThreshold",
    noOverlap: "cv.error.noOverlap",
    noBFit: "cv.error.noBFit",
    analysis: "cv.error.analysis",
    export: "cv.error.export"
  } satisfies Record<CvUiError, Parameters<typeof t>[0]>;
  return t(keys[code], { count: pairCount ?? 0 });
}

function PreviewTable({ table }: { table: ParsedCvTable }) {
  return <div className="tool-table-wrap"><table>
    <thead><tr>{table.headers.map((header, index) => <th scope="col" key={`${index}-${header}`}>{header || "—"}</th>)}</tr></thead>
    <tbody>{table.rows.slice(0, 5).map((row, rowIndex) => <tr key={rowIndex}>
      {row.map((cell, cellIndex) => <td key={cellIndex}>{formatCell(cell)}</td>)}
    </tr>)}</tbody>
  </table></div>;
}

function formatCell(value: string | number | null) {
  if (typeof value === "number") return Number(value.toPrecision(7)).toString();
  return value ?? "—";
}
