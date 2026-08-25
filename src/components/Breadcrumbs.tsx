import { useI18n } from "../i18n/I18nProvider";

export function Breadcrumbs({ current }: { current?: string }) {
  const { t } = useI18n();

  return (
    <nav className="breadcrumbs breadcrumb-nav" aria-label={t("common.breadcrumb")}>
      <a href="/">{t("nav.home")}</a>
      <span aria-hidden="true">/</span>
      <a href="/tools" aria-current={current ? undefined : "page"}>{t("nav.tools")}</a>
      {current && <>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{current}</span>
      </>}
    </nav>
  );
}
