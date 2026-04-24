---
title: External Adapters
summary: Build, package, and distribute adapters as plugins without modifying Paperclip source
---

Paperclip supports external adapter plugins that can be installed from npm packages or local directories. External adapters work exactly like built-in adapters — they execute agents, parse output, and render transcripts — but they live in their own package and don't require changes to Paperclip's source code.

In this fork, Hermes is intentionally external-only. Install `@henkey/hermes-paperclip-adapter` or a local adapter package through the Adapter Manager; Paperclip core does not import or register `hermes_local` directly.

The Adapter Manager is the supported install path for fork-local Hermes and other external adapters. It shows whether each external adapter is loaded, where it came from (npm or local path), and whether Paperclip can see its optional schema, UI parser, model detection, session management, and lifecycle hooks. Reload and reinstall actions invalidate server/client parser and schema caches so local package iteration is visible without a full Paperclip restart.

## Built-in vs External

| | Built-in | External |
|---|---|---|
| Source location | Inside `paperclip-fork/packages/adapters/` | Separate npm package or local directory |
| Registration | Hardcoded in three registries | Loaded at startup via plugin system |
| UI parser | Static import at build time | Dynamically loaded from API (see [UI Parser](/adapters/adapter-ui-parser)) |
| Distribution | Ships with Paperclip | Published to npm or linked via `file:` |
| Updates | Requires Paperclip release | Independent versioning |

External packages may also expose optional capabilities:

| Capability | Contract |
|------------|----------|
| Config schema | `getConfigSchema()` on the server adapter; rendered generically in agent config forms |
| UI parser | `exports["./ui-parser"]` plus `paperclip.adapterUiParser` contract metadata |
| Model detection | `detectModel()` on the server adapter |
| Session management | `sessionManagement` on the server adapter, or host-provided session management for known adapter types |
| Lifecycle hooks | optional server hooks such as `onHireApproved()` |

## Quick Start

### Minimal Package Structure

```
my-adapter/
  package.json
  tsconfig.json
  src/
    index.ts            # Shared metadata (type, label, models)
    server/
      index.ts          # createServerAdapter() factory
      execute.ts        # Core execution logic
      parse.ts          # Output parsing
      test.ts           # Environment diagnostics
    ui-parser.ts        # Self-contained UI transcript parser
```

### package.json

```json
{
  "name": "my-paperclip-adapter",
  "version": "1.0.0",
  "type": "module",
  "license": "MIT",
  "paperclip": {
    "adapterUiParser": "1.0.0"
  },
  "exports": {
    ".": "./dist/index.js",
    "./server": "./dist/server/index.js",
    "./ui-parser": "./dist/ui-parser.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "@paperclipai/adapter-utils": "^2026.325.0",
    "picocolors": "^1.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  }
}
```

Key fields:

| Field | Purpose |
|-------|---------|
| `exports["."]` | Entry point — must export `createServerAdapter` |
| `exports["./ui-parser"]` | Self-contained UI parser module (optional but recommended) |
| `paperclip.adapterUiParser` | Contract version for the UI parser (`"1.0.0"`) |
| `files` | Limits what gets published — only `dist/` |

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

## Server Module

The plugin loader calls `createServerAdapter()` from your package root. This function must return a `ServerAdapterModule`.

### src/index.ts

```ts
export const type = "my_adapter";     // snake_case, globally unique
export const label = "My Agent (local)";

export const models = [
  { id: "model-a", label: "Model A" },
];

export const agentConfigurationDoc = `# my_adapter configuration
Use when: ...
Don't use when: ...
`;

// Required by plugin-loader convention
export { createServerAdapter } from "./server/index.js";
```

### src/server/index.ts

```ts
import type { ServerAdapterModule } from "@paperclipai/adapter-utils";
import { type, models, agentConfigurationDoc } from "../index.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

export function createServerAdapter(): ServerAdapterModule {
  return {
    type,
    execute,
    testEnvironment,
    models,
    agentConfigurationDoc,
  };
}
```

### src/server/execute.ts

The core execution function. Receives an `AdapterExecutionContext` and returns an `AdapterExecutionResult`.

