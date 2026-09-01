export type AppRoute =
  | "home"
  | "tools"
  | "cvKinetics"
  | "theoreticalCapacity"
  | "molecularWeight"
  | "reviewerTwo"
  | "ratePerformance"
  | "rateModelComparison"
  | "rateTransportLimitations"
  | "rateCharacteristicTime"
  | "rateThicknessKinetics"
  | "rateCaAnalysis"
  | "rateEmpiricalModels"
  | "rateEnergyPower"
  | "notFound";

const routes: Record<string, AppRoute> = {
  "/": "home",
  "/tools": "tools",
  "/tools/cv-kinetics": "cvKinetics",
  "/tools/theoretical-capacity": "theoreticalCapacity",
  "/tools/molecular-weight": "molecularWeight",
  "/tools/reviewer-two": "reviewerTwo",
  "/tools/rate-performance": "ratePerformance",
  "/tools/rate-performance/model-comparison": "rateModelComparison",
  "/tools/rate-performance/transport-limitations": "rateTransportLimitations",
  "/tools/rate-performance/characteristic-time": "rateCharacteristicTime",
  "/tools/rate-performance/thickness-kinetics": "rateThicknessKinetics",
  "/tools/rate-performance/ca-analysis": "rateCaAnalysis",
  "/tools/rate-performance/empirical-models": "rateEmpiricalModels",
  "/tools/rate-performance/energy-power": "rateEnergyPower"
};

export function normalizePathname(pathname: string): AppRoute {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
  return routes[normalized] ?? "notFound";
}
