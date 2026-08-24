import { type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider";

export function SiteHeader({ children }: { children?: ReactNode }) {
  const { language, setLanguage, t } = useI18n();

  function goHome() {
    if (typeof window !== "undefined") window.location.href = "https://tmccdb.org/";
  }

  return (
    <header className="site-header">
      <div className="hero-topbar">
        <button className="brand-lockup" type="button" onClick={goHome} aria-label={`${t("home.database")} ${t("nav.home")}`}>
          <span className="brand-mark" aria-hidden="true" />
          <span>TMCC Database <b>v0.1</b></span>
        </button>
        <nav className="top-nav" aria-label="Primary">
          <button className="nav-button" type="button" onClick={goHome}>{t("nav.home")}</button>
          <a href="#selector">{t("nav.selector")}</a>
          <a href="#periodic-table">{t("nav.periodic")}</a>
          <a href="#explorer">{t("nav.explorer")}</a>
          <a href="#methodology">{t("nav.methodology")}</a>
          <a href="/tools">{t("nav.tools")}</a>
          <button className="login-button" type="button" title="User accounts will be added with the hosted database backend">Login</button>
          <span className="language-switch" aria-label="Language">
            <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>{t("language.english")}</button>
            <button type="button" aria-pressed={language === "zh"} onClick={() => setLanguage("zh")}>{t("language.chinese")}</button>
          </span>
        </nav>
      </div>
      {children}
    </header>
  );
}
