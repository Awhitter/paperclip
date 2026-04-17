import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import { asNumber, asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

type MastraPaperclipContext = {
  runId: string;
  companyId: string;
  agentId: string;
  agentName: string;
  taskId: string | null;
  issueId: string | null;
  wakeReason: string | null;
  apiUrl: string | null;
};

type MastraResponseMeta = {
  provider?: string;
  model?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
  };
  costUsd?: number;
};

type MastraTerminalResponse = {
  status: "ok" | "error";
  result?: {
    summary?: string;
    text?: string;
    payload?: Record<string, unknown>;
    meta?: MastraResponseMeta;
  };
  error?: string;
};

type MastraAcceptedResponse = {
  status: "accepted";
  waitUrl: string;
};

type MastraResponse = MastraTerminalResponse | MastraAcceptedResponse;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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

function toAuthorizationHeaderValue(rawToken: string): string {
  const trimmed = rawToken.trim();
  if (!trimmed) return trimmed;
  return /^bearer\s+/i.test(trimmed) ? trimmed : `Bearer ${trimmed}`;
}

function buildPaperclipContext(ctx: AdapterExecutionContext): MastraPaperclipContext {
  const { runId, agent, context, config } = ctx;
  const apiUrl = nonEmpty(config.paperclipApiUrl);
  return {
    runId,
    companyId: agent.companyId,
    agentId: agent.id,
    agentName: agent.name,
    taskId: nonEmpty(context.taskId) ?? nonEmpty(context.issueId),
    issueId: nonEmpty(context.issueId),
    wakeReason: nonEmpty(context.wakeReason),
    apiUrl,
  };
}

function buildRequestBody(
  ctx: AdapterExecutionContext,
  paperclip: MastraPaperclipContext,
  workflowId: string,
  payloadTemplate: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...payloadTemplate,
    workflowId,
    runId: paperclip.runId,
    paperclip,
    context: ctx.context,
  };
}

async function parseJsonResponse(response: Response): Promise<MastraResponse | null> {
  try {
    const data = (await response.json()) as unknown;
    if (!asRecord(data)) return null;
    const status = nonEmpty((data as Record<string, unknown>).status)?.toLowerCase();
    if (status === "ok" || status === "error" || status === "accepted") {
      return data as MastraResponse;
    }
    return null;
  } catch {
    return null;
  }
}

function buildUsage(meta: MastraResponseMeta | undefined): AdapterExecutionResult["usage"] | undefined {
  if (!meta?.usage) return undefined;
  const inputTokens = asNumber(meta.usage.inputTokens ?? 0, 0);
  const outputTokens = asNumber(meta.usage.outputTokens ?? 0, 0);
  const cachedInputTokens = asNumber(meta.usage.cachedInputTokens ?? 0, 0);
  if (inputTokens <= 0 && outputTokens <= 0 && cachedInputTokens <= 0) return undefined;
  return {
    inputTokens,
    outputTokens,
    ...(cachedInputTokens > 0 ? { cachedInputTokens } : {}),
  };
}

function terminalToResult(
  payload: MastraTerminalResponse,
  rawPayload: unknown,
): AdapterExecutionResult {
  if (payload.status === "error") {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: payload.error ?? "Mastra workflow returned status=error",
      errorCode: "mastra_gateway_workflow_error",
      resultJson: asRecord(rawPayload),
    };
  }

  const result = payload.result ?? {};
  const meta = result.meta ?? {};
  const usage = buildUsage(meta);
  const summary = nonEmpty(result.summary) ?? nonEmpty(result.text) ?? null;
  const provider = nonEmpty(meta.provider) ?? "mastra";
  const model = nonEmpty(meta.model);
  const costUsd = asNumber(meta.costUsd ?? 0, 0);

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    provider,
    ...(model ? { model } : {}),
    ...(usage ? { usage } : {}),
    ...(costUsd > 0 ? { costUsd } : {}),
    resultJson: asRecord(rawPayload) ?? (result.payload as Record<string, unknown> | undefined) ?? null,
    ...(summary ? { summary } : {}),
  };
}

