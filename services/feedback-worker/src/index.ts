import { buildEmail, sendFeedbackEmail } from "./email";
import { corsHeaders, deriveClientKey, verifyTurnstile } from "./security";
import type { FeedbackLogger, Fetcher, WorkerEnv } from "./types";
import { parseFeedbackPayload } from "./validation";

type FeedbackHandlerDependencies = {
  fetcher?: Fetcher;
  logger?: FeedbackLogger;
  requestId?: () => string;
};

const defaultLogger: FeedbackLogger = {
  info: (entry) => console.info(JSON.stringify(entry)),
  error: (entry) => console.error(JSON.stringify(entry))
};

export function createFeedbackHandler(dependencies: FeedbackHandlerDependencies = {}) {
  const fetcher = dependencies.fetcher ?? fetch;
  const logger = dependencies.logger ?? defaultLogger;
  const createRequestId = dependencies.requestId ?? (() => crypto.randomUUID());

  return {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
      const requestId = createRequestId();
      const origin = request.headers.get("origin") ?? "";
      const cors = corsHeaders(origin, env);
      if (!cors) return jsonResponse({ code: "forbidden", requestId }, 403, null, requestId);

      if (request.method === "OPTIONS") {
        const headers = new Headers(cors);
        headers.set("x-request-id", requestId);
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== "POST") {
        return jsonResponse({ code: "method_not_allowed", requestId }, 405, cors, requestId);
      }
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        return jsonResponse({ code: "unsupported_media", requestId }, 415, cors, requestId);
      }

      try {
        const parsed = parseFeedbackPayload(await readJson(request));
        if (!parsed.ok) return jsonResponse({ code: parsed.code, requestId }, 400, cors, requestId);

        const ipAddress = request.headers.get("cf-connecting-ip") ?? "unknown";
        const clientKey = await deriveClientKey(ipAddress, env.RATE_LIMIT_SALT);
        const rateLimit = await env.FEEDBACK_RATE_LIMITER.limit({ key: clientKey });
        if (!rateLimit.success) {
          const headers = new Headers(cors);
          headers.set("retry-after", "60");
          return jsonResponse({ code: "rate_limited", requestId }, 429, headers, requestId);
        }

        const verified = await verifyTurnstile(
          parsed.value.turnstileToken,
          ipAddress,
          env.TURNSTILE_SECRET_KEY,
          fetcher
        );
        if (!verified) {
          return jsonResponse({ code: "turnstile_failed", requestId }, 403, cors, requestId);
        }

        const email = buildEmail(parsed.value, env.FEEDBACK_RECIPIENT, env.FEEDBACK_FROM);
        const delivered = await sendFeedbackEmail(email, env.RESEND_API_KEY, fetcher);
        if (!delivered) {
          logger.error({ event: "feedback_delivery_failed", requestId });
          return jsonResponse({ code: "delivery_failed", requestId }, 502, cors, requestId);
        }

        logger.info({
          event: "feedback_sent",
          requestId,
          category: parsed.value.category,
          pagePath: parsed.value.pagePath
        });
        return jsonResponse({ ok: true, requestId }, 200, cors, requestId);
      } catch {
        logger.error({ event: "feedback_request_failed", requestId });
        return jsonResponse({ code: "service_unavailable", requestId }, 503, cors, requestId);
      }
    }
  };
}

async function readJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 16_384) return null;
  const body = await request.text();
  if (body.length > 16_384) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  baseHeaders: Headers | null,
  requestId: string
): Response {
  const headers = new Headers(baseHeaders ?? undefined);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-request-id", requestId);
  return new Response(JSON.stringify(body), { status, headers });
}

export default createFeedbackHandler();
