import { materials } from "../data/materials";
import { useI18n } from "../i18n/I18nProvider";

export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer>
      <span>TMCC Database v0.1</span>
      <span>{t("footer.lastUpdate", { date: "2026-08-12" })}</span>
      <span>{t("footer.records", { count: materials.length })}</span>
    </footer>
  );
}