```ts
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";

import {
  runChildProcess,
  buildPaperclipEnv,
  renderTemplate,
} from "@paperclipai/adapter-utils/server-utils";

export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const { config, agent, runtime, context, onLog, onMeta } = ctx;

  // 1. Read config with safe helpers
  const cwd = String(config.cwd ?? "/tmp");
  const command = String(config.command ?? "my-agent");
  const timeoutSec = Number(config.timeoutSec ?? 300);

  // 2. Build environment with Paperclip vars injected
  const env = buildPaperclipEnv(agent);

  // 3. Render prompt template
  const prompt = config.promptTemplate
    ? renderTemplate(String(config.promptTemplate), {
        agentId: agent.id,
        agentName: agent.name,
        companyId: agent.companyId,
        runId: ctx.runId,
        taskId: context.taskId ?? "",
        taskTitle: context.taskTitle ?? "",
      })
    : "Continue your work.";

  // 4. Spawn process
  const result = await runChildProcess(command, {
    args: [prompt],
    cwd,
    env,
    timeout: timeoutSec * 1000,
    graceMs: 10_000,
    onStdout: (chunk) => onLog("stdout", chunk),
    onStderr: (chunk) => onLog("stderr", chunk),
  });

  // 5. Return structured result
  return {
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    // Include session state for persistence
    sessionParams: { /* ... */ },
  };
}
```

#### Available Helpers from `@paperclipai/adapter-utils`

| Helper | Purpose |
|--------|---------|
| `runChildProcess(command, opts)` | Spawn a child process with timeout, grace period, and streaming callbacks |
| `buildPaperclipEnv(agent)` | Inject `PAPERCLIP_*` environment variables |
| `renderTemplate(template, data)` | `{{variable}}` substitution in prompt templates |
| `asString(v)`, `asNumber(v)`, `asBoolean(v)` | Safe config value extraction |

### src/server/test.ts

Validates the adapter configuration before running. Returns structured diagnostics.

```ts
import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks = [];

  // Example: check CLI is installed
  checks.push({
    level: "info",
    message: "My Agent CLI v1.2.0 detected",
    code: "cli_detected",
  });

  // Example: check working directory
  const cwd = String(ctx.config.cwd ?? "");
  if (!cwd.startsWith("/")) {
    checks.push({
      level: "error",
      message: `Working directory must be absolute: "${cwd}"`,
      hint: "Use /home/user/project or /workspace",
      code: "invalid_cwd",
    });
  }

  return {
    adapterType: ctx.adapterType,
    status: checks.some(c => c.level === "error") ? "fail" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
```

Check levels:

| Level | Meaning | Effect |
|-------|---------|--------|
| `info` | Informational | Shown in test results |
| `warn` | Non-blocking issue | Shown with yellow indicator |
| `error` | Blocks execution | Prevents agent from running |

## Installation

### From npm

```sh
# Via the Paperclip UI
# Settings → Adapters → Install from npm → "my-paperclip-adapter"

# Or via API
curl -X POST http://localhost:3102/api/adapters/install \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"packageName": "my-paperclip-adapter"}'
```

### From local directory

```sh
curl -X POST http://localhost:3102/api/adapters/install \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"packageName": "/home/user/my-adapter", "isLocalPath": true}'
```

Local adapters are loaded from the supplied directory. Use Reload in the Adapter Manager after rebuilding the local package to hot-swap the server module and UI parser.

### Via adapter-plugins.json

For development, you can also edit `~/.paperclip/adapter-plugins.json` directly:

```json
[
  {
    "packageName": "my-paperclip-adapter",
    "localPath": "/home/user/my-adapter",
    "type": "my_adapter",
    "installedAt": "2026-03-30T12:00:00.000Z"
  }
]
```

## Optional: Session Persistence

If your agent runtime supports sessions (conversation continuity across heartbeats), implement a session codec:

```ts
import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw) {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    return r.sessionId ? { sessionId: String(r.sessionId) } : null;
  },
  serialize(params) {
    return params?.sessionId ? { sessionId: String(params.sessionId) } : null;
  },
  getDisplayId(params) {
    return params?.sessionId ? String(params.sessionId) : null;
  },
};
```

Include it in `createServerAdapter()`:

```ts
return { type, execute, testEnvironment, sessionCodec, /* ... */ };
```

## Optional: Skills Sync

If your agent runtime supports skills/plugins, implement `listSkills` and `syncSkills`:

