---
title: Render
summary: First public authenticated deployment
---

Use Render for the first live Paperclip control plane. The root `render.yaml` defines one Docker web service, one Render Postgres database, and one persistent `/paperclip` disk.

Vercel remains a good fit for sidecars, previews, AI SDK surfaces, v0 workflows, and agent-adjacent apps. Do not host the main Paperclip control plane on Vercel yet because Paperclip needs a long-running API process, local agent CLIs, workspace files, plugin installs, and persistent disk state.

## Blueprint

Create a Render Blueprint from this repository and use `render.yaml`.

Required values when Render prompts for synced environment variables:

| Variable | Value |
| --- | --- |
| `PAPERCLIP_PUBLIC_URL` | The final `https://...onrender.com` or custom domain URL |
| `OPENAI_API_KEY` | Optional for Codex local/container agents |
| `ANTHROPIC_API_KEY` | Optional for Claude local/container agents |
| `KATAILYST_MCP_URL` | Katailyst MCP endpoint |
| `KATAILYST_MCP_TOKEN` | Katailyst MCP bearer token |
| `KATAILYST_PAT` | Optional Katailyst API token for adapters that need it |

The Blueprint sets:

- `PAPERCLIP_DEPLOYMENT_MODE=authenticated`
- `PAPERCLIP_DEPLOYMENT_EXPOSURE=public`
- `PAPERCLIP_AUTH_DISABLE_SIGN_UP=true`
- `PAPERCLIP_SECRETS_STRICT_MODE=true`
- `PAPERCLIP_MIGRATION_AUTO_APPLY=true`
- managed `DATABASE_URL` from Render Postgres
- persistent `PAPERCLIP_HOME=/paperclip`

## First Login

After the first deploy is healthy:

1. Open a Render shell for the `paperclip` service.
2. Run:

```sh
pnpm paperclipai auth bootstrap-ceo \
  --base-url "$PAPERCLIP_PUBLIC_URL" \
  --db-url "$DATABASE_URL"
```

3. Open the printed invite URL.
4. Create the first admin user.
5. Keep `PAPERCLIP_AUTH_DISABLE_SIGN_UP=true` and invite teammates from Paperclip.

## First Agent Smoke

Use one smoke issue to prove the live system is usable:

1. Create the HLT company.
2. Add provider keys as Paperclip secrets.
3. Install Hermes through Adapter Manager as `@henkey/hermes-paperclip-adapter` or a local `file:` plugin.
4. Create one Codex or Claude container agent.
5. Create one SSH-backed environment and agent if remote execution is needed.
6. Create one sidecar-backed external adapter for Canvas, OpenClaw, Mastra, or a Vercel AI SDK service.
7. Upload a small text attachment to an issue.
8. Ask the agent to call `chat.attachments.read`.
9. Verify the transcript shows the read result and metadata.
10. Open the run detail and verify workspace source/path, prompt context, instruction metadata, adapter payload, and work products are visible.

## Integration Boundaries

Paperclip owns companies, users, issues, runs, workspaces, approvals, budgets, transcripts, and deployment auth.

Katailyst owns registry, graph, context, skills, prompts, tools, and memory. Agents receive Katailyst MCP config through adapter env/config secrets, not through a hardcoded Paperclip core dependency.

Agent Canvas is an external adapter or gateway. Paperclip sends run/session/status context; Canvas returns widgets, artifact links, status updates, and deep links back to Paperclip.

Cloudinary should be used for durable media assets after the first live Paperclip validation. Keep attachments and run artifacts on the Render disk until the core flow is proven.
