import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolFeedbackPanel } from "../src/components/ToolFeedbackPanel";
import { I18nProvider } from "../src/i18n/I18nProvider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
let turnstileOptions: TurnstileWidgetOptions | null = null;

beforeEach(() => {
  vi.stubEnv("VITE_FEEDBACK_ENDPOINT", "https://feedback.example.workers.dev");
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "public-site-key");
  turnstileOptions = null;
  window.turnstile = {
    render: vi.fn((_container, options) => {
      turnstileOptions = options;
      return "widget-1";
    }),
    reset: vi.fn(),
    remove: vi.fn()
  };
  history.replaceState(null, "", "/tools/reviewer-two");
});

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  localStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete window.turnstile;
});

async function renderPanel(language: "en" | "zh" = "en") {
  localStorage.setItem("tmcc-language", language);
  const view = document.createElement("div");
  document.body.appendChild(view);
  const root = createRoot(view);
  roots.push(root);
  await act(async () => root.render(<I18nProvider><ToolFeedbackPanel /></I18nProvider>));
  return view;
}

async function setControl(control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const prototype = control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value);
    control.dispatchEvent(new Event("change", { bubbles: true }));
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("ToolFeedbackPanel", () => {
  it("renders the minimal English form and one-paragraph fallback contact", async () => {
    const view = await renderPanel();
    const contact = view.querySelector(".tool-feedback-contact");

    expect(view.querySelector("h2")?.textContent).toBe("Send feedback");
    expect(view.querySelector('label[for="tool-feedback-category"]')).not.toBeNull();
    expect(view.querySelector('label[for="tool-feedback-message"]')).not.toBeNull();
    expect(view.querySelector('label[for="tool-feedback-email"]')).not.toBeNull();
    expect(contact?.tagName).toBe("P");
    expect(contact?.textContent).toBe("Found an issue, got an unexpected result, or have a suggestion? Contact Dr. Wu at wui@vscht.cz");
    expect(contact?.textContent?.match(/Dr\. Wu/g)).toHaveLength(1);
    expect(contact?.querySelector("a")?.getAttribute("href")).toBe("mailto:wui@vscht.cz");
    expect(view.textContent).toContain("Do not submit unpublished manuscript content");
    expect(view.textContent).toContain("Cloudflare and Resend process submissions");
    expect(view.querySelector('input[type="file"]')).toBeNull();
    expect(view.querySelector('input[name*="key" i]')).toBeNull();
  });

  it("renders complete Chinese labels and confidentiality guidance", async () => {
    const view = await renderPanel("zh");
    expect(view.querySelector("h2")?.textContent).toBe("提交反馈");
    expect(view.textContent).toContain("请勿提交未公开的论文内容");
    expect(view.textContent).toContain("Cloudflare 和 Resend");
  });

  it("blocks invalid input before any network request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const view = await renderPanel();
    await setControl(view.querySelector("textarea")!, "too short");
    await submit(view.querySelector("form")!);

    expect(fetcher).not.toHaveBeenCalled();
    expect(view.querySelector("#tool-feedback-message-error")?.textContent)
      .toBe("Enter at least 20 characters.");
  });

  it("submits one verified payload, clears editable fields, and announces success", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, requestId: "request-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetcher);
    const view = await renderPanel();
    await setControl(view.querySelector("select")!, "suggestion");
    await setControl(view.querySelector("textarea")!, "Please add clearer export guidance.");
    await setControl(view.querySelector('input[type="email"]')!, "reader@example.org");
    act(() => turnstileOptions?.callback("verified-token"));

    await submit(view.querySelector("form")!);

    expect(fetcher).toHaveBeenCalledOnce();
    const payload = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload).toMatchObject({
      category: "suggestion",
      message: "Please add clearer export guidance.",
      replyEmail: "reader@example.org",
      pagePath: "/tools/reviewer-two",
      language: "en",
      turnstileToken: "verified-token"
    });
    expect(payload.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((view.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
    expect((view.querySelector('input[type="email"]') as HTMLInputElement).value).toBe("");
    expect(view.querySelector('[role="status"]')?.textContent).toContain("Thank you. Your feedback was sent.");
    expect(window.turnstile?.reset).toHaveBeenCalledWith("widget-1");
  });

  it("preserves visitor text and announces rate limiting", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "rate_limited" }), {
      status: 429,
      headers: { "content-type": "application/json" }
    })));
    const view = await renderPanel();
    await setControl(view.querySelector("textarea")!, "This message should remain after failure.");
    act(() => turnstileOptions?.callback("verified-token"));

    await submit(view.querySelector("form")!);

    expect((view.querySelector("textarea") as HTMLTextAreaElement).value)
      .toBe("This message should remain after failure.");
    expect(view.querySelector('[role="status"]')?.textContent)
      .toContain("Too many submissions. Wait a minute and try again.");
  });
});
