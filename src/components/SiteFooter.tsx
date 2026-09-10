import { materials } from "../data/materials";
import { useI18n } from "../i18n/I18nProvider";

export function SiteFooter({ buildDate = __TMCC_BUILD_DATE__ }: { buildDate?: string }) {
  const { t } = useI18n();

  return (
    <footer>
      <span>TMCC Database v1.1</span>
      <span>{t("footer.lastUpdate", { date: buildDate })}</span>
      <span>{t("footer.records", { count: materials.length })}</span>
    </footer>
  );
}
