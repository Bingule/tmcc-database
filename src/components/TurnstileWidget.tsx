import { useEffect, useRef } from "react";

type TurnstileWidgetProps = {
  siteKey: string;
  resetKey: number;
  onToken: (token: string) => void;
};

const scriptId = "tmcc-turnstile-script";
const scriptUrl = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let turnstileLoader: Promise<TurnstileApi> | null = null;

export function TurnstileWidget({ siteKey, resetKey, onToken }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let active = true;
    let api: TurnstileApi | null = null;

    void loadTurnstile().then((loadedApi) => {
      if (!active || !containerRef.current) return;
      api = loadedApi;
      widgetIdRef.current = loadedApi.render(containerRef.current, {
        sitekey: siteKey,
        theme: "light",
        callback: (token) => onTokenRef.current(token),
        "expired-callback": () => onTokenRef.current(""),
        "error-callback": () => onTokenRef.current("")
      });
    }).catch(() => {
      if (active) onTokenRef.current("");
    });

    return () => {
      active = false;
      if (api && widgetIdRef.current !== null) api.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetKey]);

  return <div className="turnstile-widget" ref={containerRef} />;
}

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileLoader) return turnstileLoader;

  turnstileLoader = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    const handleLoad = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile unavailable"));
    const handleError = () => {
      turnstileLoader = null;
      reject(new Error("Turnstile failed to load"));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!existing) {
      script.id = scriptId;
      script.src = scriptUrl;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
  return turnstileLoader;
}
