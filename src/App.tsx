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
const RatePerformanceAnalysisPage = lazy(() => import("./tools/rate-performance/pages/RatePerformanceAnalysisPage"));
const ModelComparisonPage = lazy(() => import("./tools/rate-performance/pages/ModelComparisonPage"));
const TransportLimitationPage = lazy(() => import("./tools/rate-performance/pages/TransportLimitationPage"));
const CharacteristicTimePage = lazy(() => import("./tools/rate-performance/pages/CharacteristicTimePage"));
const ThicknessKineticsPage = lazy(() => import("./tools/rate-performance/pages/ThicknessKineticsPage"));
const CaRateAnalysisPage = lazy(() => import("./tools/rate-performance/pages/CaRateAnalysisPage"));
const EmpiricalModelsPage = lazy(() => import("./tools/rate-performance/pages/EmpiricalModelsPage"));
const EnergyPowerPage = lazy(() => import("./tools/rate-performance/pages/EnergyPowerPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

export default function App() {
  const route = normalizePathname(window.location.pathname);

  if (route === "home") return <main><HomePage /></main>;
  if (route === "tools") return <Shell><ToolsPage /></Shell>;
  if (route === "cvKinetics") return <Shell><CvKineticsPage /></Shell>;
  if (route === "theoreticalCapacity") return <Shell><TheoreticalCapacityPage /></Shell>;
  if (route === "molecularWeight") return <Shell><MolecularWeightPage /></Shell>;
  if (route === "ratePerformance") return <Shell><RatePerformanceAnalysisPage /></Shell>;
  if (route === "rateModelComparison") return <Shell><ModelComparisonPage /></Shell>;
  if (route === "rateTransportLimitations") return <Shell><TransportLimitationPage /></Shell>;
  if (route === "rateCharacteristicTime") return <Shell><CharacteristicTimePage /></Shell>;
  if (route === "rateThicknessKinetics") return <Shell><ThicknessKineticsPage /></Shell>;
  if (route === "rateCaAnalysis") return <Shell><CaRateAnalysisPage /></Shell>;
  if (route === "rateEmpiricalModels") return <Shell><EmpiricalModelsPage /></Shell>;
  if (route === "rateEnergyPower") return <Shell><EnergyPowerPage /></Shell>;
  return <Shell><NotFoundPage /></Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  return <main><SiteHeader /><Suspense fallback={<RouteLoading />}>{children}</Suspense><SiteFooter /></main>;
}

function RouteLoading() {
  const { t } = useI18n();
  return <div className="route-loading" role="status">{t("common.loading")}</div>;
}
