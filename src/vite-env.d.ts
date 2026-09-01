/// <reference types="vite/client" />

declare const __TMCC_BUILD_DATE__: string;

interface ImportMetaEnv {
  readonly VITE_FEEDBACK_ENDPOINT?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type TurnstileWidgetOptions = {
  sitekey: string;
  theme: "light";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

type TurnstileApi = {
  render(container: HTMLElement, options: TurnstileWidgetOptions): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

interface Window {
  turnstile?: TurnstileApi;
}
