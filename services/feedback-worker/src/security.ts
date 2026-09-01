import type { Fetcher, WorkerEnv } from "./types";

const siteverifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function corsHeaders(origin: string, env: Pick<WorkerEnv, "ALLOWED_ORIGINS">): Headers | null {
  const allowedOrigins = new Set(
    env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean)
  );
  if (!origin || !allowedOrigins.has(origin)) return null;

  return new Headers({
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-origin": origin,
    "access-control-max-age": "86400",
    vary: "Origin"
  });
}

export async function deriveClientKey(ipAddress: string, salt: string): Promise<string> {
  const input = new TextEncoder().encode(`${salt}:${ipAddress}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyTurnstile(
  token: string,
  ipAddress: string,
  secret: string,
  fetcher: Fetcher = fetch
): Promise<boolean> {
  const body = new URLSearchParams({ secret, response: token });
  if (ipAddress && ipAddress !== "unknown") body.set("remoteip", ipAddress);

  try {
    const response = await fetcher(siteverifyUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    if (!response.ok) return false;
    const result = await response.json() as { success?: unknown };
    return result.success === true;
  } catch {
    return false;
  }
}
