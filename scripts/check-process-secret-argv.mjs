#!/usr/bin/env node
/**
 * check-process-secret-argv.mjs
 *
 * Local hygiene check for MCP and adapter launch patterns that pass secrets
 * directly on the process command line. argv is visible to other local process
 * inspectors, so long-lived tokens should be passed through env/secret refs.
 *
 * The check intentionally reports only the PID and matched pattern label. It
 * never prints the command line or the secret-like value it found.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const SAFE_VALUE_RE = /^(?:\$[A-Z_][A-Z0-9_]*|\$\{[A-Z_][A-Z0-9_]*\}|env:[A-Z_][A-Z0-9_]*|secret:[A-Z_][A-Z0-9_]*|<redacted>|redacted|\*+|x+)$/i;

export const DEFAULT_SECRET_ARGV_PATTERNS = [
  {
    label: "secret flag",
    regex: /(?:^|\s)--(?:api[-_]?secret|api[-_]?key|auth[-_]?token|bearer[-_]?token|client[-_]?secret|cloudinary[-_]?api[-_]?secret|password|pat|token)(?:=|\s+)([^\s]+)/gi,
  },
  {
    label: "secret env assignment",
    regex: /(?:^|\s)(?:[A-Z0-9_]*(?:API[-_]?KEY|API[-_]?SECRET|AUTH[-_]?TOKEN|BEARER[-_]?TOKEN|CLIENT[-_]?SECRET|PASSWORD|PAT|TOKEN|SECRET))=([^\s]+)/gi,
  },
  {
    label: "authorization bearer value",
    regex: /authorization:\s*bearer\s+([^\s'"]+)/gi,
  },
];

function isSafeReference(value) {
  return SAFE_VALUE_RE.test(value.trim());
}

export function findSecretArgvMatches(command, patterns = DEFAULT_SECRET_ARGV_PATTERNS) {
  const matches = [];

  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(command)) !== null) {
      const value = match[1] ?? "";
      if (!value || isSafeReference(value)) continue;
      matches.push(pattern.label);
      break;
    }
  }

  return matches;
}

export function scanProcessList(psOutput, options = {}) {
  const ignorePids = new Set((options.ignorePids ?? []).map(String));
  const findings = [];

  for (const line of psOutput.split("\n")) {
    const parsed = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!parsed) continue;

    const [, pid, command] = parsed;
    if (ignorePids.has(pid)) continue;

    const matches = findSecretArgvMatches(command, options.patterns);
    if (matches.length > 0) {
      findings.push({ pid, matches });
    }
  }

  return findings;
}

export function runProcessSecretArgvCheck({
  execFile = execFileSync,
  log = console.log,
  error = console.error,
  ignorePids = [process.pid, process.ppid].filter(Boolean),
} = {}) {
  const output = execFile("ps", ["-axo", "pid=,command="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const findings = scanProcessList(output, { ignorePids });

  if (findings.length === 0) {
    log("  ✓  No process argv secrets found.");
    return 0;
  }

  error("ERROR: Potential secrets found in process argv:\n");
  for (const finding of findings) {
    error(`  pid ${finding.pid}: matched ${finding.matches.join(", ")}`);
  }
  error("\nMove long-lived values into env variables or Paperclip secret refs before launching the process.");
  return 1;
}

function main() {
  process.exit(runProcessSecretArgvCheck());
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}
