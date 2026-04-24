// @vitest-environment node

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { HeartbeatRun } from "@paperclipai/shared";
import { RunContextCard } from "./RunContextCard";

function makeRun(): Pick<HeartbeatRun, "id" | "contextSnapshot"> {
  return {
    id: "run-1",
    contextSnapshot: {
      paperclipWorkspace: {
        source: "project_workspace",
        cwd: "/Users/alecwhitters/hlt/example",
        workspaceId: "workspace-1",
        repoUrl: "https://github.com/example/project",
        repoRef: "main",
        branchName: "codex/example",
        agentHome: "/Users/alecwhitters/.paperclip/instances/default/workspaces/agent-1",
      },
      paperclipRuntimePrimaryUrl: "http://127.0.0.1:5173",
    },
  };
}

describe("RunContextCard", () => {
  it("shows redacted workspace, instruction, and prompt context", () => {
    const html = renderToStaticMarkup(
      <RunContextCard
        run={makeRun()}
        adapterConfig={{
          instructionsFilePath: "/Users/alecwhitters/hlt/example/AGENTS.md",
        }}
        adapterInvokePayload={{
          prompt: "Review /Users/alecwhitters/hlt/example and use api_key=secret-value only if needed.",
          promptMetrics: { chars: 87 },
          commandNotes: ["Loaded agent instructions from /Users/alecwhitters/hlt/example/AGENTS.md"],
        }}
        censorUsernameInLogs={true}
      />,
    );

    expect(html).toContain("Workspace and prompt context");
    expect(html).toContain("project_workspace");
    expect(html).toContain("https://github.com/example/project");
    expect(html).toContain("instructionsFilePath");
    expect(html).toContain("/Users/a***********/hlt/example/AGENTS.md");
    expect(html).toContain("chars");
    expect(html).toContain("api_key=***REDACTED***");
  });
});
