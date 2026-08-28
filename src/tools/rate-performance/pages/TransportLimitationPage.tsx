import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { useI18n } from "../../../i18n/I18nProvider";
import { RatePerformanceNav } from "../components/RatePerformanceNav";
import { TransportTimeWorkspace } from "../components/TransportTimeWorkspace";

export default function TransportLimitationPage() {
  const { t } = useI18n();
  const currentPath = "/tools/rate-performance/transport-limitations";
  return <section className="tools-page">
    <Breadcrumbs current={t("rate.transportLimitations.title")} />
    <header className="tool-page-header">
      <h1>{t("rate.transportLimitations.title")}</h1>
      <p>{t("rate.transport.subtitle")}</p>
    </header>
    <RatePerformanceNav currentPath={currentPath} />
    <TransportTimeWorkspace mode="transport" />
  </section>;
}
