import pc from "picocolors";

function truncate(value: string, max = 240): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

/**
 * Format a stdout line emitted by the mastra-gateway adapter for CLI viewing.
 *
 * Adapter log lines are all prefixed with `[mastra-gateway]`. This formatter
 * colors them consistently with the other adapters.
 */
export function formatMastraStreamEvent(raw: string, debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  if (!line.startsWith("[mastra-gateway")) {
    console.log(line);
    return;
  }

  if (line.includes("terminal response status=ok")) {
    console.log(pc.green(line));
    return;
  }
  if (line.includes("terminal response status=error") || line.toLowerCase().includes("timeout")) {
    console.log(pc.red(line));
    return;
  }
  if (line.includes("POST ")) {
    console.log(pc.cyan(line));
    return;
  }
  if (line.includes("accepted, polling")) {
    console.log(pc.yellow(line));
    return;
  }

  if (debug) {
    console.log(pc.dim(line));
  } else {
    console.log(pc.dim(truncate(line)));
  }
}