```ts
return {
  type,
  execute,
  testEnvironment,
  async listSkills(ctx) {
    return {
      adapterType: ctx.adapterType,
      supported: true,
      mode: "ephemeral",
      desiredSkills: [],
      entries: [],
      warnings: [],
    };
  },
  async syncSkills(ctx, desiredSkills) {
    // Install desired skills into the runtime
    return { /* same shape as listSkills */ };
  },
};
```

## Optional: Model Detection

If your runtime has a local config file that specifies the default model:

```ts
async function detectModel() {
  // Read ~/.my-agent/config.yaml or similar
  return {
    model: "anthropic/claude-sonnet-4",
    provider: "anthropic",
    source: "~/.my-agent/config.yaml",
    candidates: ["anthropic/claude-sonnet-4", "openai/gpt-4o"],
  };
}

return { type, execute, testEnvironment, detectModel: () => detectModel() };
```

## Publishing

```sh
npm run build
npm publish
```

Other Paperclip users can then install your adapter by package name from the UI or API.

## Security

- Treat agent output as untrusted — parse defensively, never `eval()` agent output
- Inject secrets via environment variables, not in prompts
- Configure network access controls if the runtime supports them
- Always enforce timeout and grace period — don't let agents run forever
- The UI parser module runs in a browser sandbox — it must have zero runtime imports and no side effects

## Katailyst and Agent Canvas

Paperclip should connect to Katailyst and Agent Canvas through adapter/runtime configuration, not core imports.

### Katailyst

Katailyst is the capability and context registry. Configure it with environment secret refs at the company, project, or agent layer:

| Key | Purpose |
|-----|---------|
| `KATAILYST_MCP_URL` | MCP endpoint for capability/context lookup |
| `KATAILYST_MCP_TOKEN` | Bearer token for MCP access |
| `KATAILYST_PAT` | Personal access token when the adapter uses Katailyst APIs directly |

Adapters should pass Paperclip trace IDs on every Katailyst lookup or tool call:

```json
{
  "paperclip_run_id": "run_...",
  "paperclip_issue_id": "issue_...",
  "paperclip_agent_id": "agent_...",
  "paperclip_company_id": "company_..."
}
```

The adapter should emit `adapter.invoke` metadata that names the configured secret refs and endpoint source without exposing token values. Runtime transcripts should show the Katailyst capability name, selected prompt/context bundle, and trace ID so an operator can audit why an agent received a given tool or instruction.

### Agent Canvas

Agent Canvas should be packaged as an external adapter or gateway adapter. Paperclip remains the control plane: it owns governance, checkout, run status, workspaces, approvals, budgets, and the canonical transcript. Canvas receives run/session context and returns status, widgets, artifact links, and deep links.

Adapter input to Canvas:

```json
{
  "paperclipRun": {
    "id": "run_...",
    "companyId": "company_...",
    "agentId": "agent_...",
    "issueId": "issue_...",
    "statusCallbackUrl": "https://paperclip.example/api/..."
  },
  "workspace": {
    "source": "project_workspace",
    "cwd": "/repo",
    "repoUrl": "https://github.com/org/repo",
    "repoRef": "main",
    "branchName": "paperclip/PAP-123"
  },
  "prompt": {
    "templateId": "agent-template-or-bundle-key",
    "preview": "redacted operator-visible prompt preview"
  }
}
```

Canvas output back to Paperclip:

```json
{
  "status": "running",
  "widgets": [
    { "type": "task_board", "title": "Canvas Tasks", "url": "https://canvas.example/runs/run_..." }
  ],
  "artifacts": [
    { "label": "Design review", "url": "https://canvas.example/artifacts/..." }
  ],
  "deepLinks": [
    { "label": "Open in Canvas", "url": "https://canvas.example/runs/run_..." }
  ]
}
```

The Canvas adapter should expose a config schema for endpoint URL, auth secret refs, widget mode, and status callback behavior. Its `ui-parser.js` should turn Canvas status events into transcript entries, keeping Paperclip usable even when the Canvas UI is not open.

External adapters that bridge either system should expose their config schema and UI parser so operators can see connection settings and transcript events without Paperclip-specific source changes.

## Next Steps

- [UI Parser Contract](/adapters/adapter-ui-parser) — add a custom run-log parser so the UI renders your adapter's output correctly
- [Creating an Adapter](/adapters/creating-an-adapter) — full walkthrough of adapter internals
- [How Agents Work](/guides/agent-developer/how-agents-work) — understand the heartbeat lifecycle your adapter serves
