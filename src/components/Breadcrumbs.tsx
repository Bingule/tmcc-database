import { useI18n } from "../i18n/I18nProvider";

export function Breadcrumbs({ current }: { current: string }) {
  const { t } = useI18n();

  return (
    <nav className="breadcrumbs breadcrumb-nav" aria-label="Breadcrumb">
      <a href="/">{t("nav.home")}</a>
      <span aria-hidden="true">/</span>
      <a href="/tools">{t("nav.tools")}</a>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{current}</span>
    </nav>
  );
}
