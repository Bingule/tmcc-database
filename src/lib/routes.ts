export type AppRoute = "home" | "tools" | "cvKinetics" | "theoreticalCapacity" | "molecularWeight" | "notFound";

const routes: Record<string, AppRoute> = {
  "/": "home",
  "/tools": "tools",
  "/tools/cv-kinetics": "cvKinetics",
  "/tools/theoretical-capacity": "theoreticalCapacity",
  "/tools/molecular-weight": "molecularWeight"
};

export function normalizePathname(pathname: string): AppRoute {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
  return routes[normalized] ?? "notFound";
}
