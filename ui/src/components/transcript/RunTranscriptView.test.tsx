// @vitest-environment node

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { TranscriptEntry } from "../../adapters";
import { ThemeProvider } from "../../context/ThemeContext";
import { RunTranscriptView, normalizeTranscript } from "./RunTranscriptView";

describe("RunTranscriptView", () => {
  it("keeps running command stdout inside the command fold instead of a standalone stdout block", () => {
    const entries: TranscriptEntry[] = [
      {
        kind: "tool_call",
        ts: "2026-03-12T00:00:00.000Z",
        name: "command_execution",
        toolUseId: "cmd_1",
        input: { command: "ls -la" },
      },
      {
        kind: "stdout",
        ts: "2026-03-12T00:00:01.000Z",
        text: "file-a\nfile-b",
      },
    ];

    const blocks = normalizeTranscript(entries, false);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "command_group",
      items: [{ result: "file-a\nfile-b", status: "running" }],
    });
  });

  it("renders assistant and thinking content as markdown in compact mode", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <RunTranscriptView
          density="compact"
          entries={[
            {
              kind: "assistant",
              ts: "2026-03-12T00:00:00.000Z",
              text: "Hello **world**",
            },
            {
              kind: "thinking",
              ts: "2026-03-12T00:00:01.000Z",
              text: "- first\n- second",
            },
          ]}
        />
      </ThemeProvider>,
    );

    expect(html).toContain("<strong>world</strong>");
    expect(html).toMatch(/<li[^>]*>first<\/li>/);
    expect(html).toMatch(/<li[^>]*>second<\/li>/);
  });

  it("hides saved-session resume skip stderr from nice mode normalization", () => {
    const entries: TranscriptEntry[] = [
      {
        kind: "stderr",
        ts: "2026-03-12T00:00:00.000Z",
        text: "[paperclip] Skipping saved session resume for task \"PAP-485\" because wake reason is issue_assigned.",
      },
      {
        kind: "assistant",
        ts: "2026-03-12T00:00:01.000Z",
        text: "Working on the task.",
      },
    ];

    const blocks = normalizeTranscript(entries, false);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "message",
      role: "assistant",
      text: "Working on the task.",
    });
  });

  it("renders successful result summaries as markdown in nice mode", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <RunTranscriptView
          density="compact"
          entries={[
            {
              kind: "result",
              ts: "2026-03-12T00:00:02.000Z",
              text: "## Summary\n\n- fixed deploy config\n- posted issue update",
              inputTokens: 10,
              outputTokens: 20,
              cachedTokens: 0,
              costUsd: 0,
              subtype: "success",
              isError: false,
              errors: [],
            },
          ]}
        />
      </ThemeProvider>,
    );

    expect(html).toContain("<h2>Summary</h2>");
    expect(html).toMatch(/<li[^>]*>fixed deploy config<\/li>/);
    expect(html).toMatch(/<li[^>]*>posted issue update<\/li>/);
    expect(html).not.toContain("result");
  });

  it("keeps chat attachment read-back visible in transcript data and raw rendering", () => {
    const entries: TranscriptEntry[] = [
      {
        kind: "tool_call",
        ts: "2026-04-23T00:00:00.000Z",
        name: "chat.attachments.read",
        toolUseId: "attachment_read_1",
        input: { maxBytes: 4096 },
      },
      {
        kind: "tool_result",
        ts: "2026-04-23T00:00:01.000Z",
        toolUseId: "attachment_read_1",
        toolName: "chat.attachments.read",
        isError: false,
        content: JSON.stringify({
          attachments: [
            {
              id: "attachment-1",
              originalFilename: "brief.txt",
              content: {
                encoding: "utf-8",
                text: "Attachment read-back proof text",
              },
            },
          ],
        }),
      },
    ];

    const blocks = normalizeTranscript(entries, false);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "tool_group",
      items: [
        {
          name: "Chat.Attachments.Read",
          status: "completed",
          result: expect.stringContaining("Attachment read-back proof text"),
        },
      ],
    });

    const html = renderToStaticMarkup(
      <ThemeProvider>
        <RunTranscriptView mode="raw" entries={entries} />
      </ThemeProvider>,
    );

    expect(html).toContain("chat.attachments.read");
    expect(html).toContain("brief.txt");
    expect(html).toContain("Attachment read-back proof text");
  });
});
