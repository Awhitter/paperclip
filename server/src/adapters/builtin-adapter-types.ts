/**
 * Adapter types shipped with Paperclip core.
 *
 * External plugins may still override these types at runtime; the set is used
 * to mark override state and protect true built-ins from deletion.
 */
export const BUILTIN_ADAPTER_TYPES = new Set([
  "claude_local",
  "codex_local",
  "cursor",
  "gemini_local",
  "openclaw_gateway",
  "opencode_local",
  "pi_local",
  "process",
  "http",
]);
