import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { useI18n } from "../../../i18n/I18nProvider";
import { RatePerformanceNav } from "../components/RatePerformanceNav";
import { TransportTimeWorkspace } from "../components/TransportTimeWorkspace";

export default function CharacteristicTimePage() {
  const { t } = useI18n();
  const currentPath = "/tools/rate-performance/characteristic-time";
  return <section className="tools-page">
    <Breadcrumbs current={t("rate.characteristicTime.title")} />
    <header className="tool-page-header">
      <h1>{t("rate.characteristicTime.title")}</h1>
      <p>{t("rate.characteristic.subtitle")}</p>
    </header>
    <RatePerformanceNav currentPath={currentPath} />
    <TransportTimeWorkspace mode="characteristic" />
  </section>;
}
