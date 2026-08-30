import { useState } from "react";
import { downloadCsv } from "../../../lib/toolExport";
import { useI18n } from "../../../i18n/I18nProvider";
import type { CaReconstructionOptions } from "../analysis/reconstructCaRate";
import { serializeCaOriginalCsv, type CaExportMetadata } from "../utils/caExports";
import type { CaDraftPoint } from "./CaDataInput";

export function CaRawExport({ points, options, metadata }: {
  points: ReadonlyArray<Readonly<CaDraftPoint>>;
  options: Readonly<CaReconstructionOptions>;
  metadata: Readonly<CaExportMetadata>;
}) {
  const { t } = useI18n();
  const [error, setError] = useState(false);
  function exportRaw() {
    try { downloadCsv("ca-original.csv", serializeCaOriginalCsv(points, options, metadata)); setError(false); }
    catch { setError(true); }
  }
  return <section className="tool-section ca-raw-export">
    <h2>{t("rate.ca.export.rawTitle")}</h2>
    <p>{t("rate.ca.export.rawHelp")}</p>
    <button type="button" onClick={exportRaw}>{t("rate.ca.export.original")}</button>
    {error ? <p role="alert" className="tool-validation">{t("rate.ca.error.export")}</p> : null}
  </section>;
}
