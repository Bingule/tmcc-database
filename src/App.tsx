import { Breadcrumbs } from "./components/Breadcrumbs";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { useI18n } from "./i18n/I18nProvider";
import { normalizePathname } from "./lib/routes";
import { HomePage } from "./pages/HomePage";
import { MolecularWeightPage } from "./pages/MolecularWeightPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { TheoreticalCapacityPage } from "./pages/TheoreticalCapacityPage";
import { ToolsPage } from "./pages/ToolsPage";

export default function App() {
  const { t } = useI18n();
  const route = normalizePathname(window.location.pathname);

  if (route === "home") return <main><HomePage /></main>;
  if (route === "tools") return <Shell><ToolsPage /></Shell>;
  if (route === "cvKinetics") return <Shell><ToolRoutePlaceholder title={t("tools.cv.title")} /></Shell>;
  if (route === "theoreticalCapacity") return <Shell><TheoreticalCapacityPage /></Shell>;
  if (route === "molecularWeight") return <Shell><MolecularWeightPage /></Shell>;
  return <Shell><NotFoundPage /></Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main><SiteHeader />{children}<SiteFooter /></main>;
}

function ToolRoutePlaceholder({ title }: { title: string }) {
  return <section className="tools-page"><Breadcrumbs current={title} /><h1>{title}</h1></section>;
}
