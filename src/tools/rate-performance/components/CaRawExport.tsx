import { useState } from "react";
import { downloadCsv } from "../../../lib/toolExport";
import { useI18n } from "../../../i18n/I18nProvider";
import type { CaReconstructionFailure, CaReconstructionOptions } from "../analysis/reconstructCaRate";
import { serializeCaFailureCsv, serializeCaOriginalCsv, type CaExportMetadata } from "../utils/caExports";
import type { CaDraftPoint } from "./CaDataInput";

export function CaRawExport({ points, options, metadata, failure }: {
  points: ReadonlyArray<Readonly<CaDraftPoint>>;
  options: Readonly<CaReconstructionOptions>;
  metadata: Readonly<CaExportMetadata>;
  failure?: Readonly<{ result: CaReconstructionFailure; points: ReadonlyArray<Readonly<CaDraftPoint>> }> | null;
}) {
  const { t } = useI18n();
  const [error, setError] = useState(false);
  function exportRaw() {
    try { downloadCsv("ca-original.csv", serializeCaOriginalCsv(points, options, metadata)); setError(false); }
    catch { setError(true); }
  }
  function exportFailure() {
    if (!failure) return;
    try { downloadCsv("ca-reconstruction-failure.csv", serializeCaFailureCsv(failure.result, failure.points, options, metadata)); setError(false); }
    catch { setError(true); }
  }
  return <section className="tool-section ca-raw-export">
    <h2>{t("rate.ca.export.rawTitle")}</h2>
    <p>{t("rate.ca.export.rawHelp")}</p>
    <button type="button" onClick={exportRaw}>{t("rate.ca.export.original")}</button>
    {failure ? <button type="button" onClick={exportFailure}>{t("common.export")} CA {t("common.error")} CSV</button> : null}
    {error ? <p role="alert" className="tool-validation">{t("rate.ca.error.export")}</p> : null}
  </section>;
}
