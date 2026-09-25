import { renderToStaticMarkup } from "react-dom/server";
import { expect,it } from "vitest";
import { I18nProvider } from "../src/i18n/I18nProvider";
import CrystalDescriptionPage from "../src/tools/crystal-description/CrystalDescriptionPage";
import { normalizePathname } from "../src/lib/routes";

it("routes direct and trailing-slash visits to the crystal tool",()=>{
  expect(normalizePathname('/tools/crystal-description')).toBe('crystalDescription');
  expect(normalizePathname('/tools/crystal-description/')).toBe('crystalDescription');
  expect(normalizePathname('/tools/cv-kinetics')).toBe('cvKinetics');
});
it("embeds the public service with a fallback and data-processing notice",()=>{
  const html=renderToStaticMarkup(<I18nProvider><CrystalDescriptionPage /></I18nProvider>);
  expect(html).toContain('https://crystal-description.streamlit.app/?embed=true');
  expect(html).toContain('https://github.com/Bingule/crystal-description');
  expect(html).toContain('role="note"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('loading="lazy"');
});
