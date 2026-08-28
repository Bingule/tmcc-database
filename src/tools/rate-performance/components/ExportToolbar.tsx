import { downloadCsv, downloadPng, downloadSvg } from "../../../lib/toolExport";
import { useI18n } from "../../../i18n/I18nProvider";

export interface RateCsvExportItem {
  readonly id: string;
  readonly label: string;
  readonly filename: string;
  readonly csv: string;
}

export function ExportToolbar({
  csvItems,
  figureExportId,
  figureFilename = figureExportId,
  onCsvExport = downloadCsv,
  onFigureExport = defaultFigureExport,
  onError,
}: {
  csvItems: ReadonlyArray<Readonly<RateCsvExportItem>>;
  figureExportId?: string;
  figureFilename?: string;
  onCsvExport?: (filename: string, csv: string) => void;
  onFigureExport?: (svg: SVGSVGElement, type: "svg" | "png", filename: string) => void | Promise<void>;
  onError?: (error: unknown) => void;
}) {
  const { t } = useI18n();

  function figure(type: "svg" | "png") {
    try {
      const svg = figureExportId
        ? document.querySelector<SVGSVGElement>(`svg[data-export-id="${figureExportId}"]`)
        : null;
      if (!svg) throw new Error("chartUnavailable");
      const task = onFigureExport(svg, type, `${figureFilename}.${type}`);
      Promise.resolve(task).catch((error: unknown) => { onError?.(error); });
    } catch (error) {
      onError?.(error);
    }
  }

  function csv(item: Readonly<RateCsvExportItem>) {
    try {
      onCsvExport(item.filename, item.csv);
    } catch (error) {
      onError?.(error);
    }
  }

  return <section className="tool-section rate-export-toolbar">
    <h2>{t("rate.export.title")}</h2>
    <div className="rate-export-actions">
      {csvItems.map((item) => <button type="button" key={item.id} onClick={() => csv(item)}>{item.label}</button>)}
      {figureExportId ? <>
        <button type="button" onClick={() => figure("svg")}>{t("rate.export.svg")}</button>
        <button type="button" onClick={() => figure("png")}>{t("rate.export.png")}</button>
      </> : null}
    </div>
  </section>;
}

function defaultFigureExport(svg: SVGSVGElement, type: "svg" | "png", filename: string) {
  return type === "svg" ? downloadSvg(svg, filename) : downloadPng(svg, filename);
}
