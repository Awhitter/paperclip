import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixtureDir = path.resolve(
  fileURLToPath(new URL("./fixtures/external-smoke-adapter", import.meta.url)),
);

const mockAgentService = vi.hoisted(() => ({
  create: vi.fn(),
  getById: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
  ensureMembership: vi.fn(),
  setPrincipalPermission: vi.fn(),
}));

const mockCompanySkillService = vi.hoisted(() => ({
  listRuntimeSkillEntries: vi.fn(),
  resolveRequestedSkillKeys: vi.fn(),
}));

const mockSecretService = vi.hoisted(() => ({
  normalizeAdapterConfigForPersistence: vi.fn(async (_companyId: string, config: Record<string, unknown>) => config),
  resolveAdapterConfigForRuntime: vi.fn(async (_companyId: string, config: Record<string, unknown>) => ({ config })),
}));

const mockAgentInstructionsService = vi.hoisted(() => ({
  materializeManagedBundle: vi.fn(),
  getBundle: vi.fn(),
  readFile: vi.fn(),
  updateBundle: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  exportFiles: vi.fn(),
  ensureManagedBundle: vi.fn(),
}));

const mockBudgetService = vi.hoisted(() => ({
  upsertPolicy: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  cancelActiveForAgent: vi.fn(),
}));

const mockIssueApprovalService = vi.hoisted(() => ({
  linkManyForApproval: vi.fn(),
}));

const mockApprovalService = vi.hoisted(() => ({
  create: vi.fn(),
  getById: vi.fn(),
}));

