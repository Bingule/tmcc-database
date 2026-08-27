import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { useI18n } from "../../../i18n/I18nProvider";
import { RatePerformanceNav } from "../components/RatePerformanceNav";

export default function TransportLimitationPage() {
  const { t } = useI18n();
  const currentPath = "/tools/rate-performance/transport-limitations";
  return <section className="tools-page"><Breadcrumbs current={t("rate.transportLimitations.title")} /><h1>{t("rate.transportLimitations.title")}</h1><RatePerformanceNav currentPath={currentPath} /><section role="status"><p>{t("rate.empty")}</p></section></section>;
}
