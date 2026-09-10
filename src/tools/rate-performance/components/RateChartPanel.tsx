import {
  ScientificLineChart,
  type ChartAreaSeries,
  type ChartSeries,
} from "../../../components/ScientificLineChart";
import { useI18n } from "../../../i18n/I18nProvider";

export function RateChartPanel({
  title,
  xLabel,
  yLabel,
  series,
  areas,
  xScale,
  yScale,
  exportId,
  metadata,
  rawPointCount,
  displayedPointCount,
}: {
  title: string;
  xLabel: string;
  yLabel: string;
  series: ChartSeries[];
  areas?: ChartAreaSeries[];
  xScale?: "linear" | "log10";
  yScale?: "linear" | "log10";
  exportId?: string;
  metadata?: string | string[];
  rawPointCount?: number;
  displayedPointCount?: number;
}) {
  const { t } = useI18n();
  const sampled = rawPointCount !== undefined
    && displayedPointCount !== undefined
    && displayedPointCount < rawPointCount;
  return <section className="tool-section rate-chart-panel">
    <h2>{title}</h2>
    <ScientificLineChart
      title={title}
      xLabel={xLabel}
      yLabel={yLabel}
      emptyLabel={t("rate.chart.empty")}
      legendLabel={t("rate.chart.legend")}
      series={series}
      areas={areas}
      xScale={xScale}
      yScale={yScale}
      exportId={exportId}
      metadata={metadata}
    />
    {sampled ? <p className="rate-chart-sampling-notice">{t("rate.chart.samplingNotice", {
      raw: rawPointCount.toLocaleString("en-US"),
      displayed: displayedPointCount.toLocaleString("en-US"),
    })}</p> : null}
  </section>;
}