async function waitForTerminal(params: {
  url: string;
  headers: Record<string, string>;
  waitTimeoutMs: number;
  waitIntervalMs: number;
  onLog: AdapterExecutionContext["onLog"];
}): Promise<{ ok: true; payload: MastraTerminalResponse; raw: unknown } | { ok: false; reason: "timeout" | "bad_response"; detail: string }> {
  const deadline = Date.now() + params.waitTimeoutMs;
  let lastDetail = "no response yet";

  while (Date.now() < deadline) {
    let response: Response;
    try {
      response = await fetch(params.url, {
        method: "GET",
        headers: params.headers,
      });
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err);
      await params.onLog("stderr", `[mastra-gateway] poll error: ${lastDetail}\n`);
      await new Promise((resolve) => setTimeout(resolve, params.waitIntervalMs));
      continue;
    }

    const raw = await response.clone().json().catch(() => null);
    const parsed = await parseJsonResponse(response);
    if (!parsed) {
      lastDetail = `unparseable response (HTTP ${response.status})`;
      await params.onLog("stdout", `[mastra-gateway] poll: ${lastDetail}\n`);
      await new Promise((resolve) => setTimeout(resolve, params.waitIntervalMs));
      continue;
    }

    if (parsed.status === "ok" || parsed.status === "error") {
      return { ok: true, payload: parsed, raw };
    }

    // still "accepted" — keep polling
    await new Promise((resolve) => setTimeout(resolve, params.waitIntervalMs));
  }

  return { ok: false, reason: "timeout", detail: lastDetail };
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const urlValue = asString(ctx.config.url, "").trim();
  if (!urlValue) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "Mastra gateway adapter missing url",
      errorCode: "mastra_gateway_url_missing",
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlValue);
  } catch {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Invalid Mastra workflow URL: ${urlValue}`,
      errorCode: "mastra_gateway_url_invalid",
    };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Unsupported Mastra workflow URL protocol: ${parsedUrl.protocol}`,
      errorCode: "mastra_gateway_url_protocol",
    };
  }

  const workflowId = nonEmpty(ctx.config.workflowId);
  if (!workflowId) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "Mastra gateway adapter missing workflowId in adapterConfig",
      errorCode: "mastra_gateway_workflow_id_missing",
    };
  }

  const timeoutSec = Math.max(1, Math.floor(asNumber(ctx.config.timeoutSec, 300)));
  const timeoutMs = timeoutSec * 1000;
  const waitTimeoutMs = Math.max(1_000, Math.floor(asNumber(ctx.config.waitTimeoutMs, timeoutMs)));
  const waitIntervalMs = Math.max(250, Math.floor(asNumber(ctx.config.waitIntervalMs, 2_000)));

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...toStringRecord(ctx.config.headers),
  };
  const authToken = nonEmpty(ctx.config.authToken);
  const apiKey = nonEmpty(ctx.config.apiKey);
  if (authToken && !headerMapHasIgnoreCase(headers, "authorization")) {
    headers.authorization = toAuthorizationHeaderValue(authToken);
  }
  if (apiKey && !headerMapHasIgnoreCase(headers, "x-api-key")) {
    headers["x-api-key"] = apiKey;
  }

  const payloadTemplate = parseObject(ctx.config.payloadTemplate);
  const paperclipContext = buildPaperclipContext(ctx);
  const body = buildRequestBody(ctx, paperclipContext, workflowId, payloadTemplate);

  if (ctx.onMeta) {
    await ctx.onMeta({
      adapterType: "mastra_gateway",
      command: "mastra",
      commandArgs: ["http", parsedUrl.toString(), workflowId],
      context: ctx.context,
    });
  }

  await ctx.onLog(
    "stdout",
    `[mastra-gateway] POST ${parsedUrl.toString()} workflowId=${workflowId} runId=${ctx.runId}\n`,
  );

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);

  let initialResponse: Response;
  try {
    initialResponse = await fetch(parsedUrl.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: abort.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = abort.signal.aborted || message.toLowerCase().includes("timeout");
    return {
      exitCode: 1,
      signal: null,
      timedOut,
      errorMessage: timedOut
        ? `Mastra workflow call timed out after ${timeoutMs}ms`
        : `Mastra workflow call failed: ${message}`,
      errorCode: timedOut ? "mastra_gateway_timeout" : "mastra_gateway_request_failed",
    };
  } finally {
    clearTimeout(timer);
  }

  const rawInitial = await initialResponse.clone().json().catch(() => null);

  if (!initialResponse.ok) {
    await ctx.onLog(
      "stderr",
      `[mastra-gateway] HTTP ${initialResponse.status} from ${parsedUrl.toString()}\n`,
    );
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: `Mastra workflow returned HTTP ${initialResponse.status}`,
      errorCode: "mastra_gateway_http_error",
      resultJson: asRecord(rawInitial),
    };
  }

  const parsed = await parseJsonResponse(initialResponse);
  if (!parsed) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "Mastra workflow response was unparseable or missing status",
      errorCode: "mastra_gateway_response_unparseable",
      resultJson: asRecord(rawInitial),
    };
  }

  if (parsed.status === "ok" || parsed.status === "error") {
    await ctx.onLog(
      "stdout",
      `[mastra-gateway] terminal response status=${parsed.status}\n`,
    );
    return terminalToResult(parsed, rawInitial);
  }

  // status === "accepted" → long-poll. TS narrowing across the earlier early-
  // returns isn't enough here, so narrow explicitly.
  const accepted = parsed as MastraAcceptedResponse;
  await ctx.onLog(
    "stdout",
    `[mastra-gateway] accepted, polling ${accepted.waitUrl} every ${waitIntervalMs}ms (max ${waitTimeoutMs}ms)\n`,
  );

  const waited = await waitForTerminal({
    url: accepted.waitUrl,
    headers,
    waitTimeoutMs,
    waitIntervalMs,
    onLog: ctx.onLog,
  });

  if (!waited.ok) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: waited.reason === "timeout",
      errorMessage:
        waited.reason === "timeout"
          ? `Mastra workflow did not terminate within ${waitTimeoutMs}ms (last detail: ${waited.detail})`
          : `Mastra workflow poll failed: ${waited.detail}`,
      errorCode:
        waited.reason === "timeout"
          ? "mastra_gateway_wait_timeout"
          : "mastra_gateway_wait_bad_response",
    };
  }

  return terminalToResult(waited.payload, waited.raw);
}