const mockInstanceSettingsService = vi.hoisted(() => ({
  getGeneral: vi.fn(async () => ({ censorUsernameInLogs: false })),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

function registerModuleMocks() {
  vi.doMock("../services/index.js", () => ({
    agentService: () => mockAgentService,
    agentInstructionsService: () => mockAgentInstructionsService,
    accessService: () => mockAccessService,
    approvalService: () => mockApprovalService,
    companySkillService: () => mockCompanySkillService,
    budgetService: () => mockBudgetService,
    heartbeatService: () => mockHeartbeatService,
    issueApprovalService: () => mockIssueApprovalService,
    issueService: () => ({}),
    logActivity: mockLogActivity,
    secretService: () => mockSecretService,
    syncInstructionsBundleConfigFromFilePath: vi.fn((_agent, config) => config),
    workspaceOperationService: () => ({}),
  }));

  vi.doMock("../services/instance-settings.js", () => ({
    instanceSettingsService: () => mockInstanceSettingsService,
  }));
}

async function createApp() {
  const [{ adapterRoutes }, { agentRoutes }, { errorHandler }] = await Promise.all([
    import("../routes/adapters.js"),
    import("../routes/agents.js"),
    import("../middleware/index.js"),
  ]);
  const db = {
    select() {
      const query = {
        from() {
          return query;
        },
        where() {
          return query;
        },
        then(resolve: (rows: unknown[]) => unknown) {
          return Promise.resolve([
            {
              id: "company-1",
              name: "Smoke Company",
              requireBoardApprovalForNewAgents: false,
            },
          ]).then(resolve);
        },
      };
      return query;
    },
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "local-board",
      companyIds: ["company-1"],
      source: "local_implicit",
      isInstanceAdmin: false,
    };
    next();
  });
  app.use("/api", adapterRoutes());
  app.use("/api", agentRoutes(db as any));
  app.use(errorHandler);
  return app;
}

describe("external adapter smoke", () => {
  let originalHome: string | undefined;
  let tempHome: string;

  beforeEach(async () => {
    originalHome = process.env.HOME;
    tempHome = await mkdtemp(path.join(os.tmpdir(), "paperclip-adapter-smoke-"));
    process.env.HOME = tempHome;
    vi.resetModules();
    registerModuleMocks();
    vi.clearAllMocks();
    mockCompanySkillService.listRuntimeSkillEntries.mockResolvedValue([]);
    mockCompanySkillService.resolveRequestedSkillKeys.mockResolvedValue([]);
    mockAccessService.canUser.mockResolvedValue(true);
    mockAccessService.hasPermission.mockResolvedValue(true);
    mockAccessService.ensureMembership.mockResolvedValue(undefined);
    mockAccessService.setPrincipalPermission.mockResolvedValue(undefined);
    mockLogActivity.mockResolvedValue(undefined);
    mockAgentService.create.mockImplementation(async (_companyId: string, input: Record<string, unknown>) => ({
      id: "11111111-1111-4111-8111-111111111111",
      companyId: "company-1",
      name: String(input.name ?? "Agent"),
      urlKey: "agent",
      role: String(input.role ?? "general"),
      title: null,
      icon: null,
      status: "idle",
      reportsTo: null,
      capabilities: null,
      adapterType: String(input.adapterType ?? "process"),
      adapterConfig: (input.adapterConfig as Record<string, unknown> | undefined) ?? {},
      runtimeConfig: (input.runtimeConfig as Record<string, unknown> | undefined) ?? {},
      budgetMonthlyCents: 0,
      spentMonthlyCents: 0,
      pauseReason: null,
      pausedAt: null,
      permissions: { canCreateAgents: false },
      lastHeartbeatAt: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  afterEach(async () => {
    const { unregisterServerAdapter } = await import("../adapters/index.js");
    unregisterServerAdapter("external_smoke");
    process.env.HOME = originalHome;
    await rm(tempHome, { recursive: true, force: true });
  });

  it("installs, exposes, and uses a local external adapter package", async () => {
    const app = await createApp();

    const install = await request(app)
      .post("/api/adapters/install")
      .send({ packageName: fixtureDir, isLocalPath: true });

    expect(install.status, JSON.stringify(install.body)).toBe(201);
    expect(install.body).toMatchObject({
      type: "external_smoke",
      version: "1.2.3",
    });

    const list = await request(app).get("/api/adapters");
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    const smoke = list.body.find((adapter: { type?: string }) => adapter.type === "external_smoke");
    expect(smoke).toMatchObject({
      type: "external_smoke",
      source: "external",
      loaded: true,
      isLocalPath: true,
      version: "1.2.3",
      hasConfigSchema: true,
      hasUiParser: true,
      hasDetectModel: true,
      hasSessionManagement: true,
      capabilities: {
        supportsInstructionsBundle: true,
        supportsSkills: false,
        supportsLocalAgentJwt: true,
        requiresMaterializedRuntimeSkills: false,
      },
    });

    const schema = await request(app).get("/api/adapters/external_smoke/config-schema");
    expect(schema.status, JSON.stringify(schema.body)).toBe(200);
    expect(schema.body).toMatchObject({
      fields: [{ key: "profile" }, { key: "instructionsFilePath" }],
    });

    const parser = await request(app).get("/api/adapters/external_smoke/ui-parser.js");
    expect(parser.status, JSON.stringify(parser.body)).toBe(200);
    expect(parser.text).toContain("parseStdoutLine");
    expect(parser.text).toContain("assistant:");

    const { detectAdapterModel, findServerAdapter } = await import("../adapters/index.js");
    expect(findServerAdapter("external_smoke")?.sessionManagement).toMatchObject({
      supportsSessionResume: true,
      nativeContextManagement: "confirmed",
    });
    expect(findServerAdapter("external_smoke")?.detectModel).toBeTypeOf("function");
    await expect(detectAdapterModel("external_smoke")).resolves.toMatchObject({
      model: "smoke-model",
      provider: "smoke-provider",
      source: "external smoke fixture",
    });

    const created = await request(app)
      .post("/api/companies/company-1/agents")
      .send({
        name: "External Smoke Agent",
        adapterType: "external_smoke",
        adapterConfig: {
          profile: "default",
          instructionsFilePath: "/tmp/external-smoke/AGENTS.md",
        },
      });

    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.adapterType).toBe("external_smoke");
  }, 20_000);
});
