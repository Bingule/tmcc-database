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
  onError,
}: {
  csvItems: ReadonlyArray<Readonly<RateCsvExportItem>>;
  figureExportId?: string;
  figureFilename?: string;
  onCsvExport?: (filename: string, csv: string) => void;
  onError?: (error: unknown) => void;
}) {
  const { t } = useI18n();

  function figure(type: "svg" | "png") {
    const svg = figureExportId
      ? document.querySelector<SVGSVGElement>(`svg[data-export-id="${figureExportId}"]`)
      : null;
    if (!svg) {
      onError?.(new Error("chartUnavailable"));
      return;
    }
    try {
      const task = type === "svg"
        ? downloadSvg(svg, `${figureFilename}.svg`)
        : downloadPng(svg, `${figureFilename}.png`);
      if (task instanceof Promise) task.catch(onError);
    } catch (error) {
      onError?.(error);
    }
  }

  return <section className="tool-section rate-export-toolbar">
    <h2>{t("rate.export.title")}</h2>
    <div className="rate-export-actions">
      {csvItems.map((item) => <button type="button" key={item.id} onClick={() => onCsvExport(item.filename, item.csv)}>{item.label}</button>)}
      {figureExportId ? <>
        <button type="button" onClick={() => figure("svg")}>{t("rate.export.svg")}</button>
        <button type="button" onClick={() => figure("png")}>{t("rate.export.png")}</button>
      </> : null}
    </div>
  </section>;
}
