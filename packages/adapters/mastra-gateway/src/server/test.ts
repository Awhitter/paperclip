import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toStringRecord(value: unknown): Record<string, string> {
  const parsed = parseObject(value);
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(parsed)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

function headerMapHasIgnoreCase(headers: Record<string, string>, key: string): boolean {
  return Object.keys(headers).some((entryKey) => entryKey.toLowerCase() === key.toLowerCase());
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const urlValue = asString(config.url, "").trim();

  if (!urlValue) {
    checks.push({
      code: "mastra_gateway_url_missing",
      level: "error",
      message: "Mastra gateway adapter requires an HTTP URL.",
      hint: "Set adapterConfig.url to http(s)://host/path/to/workflow/run.",
    });
    return {
      adapterType: ctx.adapterType,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  let url: URL | null = null;
  try {
    url = new URL(urlValue);
  } catch {
    checks.push({
      code: "mastra_gateway_url_invalid",
      level: "error",
      message: `Invalid URL: ${urlValue}`,
    });
  }

  if (url && url.protocol !== "http:" && url.protocol !== "https:") {
    checks.push({
      code: "mastra_gateway_url_protocol_invalid",
      level: "error",
      message: `Unsupported URL protocol: ${url.protocol}`,
      hint: "Use http:// or https://.",
    });
  }

  if (url) {
    checks.push({
      code: "mastra_gateway_url_valid",
      level: "info",
      message: `Configured Mastra workflow URL: ${url.toString()}`,
    });

    if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      checks.push({
        code: "mastra_gateway_plaintext_remote_http",
        level: "warn",
        message: "Mastra workflow URL uses plaintext http:// on a non-loopback host.",
        hint: "Prefer https:// for remote Mastra deployments.",
      });
    }
  }

  const workflowId = nonEmpty(config.workflowId);
  if (!workflowId) {
    checks.push({
      code: "mastra_gateway_workflow_id_missing",
      level: "error",
      message: "Mastra gateway adapter requires adapterConfig.workflowId.",
      hint: "Set workflowId to the Mastra workflow identifier (e.g. 'audience-research').",
    });
  } else {
    checks.push({
      code: "mastra_gateway_workflow_id_set",
      level: "info",
      message: `Configured workflowId: ${workflowId}`,
    });
  }

  const headers = toStringRecord(config.headers);
  const authToken = nonEmpty(config.authToken);
  const apiKey = nonEmpty(config.apiKey);
  const hasAuth =
    Boolean(authToken) ||
    Boolean(apiKey) ||
    headerMapHasIgnoreCase(headers, "authorization") ||
    headerMapHasIgnoreCase(headers, "x-api-key");

  if (hasAuth) {
    checks.push({
      code: "mastra_gateway_auth_present",
      level: "info",
      message: "Mastra gateway credentials are configured.",
    });
  } else {
    checks.push({
      code: "mastra_gateway_auth_missing",
      level: "warn",
      message: "No auth detected in Mastra adapter config.",
      hint: "Set adapterConfig.authToken, adapterConfig.apiKey, or headers.authorization if your workflow endpoint requires auth.",
    });
  }

  // Quick reachability probe (HEAD, then fallback to GET with short timeout).
  if (url) {
    const probeHeaders: Record<string, string> = { ...headers };
    if (authToken && !headerMapHasIgnoreCase(probeHeaders, "authorization")) {
      probeHeaders.authorization = /^bearer\s+/i.test(authToken) ? authToken : `Bearer ${authToken}`;
    }
    if (apiKey && !headerMapHasIgnoreCase(probeHeaders, "x-api-key")) {
      probeHeaders["x-api-key"] = apiKey;
    }

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 3_000);
    try {
      const response = await fetch(url.toString(), {
        method: "HEAD",
        headers: probeHeaders,
        signal: abort.signal,
      });
      if (response.ok || response.status < 500) {
        checks.push({
          code: "mastra_gateway_probe_ok",
          level: "info",
          message: `Mastra workflow endpoint reachable (HTTP ${response.status}).`,
        });
      } else {
        checks.push({
          code: "mastra_gateway_probe_5xx",
          level: "warn",
          message: `Mastra workflow endpoint returned HTTP ${response.status}.`,
          hint: "Check the Mastra deployment health and authentication.",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      checks.push({
        code: "mastra_gateway_probe_failed",
        level: "warn",
        message: `Mastra workflow probe failed: ${message}`,
        hint: "Verify the URL is reachable from the Paperclip server host.",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
