import { type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider";

export function SiteHeader({ children }: { children?: ReactNode }) {
  const { language, setLanguage, t } = useI18n();
  const homepageAnchorPrefix = typeof window === "undefined" || window.location.pathname === "/" ? "" : "/";

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
        <nav className="top-nav" aria-label={t("nav.primary")}>
          <button className="nav-button" type="button" onClick={goHome}>{t("nav.home")}</button>
          <a href={`${homepageAnchorPrefix}#selector`}>{t("nav.selector")}</a>
          <a href={`${homepageAnchorPrefix}#periodic-table`}>{t("nav.periodic")}</a>
          <a href={`${homepageAnchorPrefix}#explorer`}>{t("nav.explorer")}</a>
          <a href={`${homepageAnchorPrefix}#methodology`}>{t("nav.methodology")}</a>
          <a href="/tools">{t("nav.tools")}</a>
          <button className="login-button" type="button" title={t("nav.loginUnavailable")}>{t("nav.login")}</button>
          <span className="language-switch" aria-label={t("nav.language")}>
            <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>{t("language.english")}</button>
            <button type="button" aria-pressed={language === "zh"} onClick={() => setLanguage("zh")}>{t("language.chinese")}</button>
          </span>
        </nav>
      </div>
      {children}
    </header>
  );
}
