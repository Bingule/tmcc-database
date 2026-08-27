import { useI18n } from "../../../i18n/I18nProvider";

const pages = [
  ["/tools/rate-performance", "rate.analysis.title"],
  ["/tools/rate-performance/model-comparison", "rate.modelComparison.title"],
  ["/tools/rate-performance/transport-limitations", "rate.transportLimitations.title"],
  ["/tools/rate-performance/characteristic-time", "rate.characteristicTime.title"],
  ["/tools/rate-performance/thickness-kinetics", "rate.thicknessKinetics.title"],
  ["/tools/rate-performance/ca-analysis", "rate.caAnalysis.title"],
  ["/tools/rate-performance/empirical-models", "rate.empiricalModels.title"],
  ["/tools/rate-performance/energy-power", "rate.energyPower.title"]
] as const;

export function RatePerformanceNav({ currentPath }: { currentPath: string }) {
  const { t } = useI18n();

  return (
    <nav className="rate-performance-nav" aria-label={t("rate.nav")}>
      <ul>
        {pages.map(([href, title]) => (
          <li key={href}>
            <a href={href} aria-current={href === currentPath ? "page" : undefined}>{t(title)}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
