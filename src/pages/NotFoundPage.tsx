import { Breadcrumbs } from "../components/Breadcrumbs";

export function NotFoundPage() {
  return (
    <section className="tools-page">
      <Breadcrumbs current="Not found" />
      <h1>Not found</h1>
    </section>
  );
}
