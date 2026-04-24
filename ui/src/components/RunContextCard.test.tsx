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
        cwd: "/workspace/example",
        workspaceId: "workspace-1",
        repoUrl: "https://github.com/example/project",
        repoRef: "main",
        branchName: "codex/example",
        agentHome: "/paperclip/workspaces/agent-1",
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
          instructionsFilePath: "/workspace/example/AGENTS.md",
        }}
        adapterInvokePayload={{
          prompt: "Review /workspace/example and use api_key=test-fixture only if needed.",
          promptMetrics: { chars: 87 },
          commandNotes: ["Loaded agent instructions from /workspace/example/AGENTS.md"],
        }}
        censorUsernameInLogs={true}
      />,
    );

    expect(html).toContain("Workspace and prompt context");
    expect(html).toContain("project_workspace");
    expect(html).toContain("https://github.com/example/project");
    expect(html).toContain("instructionsFilePath");
    expect(html).toContain("/workspace/example/AGENTS.md");
    expect(html).toContain("chars");
    expect(html).toContain("api_key=***REDACTED***");
  });
});
