import { describe, expect, it, vi } from "vitest";

const {
  findSecretArgvMatches,
  scanProcessList,
  runProcessSecretArgvCheck,
} = await import("../../../scripts/check-process-secret-argv.mjs");

describe("process secret argv check", () => {
  it("detects direct secret flags and env assignments", () => {
    expect(findSecretArgvMatches("node server.js --api-secret shh")).toContain("secret flag");
    expect(findSecretArgvMatches("env CLOUDINARY_API_SECRET=shh node mcp.js")).toContain("secret env assignment");
    expect(findSecretArgvMatches("curl -H 'Authorization: Bearer shh'")).toContain("authorization bearer value");
  });

  it("allows explicit env and secret references", () => {
    expect(findSecretArgvMatches("node server.js --api-secret $CLOUDINARY_API_SECRET")).toEqual([]);
    expect(findSecretArgvMatches("node server.js --api-secret secret:CLOUDINARY_API_SECRET")).toEqual([]);
    expect(findSecretArgvMatches("env KATAILYST_MCP_TOKEN=$KATAILYST_MCP_TOKEN node mcp.js")).toEqual([]);
  });

  it("reports only pid and pattern labels", () => {
    const findings = scanProcessList(`
      101 node server.js --token super-secret-token
      102 node server.js --token $TOKEN
    `);

    expect(findings).toEqual([{ pid: "101", matches: ["secret flag"] }]);
  });

  it("fails without printing command lines or secret values", () => {
    const execFile = vi.fn(() => "201 node server.js --api-key hidden-value\n");
    const log = vi.fn();
    const error = vi.fn();

    const exitCode = runProcessSecretArgvCheck({
      execFile,
      log,
      error,
      ignorePids: [],
    });

    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith("ERROR: Potential secrets found in process argv:\n");
    expect(error).toHaveBeenCalledWith("  pid 201: matched secret flag");
    expect(error.mock.calls.flat().join("\n")).not.toContain("hidden-value");
    expect(error.mock.calls.flat().join("\n")).not.toContain("--api-key");
  });
});
