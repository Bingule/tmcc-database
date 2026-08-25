import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/I18nProvider";

export function withI18n(element: ReactElement) {
  return <I18nProvider>{element}</I18nProvider>;
}

export function renderWithI18n(element: ReactElement) {
  return renderToStaticMarkup(withI18n(element));
}
