import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { useI18n } from "../../../i18n/I18nProvider";
import { RatePerformanceNav } from "../components/RatePerformanceNav";

export default function ModelComparisonPage() {
  const { t } = useI18n();
  const currentPath = "/tools/rate-performance/model-comparison";
  return <section className="tools-page"><Breadcrumbs current={t("rate.modelComparison.title")} /><h1>{t("rate.modelComparison.title")}</h1><RatePerformanceNav currentPath={currentPath} /><section role="status"><p>{t("rate.empty")}</p></section></section>;
}
