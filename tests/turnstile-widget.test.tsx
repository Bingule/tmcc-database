import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TurnstileWidget } from "../src/components/TurnstileWidget";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type TurnstileApi = {
  render: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

const roots: Root[] = [];

beforeEach(() => {
  delete (window as typeof window & { turnstile?: TurnstileApi }).turnstile;
  document.head.querySelector("#tmcc-turnstile-script")?.remove();
});

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  document.head.querySelector("#tmcc-turnstile-script")?.remove();
  delete (window as typeof window & { turnstile?: TurnstileApi }).turnstile;
});

function createApi(): TurnstileApi {
  return {
    render: vi.fn().mockReturnValue("widget-1"),
    reset: vi.fn(),
    remove: vi.fn()
  };
}

describe("TurnstileWidget", () => {
  it("renders explicitly, reports token lifecycle, resets, and removes the widget", async () => {
    const api = createApi();
    (window as typeof window & { turnstile: TurnstileApi }).turnstile = api;
    const onToken = vi.fn();
    const view = document.createElement("div");
    document.body.appendChild(view);
    const root = createRoot(view);
    roots.push(root);

    await act(async () => root.render(
      <TurnstileWidget siteKey="public-site-key" resetKey={0} onToken={onToken} />
    ));

    expect(api.render).toHaveBeenCalledOnce();
    const [container, options] = api.render.mock.calls[0];
    expect(container).toBe(view.querySelector(".turnstile-widget"));
    expect(options).toMatchObject({ sitekey: "public-site-key", theme: "light" });

    act(() => options.callback("verified-token"));
    act(() => options["expired-callback"]());
    act(() => options["error-callback"]());
    expect(onToken.mock.calls).toEqual([["verified-token"], [""], [""]]);

    await act(async () => root.render(
      <TurnstileWidget siteKey="public-site-key" resetKey={1} onToken={onToken} />
    ));
    expect(api.reset).toHaveBeenCalledWith("widget-1");

    await act(async () => root.unmount());
    roots.pop();
    expect(api.remove).toHaveBeenCalledWith("widget-1");
  });

  it("loads the explicit-render script once for concurrent widgets", async () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);
    const firstRoot = createRoot(first);
    const secondRoot = createRoot(second);
    roots.push(firstRoot, secondRoot);

    await act(async () => {
      firstRoot.render(<TurnstileWidget siteKey="key" resetKey={0} onToken={vi.fn()} />);
      secondRoot.render(<TurnstileWidget siteKey="key" resetKey={0} onToken={vi.fn()} />);
    });

    const scripts = document.head.querySelectorAll<HTMLScriptElement>("#tmcc-turnstile-script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");

    const api = createApi();
    (window as typeof window & { turnstile: TurnstileApi }).turnstile = api;
    await act(async () => scripts[0].dispatchEvent(new Event("load")));
    expect(api.render).toHaveBeenCalledTimes(2);
  });
});
