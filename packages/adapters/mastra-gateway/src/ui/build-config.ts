import type { CreateConfigValues } from "@paperclipai/adapter-utils";

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Translate UI-form values into the adapterConfig object persisted on an agent.
 *
 * Required (at hire time):
 *   - url: absolute HTTP(S) URL to the Mastra workflow run endpoint
 *   - workflowId: stable identifier for the Mastra workflow being invoked
 *
 * Optional: headers (object JSON in payloadTemplateJson field), payloadTemplate,
 * timeout overrides. These are free-form and passed straight through so the
 * adapter's execute() can read them.
 */
export function buildMastraGatewayConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.url) ac.url = v.url;

  // workflowId is required by execute(). Pull from extraArgs when present —
  // we reuse extraArgs as a free-form string field in the generic create-agent
  // form rather than adding a bespoke field for v1. UI-side callers who want a
  // typed field can bypass this helper and write adapterConfig directly.
  const extra = (v.extraArgs ?? "").trim();
  if (extra) ac.workflowId = extra;

  ac.timeoutSec = 300;
  ac.waitIntervalMs = 2000;

  const payloadTemplate = parseJsonObject(v.payloadTemplateJson ?? "");
  if (payloadTemplate) ac.payloadTemplate = payloadTemplate;

  return ac;
}
