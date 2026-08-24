import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { normalizePathname } from "./lib/routes";
import { HomePage } from "./pages/HomePage";
import { MolecularWeightPage } from "./pages/MolecularWeightPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { TheoreticalCapacityPage } from "./pages/TheoreticalCapacityPage";
import { ToolsPage } from "./pages/ToolsPage";
import { CvKineticsPage } from "./pages/CvKineticsPage";

export default function App() {
  const route = normalizePathname(window.location.pathname);

  if (route === "home") return <main><HomePage /></main>;
  if (route === "tools") return <Shell><ToolsPage /></Shell>;
  if (route === "cvKinetics") return <Shell><CvKineticsPage /></Shell>;
  if (route === "theoreticalCapacity") return <Shell><TheoreticalCapacityPage /></Shell>;
  if (route === "molecularWeight") return <Shell><MolecularWeightPage /></Shell>;
  return <Shell><NotFoundPage /></Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main><SiteHeader />{children}<SiteFooter /></main>;
}
