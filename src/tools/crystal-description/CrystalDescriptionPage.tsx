import { Breadcrumbs } from "../../components/Breadcrumbs";
import { useI18n } from "../../i18n/I18nProvider";

const TOOL_URL = "https://crystal-description.streamlit.app/";

export default function CrystalDescriptionPage() {
  const { t } = useI18n();
  return <section className="tools-page">
    <Breadcrumbs current={t("tools.crystal.title")} />
    <header className="tool-page-header">
      <h1>{t("tools.crystal.title")}</h1>
      <p>{t("tools.crystal.description")}</p>
      <a className="secondary-button" href={TOOL_URL} target="_blank" rel="noopener noreferrer">{t("crystal.open")}</a>
      {" "}<a className="secondary-button" href="https://github.com/Bingule/crystal-description" target="_blank" rel="noopener noreferrer">GitHub · ⭐</a>
    </header>
    <p>{t("crystal.help")}</p>
    <p role="note" style={{fontSize:"0.9rem",color:"var(--text-muted, #58645f)"}}>{t("crystal.note")}</p>
    <iframe src={`${TOOL_URL}?embed=true`} title={t("tools.crystal.title")}
      loading="lazy" allow="clipboard-write" referrerPolicy="strict-origin-when-cross-origin"
      style={{width:"100%",height:"1050px",border:"1px solid #dde5df",borderRadius:"12px",marginTop:"16px"}} />
  </section>;
}
