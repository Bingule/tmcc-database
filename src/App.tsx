import { lazy, Suspense, type ReactNode } from "react";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { ToolFeedbackPanel } from "./components/ToolFeedbackPanel";
import { useI18n } from "./i18n/I18nProvider";
import { normalizePathname } from "./lib/routes";
import { HomePage } from "./pages/HomePage";

const ToolsPage = lazy(() => import("./pages/ToolsPage"));
const CvKineticsPage = lazy(() => import("./pages/CvKineticsPage"));
const TheoreticalCapacityPage = lazy(() => import("./pages/TheoreticalCapacityPage"));
const MolecularWeightPage = lazy(() => import("./pages/MolecularWeightPage"));
const ReviewerTwoPage = lazy(() => import("./tools/reviewer-two/pages/ReviewerTwoPage"));
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
  const isToolsRoute = window.location.pathname === "/tools" || window.location.pathname.startsWith("/tools/");
  const renderInShell = (children: ReactNode) => <Shell showToolFeedback={isToolsRoute}>{children}</Shell>;

  if (route === "home") return <main><HomePage /></main>;
  if (route === "tools") return renderInShell(<ToolsPage />);
  if (route === "cvKinetics") return renderInShell(<CvKineticsPage />);
  if (route === "theoreticalCapacity") return renderInShell(<TheoreticalCapacityPage />);
  if (route === "molecularWeight") return renderInShell(<MolecularWeightPage />);
  if (route === "reviewerTwo") return renderInShell(<ReviewerTwoPage />);
  if (route === "ratePerformance") return renderInShell(<RatePerformanceAnalysisPage />);
  if (route === "rateModelComparison") return renderInShell(<ModelComparisonPage />);
  if (route === "rateTransportLimitations") return renderInShell(<TransportLimitationPage />);
  if (route === "rateCharacteristicTime") return renderInShell(<CharacteristicTimePage />);
  if (route === "rateThicknessKinetics") return renderInShell(<ThicknessKineticsPage />);
  if (route === "rateCaAnalysis") return renderInShell(<CaRateAnalysisPage />);
  if (route === "rateEmpiricalModels") return renderInShell(<EmpiricalModelsPage />);
  if (route === "rateEnergyPower") return renderInShell(<EnergyPowerPage />);
  return renderInShell(<NotFoundPage />);
}

function Shell({ children, showToolFeedback }: { children: ReactNode; showToolFeedback: boolean }) {
  return <main><SiteHeader /><Suspense fallback={<RouteLoading />}>{children}</Suspense>{showToolFeedback && <ToolFeedbackPanel />}<SiteFooter /></main>;
}

function RouteLoading() {
  const { t } = useI18n();
  return <div className="route-loading" role="status">{t("common.loading")}</div>;
}
