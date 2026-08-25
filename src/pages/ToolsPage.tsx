import { Breadcrumbs } from "../components/Breadcrumbs";
import { useI18n } from "../i18n/I18nProvider";

const tools = [
  { href: "/tools/cv-kinetics", title: "tools.cv.title", description: "tools.cv.description" },
  { href: "/tools/theoretical-capacity", title: "tools.capacity.title", description: "tools.capacity.description" },
  { href: "/tools/molecular-weight", title: "tools.molecularWeight.title", description: "tools.molecularWeight.description" }
] as const;

export function ToolsPage() {
  const { t } = useI18n();

  return (
    <section className="tools-page">
      <Breadcrumbs />
      <header className="tool-page-header">
        <h1>{t("tools.title")}</h1>
        <p>{t("tools.description")}</p>
      </header>
      <ul className="tools-grid">
        {tools.map((tool) => (
          <li className="tool-card" key={tool.href}>
            <a href={tool.href}>{t(tool.title)}</a>
            <p>{t(tool.description)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ToolsPage;
