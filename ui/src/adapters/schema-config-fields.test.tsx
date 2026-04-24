// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultCreateValues } from "../components/agent-config-defaults";
import { SchemaConfigFields, buildSchemaAdapterConfig } from "./schema-config-fields";

vi.mock("../components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/toggle-switch", () => ({
  ToggleSwitch: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    >
      {checked ? "on" : "off"}
    </button>
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const schema = {
  fields: [
    {
      key: "profile",
      label: "Profile",
      type: "select",
      default: "dev",
      options: [
        { label: "Development", value: "dev" },
        { label: "Production", value: "prod" },
      ],
      hint: "External profile to load",
    },
    {
      key: "katailystTokenRef",
      label: "Katailyst token ref",
      type: "text",
      hint: "Use a secret reference",
    },
    {
      key: "streamEvents",
      label: "Stream events",
      type: "toggle",
      default: true,
    },
    {
      key: "maxSteps",
      label: "Max steps",
      type: "number",
      default: 5,
    },
    {
      key: "operatorNotes",
      label: "Operator notes",
      type: "textarea",
      default: "Read attachments before answering.",
    },
  ],
};

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("SchemaConfigFields", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => schema,
    })));
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container.remove();
    root = null;
    vi.unstubAllGlobals();
  });

  it("renders fetched external adapter schema fields and applies create defaults", async () => {
    const set = vi.fn();
    const values = {
      ...defaultCreateValues,
      adapterType: "external_schema_config",
      adapterSchemaValues: {},
    };

    await act(async () => {
      root?.render(
        <SchemaConfigFields
          mode="create"
          isCreate
          adapterType="external_schema_config"
          values={values}
          set={set}
          config={{}}
          eff={(_group, _field, original) => original}
          mark={vi.fn()}
          models={[]}
          hideInstructionsFile={false}
        />,
      );
    });
    await flush();
    await flush();

    expect(fetch).toHaveBeenCalledWith("/api/adapters/external_schema_config/config-schema");
    expect(container.textContent).toContain("Profile");
    expect(container.textContent).toContain("Development");
    expect(container.textContent).toContain("Katailyst token ref");
    expect(container.textContent).toContain("Stream events");
    expect(container.textContent).toContain("Max steps");
    expect(container.textContent).toContain("Operator notes");
    expect(set).toHaveBeenCalledWith({
      adapterSchemaValues: {
        profile: "dev",
        streamEvents: true,
        maxSteps: 5,
        operatorNotes: "Read attachments before answering.",
      },
    });
  });

  it("merges schema values into create adapter config", () => {
    expect(
      buildSchemaAdapterConfig({
        ...defaultCreateValues,
        adapterType: "external_schema_config",
        model: "smoke-model",
        command: "external-smoke",
        extraArgs: "--json --trace",
        adapterSchemaValues: {
          profile: "prod",
          katailystTokenRef: "secret:KATAILYST_MCP_TOKEN",
        },
      }),
    ).toMatchObject({
      model: "smoke-model",
      command: "external-smoke",
      extraArgs: ["--json", "--trace"],
      profile: "prod",
      katailystTokenRef: "secret:KATAILYST_MCP_TOKEN",
    });
  });
});
