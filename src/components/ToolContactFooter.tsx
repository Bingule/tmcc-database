import { useI18n } from "../i18n/I18nProvider";

export function ToolContactFooter() {
  const { t } = useI18n();

  return (
    <aside className="tool-contact-note" aria-label={t("tools.contactPrompt")}>
      <p>{t("tools.contactPrompt")}</p>
      <p>
        <a href="mailto:wui@vscht.cz">
          {t("tools.contactEmail", { display: "Dr. Wu", email: "wui@vscht.cz" })}
        </a>
      </p>
    </aside>
  );
}
