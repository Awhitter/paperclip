import type { StdoutLineParser, TranscriptEntry } from "@paperclipai/adapter-utils";

/**
 * Parse a stdout line emitted by the mastra-gateway adapter into transcript entries.
 *
 * The adapter logs are all plaintext, prefixed with `[mastra-gateway]` or
 * `[mastra-gateway:event]`. We surface them as `stdout` entries so the
 * dashboard can render them verbatim without pretending they're structured
 * assistant output.
 */
export const parseMastraGatewayStdoutLine: StdoutLineParser = (
  line: string,
  ts: string,
): TranscriptEntry[] => {
  const trimmed = line.trim();
  if (!trimmed) return [];
  // Everything mastra-gateway writes is an operational log line; map 1:1.
  return [{ kind: "stdout", ts, text: trimmed }];
};
