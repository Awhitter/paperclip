export function parseStdoutLine(line, ts) {
  if (line.startsWith("assistant:")) {
    return [{ kind: "assistant", ts, text: line.slice("assistant:".length).trim() }];
  }
  return [{ kind: "stdout", ts, text: line }];
}
