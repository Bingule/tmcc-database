import { lazy, Suspense, type ReactNode } from "react";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { useI18n } from "./i18n/I18nProvider";
import { normalizePathname } from "./lib/routes";
import { HomePage } from "./pages/HomePage";

const ToolsPage = lazy(() => import("./pages/ToolsPage"));
const CvKineticsPage = lazy(() => import("./pages/CvKineticsPage"));
const TheoreticalCapacityPage = lazy(() => import("./pages/TheoreticalCapacityPage"));
const MolecularWeightPage = lazy(() => import("./pages/MolecularWeightPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

export default function App() {
  const route = normalizePathname(window.location.pathname);

  if (route === "home") return <main><HomePage /></main>;
  if (route === "tools") return <Shell><ToolsPage /></Shell>;
  if (route === "cvKinetics") return <Shell><CvKineticsPage /></Shell>;
  if (route === "theoreticalCapacity") return <Shell><TheoreticalCapacityPage /></Shell>;
  if (route === "molecularWeight") return <Shell><MolecularWeightPage /></Shell>;
  return <Shell><NotFoundPage /></Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  return <main><SiteHeader /><Suspense fallback={<RouteLoading />}>{children}</Suspense><SiteFooter /></main>;
}

function RouteLoading() {
  const { t } = useI18n();
  return <div className="route-loading" role="status">{t("common.loading")}</div>;
}
