# @paperclipai/adapter-mastra-gateway

Paperclip adapter that invokes a Mastra workflow over HTTP.

## Why this exists

Mastra is an excellent agent execution runtime (TypeScript, Postgres-backed, AI SDK v5, MCP-native). It is deliberately not a governance layer. Paperclip is — companies, goals, issues, budgets, approvals, activity log. This adapter lets Paperclip govern Mastra-executed work without either system reinventing the other.

Split of responsibilities:

- **Paperclip** owns task identity, budget hard-stops, approval gates, session keys, activity log, per-agent quota windows.
- **Mastra** owns workflow step orchestration, LLM calls, tool use, memory, tracing (Langfuse).
- **This adapter** translates Paperclip's `AdapterExecutionContext` into a Mastra workflow request and translates the response back into `AdapterExecutionResult`.

## When to use

Use when:

- You want Paperclip to dispatch work to a Mastra workflow deployed on Vercel or any HTTP-reachable host.
- The workflow is idempotent per Paperclip `runId` (Mastra supports this; pass `runId` in the request body).
- You want unified budget / approval / audit semantics across multiple verticals (each vertical = one Paperclip company, one Mastra workflow URL).

Do not use when:

- Your Mastra workflow runs inside the same Node.js process as Paperclip (just call it directly; this adapter adds unnecessary HTTP overhead).
- You need persistent WebSocket streaming from the agent to Paperclip — use `openclaw-gateway` or build a streaming variant.

## Configuration

Required `adapterConfig` fields:

- `url` (string) — absolute HTTP(S) URL to the Mastra workflow endpoint. Example: `https://nurse-research.vercel.app/api/workflows/audience-research/run`
- `workflowId` (string) — workflow identifier passed to Mastra for explicit routing.

Optional:

- `headers` (object) — extra headers. Supports `authorization` / `x-api-key`.
- `authToken` (string) — shared bearer token. Merged into `Authorization: Bearer <token>` when not already set.
- `apiKey` (string) — shared API key. Sent as `x-api-key` header when set.
- `timeoutSec` (number, default 300) — adapter timeout.
- `payloadTemplate` (object) — extra fields merged into the request body.

## Request body shape

```jsonc
{
  "workflowId": "<from config>",
  "runId": "<paperclip runId>",
  "paperclip": {
    "runId": "...",
    "companyId": "...",
    "agentId": "...",
    "agentName": "...",
    "taskId": "...",
    "issueId": "...",
    "apiUrl": "..."
  },
  "context": { /* ctx.context */ },
  // ...merged from adapterConfig.payloadTemplate
}
```

## Response shape

The adapter accepts two response styles from Mastra:

### A) Terminal response (preferred for short workflows)

```jsonc
{
  "status": "ok",
  "result": {
    "summary": "text the assistant wants surfaced as a run summary",
    "text": "alternate summary field",
    "payload": { /* arbitrary workflow output, forwarded as resultJson */ },
    "meta": {
      "provider": "anthropic",
      "model": "claude-opus-4-6",
      "usage": { "inputTokens": 12345, "outputTokens": 678, "cachedInputTokens": 0 },
      "costUsd": 0.456
    }
  }
}
```

### B) Accepted + long-poll

```jsonc
{
  "status": "accepted",
  "waitUrl": "https://.../runs/<runId>"
}
```

The adapter will GET the `waitUrl` with the same auth headers until status flips to `ok`, `error`, or `timeout`.

### Error response

```jsonc
{
  "status": "error",
  "error": "descriptive message"
}
```

## What the adapter maps

- `ctx.runId` → request `runId` and `paperclip.runId`.
- `ctx.agent` → `paperclip.agentId`, `paperclip.agentName`, `paperclip.companyId`.
- `ctx.context.taskId`, `ctx.context.issueId`, `ctx.context.wakeReason` → top-level `paperclip.*` fields.
- `response.result.meta.usage` → `AdapterExecutionResult.usage`.
- `response.result.meta.costUsd` → `AdapterExecutionResult.costUsd`.
- `response.result.summary` / `text` → `AdapterExecutionResult.summary`.
- `response.result.payload` → `AdapterExecutionResult.resultJson`.

## Environment test

`testEnvironment` verifies:

1. `url` is present and parses as an HTTP(S) URL.
2. At least one of `authToken` / `apiKey` / `headers.authorization` is configured (warn otherwise).
3. A HEAD/GET probe to the workflow URL returns 2xx/4xx (not 5xx or connection failure).
4. `workflowId` is present.

## Future additions

- Streaming response support (SSE) for long-running workflows.
- Explicit cost-budget enforcement pre-check (fetch remaining budget from Paperclip, refuse if insufficient before making the call).
- Mastra OpenAPI spec validation of the response shape.

## Status

Scaffolded 2026-04-16. Not yet registered in the Paperclip server-side adapter registry. See `docs/reports/doc/2026-04-16-paperclip-katalyst-screenpipe-investigation.md` in the katailyst-1 repo for the decision trail.
