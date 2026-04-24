import type { HeartbeatRun } from "@paperclipai/shared";
import { redactHomePathUserSegments, redactHomePathUserSegmentsInValue } from "@paperclipai/adapter-utils";
import { ChevronRight, FolderOpen } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type RunContextCardProps = {
  run: Pick<HeartbeatRun, "id" | "contextSnapshot">;
  adapterConfig: Record<string, unknown>;
  adapterInvokePayload: Record<string, unknown> | null;
  censorUsernameInLogs: boolean;
};

const INSTRUCTION_CONFIG_KEYS = [
  "instructionsFilePath",
  "agentsMdPath",
  "instructionsRootPath",
  "instructionsEntryFile",
] as const;

const SECRET_LIKE_RE =
  /(api[-_]?key|access[-_]?token|auth(?:_?token)?|authorization|bearer|secret|passwd|password|credential|jwt|private[-_]?key|cookie)\s*[:=]\s*["']?[^"'\s]+/gi;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => asRecord(entry) !== null)
    : [];
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function redactString(value: string, censorUsernameInLogs: boolean) {
  return redactHomePathUserSegments(value, { enabled: censorUsernameInLogs });
}

function redactValue(value: unknown, censorUsernameInLogs: boolean) {
  return redactHomePathUserSegmentsInValue(value, { enabled: censorUsernameInLogs });
}

function formatValue(value: unknown, censorUsernameInLogs: boolean): string {
  if (typeof value === "string") return redactString(value, censorUsernameInLogs);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(redactValue(value, censorUsernameInLogs));
  } catch {
    return redactString(String(value), censorUsernameInLogs);
  }
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}...` : value;
}

function promptPreview(value: string, censorUsernameInLogs: boolean) {
  return truncate(
    redactString(value, censorUsernameInLogs).replace(SECRET_LIKE_RE, (match) => {
      const separator = match.includes("=") ? "=" : ":";
      const [key] = match.split(separator);
      return `${key}${separator}***REDACTED***`;
    }),
    1600,
  );
}

function detailRow(label: string, value: unknown, censorUsernameInLogs: boolean) {
  const formatted = formatValue(value, censorUsernameInLogs);
  if (!formatted) return null;
  return { label, value: formatted };
}

export function RunContextCard({
  run,
  adapterConfig,
  adapterInvokePayload,
  censorUsernameInLogs,
}: RunContextCardProps) {
  const context = asRecord(run.contextSnapshot);
  const workspace = asRecord(context?.paperclipWorkspace);
  const workspaceHints = asRecordArray(context?.paperclipWorkspaces);
  const runtimeServices = asRecordArray(context?.paperclipRuntimeServices);
  const prompt = asNonEmptyString(adapterInvokePayload?.prompt);
  const promptMetrics = asRecord(adapterInvokePayload?.promptMetrics);
  const commandNotes = Array.isArray(adapterInvokePayload?.commandNotes)
    ? adapterInvokePayload.commandNotes.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const instructionRows = INSTRUCTION_CONFIG_KEYS
    .map((key) => detailRow(key, adapterConfig[key], censorUsernameInLogs))
    .filter((row): row is { label: string; value: string } => row !== null);

  const workspaceRows = [
    detailRow("Source", workspace?.source, censorUsernameInLogs),
    detailRow("Mode", workspace?.mode, censorUsernameInLogs),
    detailRow("Working dir", workspace?.cwd, censorUsernameInLogs),
    detailRow("Workspace ID", workspace?.workspaceId, censorUsernameInLogs),
    detailRow("Project ID", workspace?.projectId, censorUsernameInLogs),
    detailRow("Repo", workspace?.repoUrl, censorUsernameInLogs),
    detailRow("Ref", workspace?.repoRef, censorUsernameInLogs),
    detailRow("Branch", workspace?.branchName, censorUsernameInLogs),
    detailRow("Worktree", workspace?.worktreePath, censorUsernameInLogs),
    detailRow("Agent home", workspace?.agentHome, censorUsernameInLogs),
    detailRow("Primary service", context?.paperclipRuntimePrimaryUrl, censorUsernameInLogs),
  ].filter((row): row is { label: string; value: string } => row !== null);

  const metricRows = promptMetrics
    ? Object.entries(promptMetrics)
        .filter(([, value]) => typeof value === "number" || typeof value === "string")
        .map(([key, value]) => ({ label: key, value: String(value) }))
    : [];

  const hasContext =
    workspaceRows.length > 0 ||
    workspaceHints.length > 0 ||
    runtimeServices.length > 0 ||
    instructionRows.length > 0 ||
    commandNotes.length > 0 ||
    metricRows.length > 0 ||
    Boolean(prompt);

  if (!hasContext) return null;

  return (
    <div className="rounded-lg border border-border bg-background/60 p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <FolderOpen className="h-3.5 w-3.5" />
        Workspace and prompt context
      </div>

      {workspaceRows.length > 0 && (
        <div className="grid gap-1 text-xs sm:grid-cols-2">
          {workspaceRows.map((row) => (
            <div key={row.label} className="min-w-0 break-all">
              <span className="text-muted-foreground">{row.label}: </span>
              <span className="font-mono">{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {instructionRows.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Instructions</div>
          <div className="grid gap-1 text-xs sm:grid-cols-2">
            {instructionRows.map((row) => (
              <div key={row.label} className="min-w-0 break-all">
                <span className="text-muted-foreground">{row.label}: </span>
                <span className="font-mono">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(metricRows.length > 0 || commandNotes.length > 0 || prompt) && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {metricRows.map((row) => (
              <div key={row.label}>
                <span className="text-muted-foreground">{row.label}: </span>
                <span className="font-mono">{row.value}</span>
              </div>
            ))}
          </div>
          {commandNotes.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {commandNotes.map((note, index) => (
                <li key={`${index}-${note}`} className="break-words">
                  {redactString(note, censorUsernameInLogs)}
                </li>
              ))}
            </ul>
          )}
          {prompt && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90" />
                Prompt preview
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <pre className={cn(
                  "max-h-72 overflow-auto rounded-md bg-neutral-100 p-2 text-xs whitespace-pre-wrap break-words dark:bg-neutral-950",
                  "font-mono text-foreground/80",
                )}>
                  {promptPreview(prompt, censorUsernameInLogs)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}

      {(workspaceHints.length > 0 || runtimeServices.length > 0) && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group">
            <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90" />
            Runtime details
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <pre className="max-h-72 overflow-auto rounded-md bg-neutral-100 p-2 text-xs whitespace-pre-wrap break-words dark:bg-neutral-950">
              {JSON.stringify(
                redactValue(
                  {
                    workspaceHints,
                    runtimeServices,
                  },
                  censorUsernameInLogs,
                ),
                null,
                2,
              )}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
