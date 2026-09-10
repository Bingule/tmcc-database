import { useI18n } from "../../../i18n/I18nProvider";
import type { ThicknessScalingConverged } from "../analysis/thicknessScaling";
import {
  serializeThicknessFitsCsv,
  serializeThicknessProvenanceCsv,
  serializeThicknessResidualsCsv,
  serializeThicknessSamplesCsv,
  serializeThicknessScalingCsv,
  type ThicknessExportContext,
} from "../utils/thicknessExports";
import { ExportToolbar } from "./ExportToolbar";

export function ThicknessExportPanel({
  result,
  context,
  onExportError,
}: {
  result: Readonly<ThicknessScalingConverged> | null;
  context: Readonly<ThicknessExportContext>;
  onExportError: () => void;
}) {
  const { t } = useI18n();
  const csvItems = result ? [
    { id: "thickness-samples", label: t("rate.thickness.export.samples"), filename: "thickness-samples.csv", csv: serializeThicknessSamplesCsv(result, context) },
    { id: "thickness-fits", label: t("rate.thickness.export.fits"), filename: "thickness-fits.csv", csv: serializeThicknessFitsCsv(result, context) },
    { id: "thickness-scaling", label: t("rate.thickness.export.scaling"), filename: "thickness-scaling.csv", csv: serializeThicknessScalingCsv(result, context) },
    { id: "thickness-residuals", label: t("rate.thickness.export.residuals"), filename: "thickness-residuals.csv", csv: serializeThicknessResidualsCsv(result, context) },
    { id: "thickness-provenance", label: t("rate.thickness.export.provenance"), filename: "thickness-provenance.csv", csv: serializeThicknessProvenanceCsv(result, context) },
  ] : [
    { id: "thickness-samples", label: t("rate.thickness.export.samples"), filename: "thickness-samples.csv", csv: serializeThicknessSamplesCsv(null, context) },
    { id: "thickness-provenance", label: t("rate.thickness.export.provenance"), filename: "thickness-provenance.csv", csv: serializeThicknessProvenanceCsv(null, context) },
  ];

  return <ExportToolbar
    csvItems={csvItems}
    figureExportId={result ? "rate-thickness-linear" : undefined}
    figureFilename="thickness-tau-vs-l"
    onError={onExportError}
  />;
}
