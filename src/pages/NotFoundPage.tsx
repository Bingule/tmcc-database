import { Breadcrumbs } from "../components/Breadcrumbs";
import { useI18n } from "../i18n/I18nProvider";

export function NotFoundPage() {
  const { t } = useI18n();

  return (
    <section className="tools-page">
      <Breadcrumbs current={t("notFound.title")} />
      <h1>{t("notFound.title")}</h1>
    </section>
  );
}

export default NotFoundPage;
