export const type = "mastra_gateway";
export const label = "Mastra Gateway";

export const models: { id: string; label: string }[] = [];

export const agentConfigurationDoc = `# mastra_gateway agent configuration

Adapter: mastra_gateway

Use when:
- You want Paperclip to dispatch work to a Mastra workflow over HTTP.
- The target Mastra workflow is deployed on Vercel or any HTTP-reachable host.
- You want unified budget / approval / audit semantics across multiple verticals.

Don't use when:
- Your Mastra workflow runs in-process with Paperclip — call it directly instead.
- You require persistent WebSocket streaming from the run — use openclaw-gateway.

Core fields:
- url (string, required): absolute HTTP(S) URL to the Mastra workflow run endpoint.
- workflowId (string, required): workflow identifier passed in the request body.
- headers (object, optional): extra outbound headers. Supports authorization / x-api-key.
- authToken (string, optional): shared bearer token; merged into Authorization header.
- apiKey (string, optional): shared API key; sent as x-api-key header.

Request behavior:
- payloadTemplate (object, optional): additional fields merged into the outbound request body.
- timeoutSec (number, optional): total adapter timeout in seconds (default 300).
- waitTimeoutMs (number, optional): long-poll timeout for "accepted" responses (default timeoutSec * 1000).
- waitIntervalMs (number, optional): long-poll interval (default 2000).

Standard outbound payload additions:
- paperclip (object): standardized Paperclip context added to every request
  - paperclip.runId, paperclip.companyId, paperclip.agentId, paperclip.agentName
  - paperclip.taskId, paperclip.issueId, paperclip.wakeReason
  - paperclip.apiUrl (Paperclip API base URL, when advertised)

Response contract (terminal):
- status: "ok" | "error" — required
- result.summary (string, optional): surfaced as the run summary
- result.text (string, optional): fallback summary field
- result.payload (object, optional): forwarded as resultJson
- result.meta.usage: { inputTokens, outputTokens, cachedInputTokens? } — required for cost accounting
- result.meta.costUsd (number, optional): when the workflow knows its cost
- result.meta.provider (string, optional): e.g. "anthropic", "openai"
- result.meta.model (string, optional): e.g. "claude-opus-4-6"

Response contract (long-poll):
- status: "accepted" — required
- waitUrl (string): URL the adapter will GET until status flips to ok/error.

Idempotency:
- Paperclip's ctx.runId is forwarded as the Mastra run identifier. The workflow
  must be idempotent per runId — the adapter will not retry on timeout.
`;
