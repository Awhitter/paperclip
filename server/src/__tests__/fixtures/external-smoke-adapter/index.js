export function createServerAdapter() {
  return {
    type: "external_smoke",
    models: [{ id: "smoke-model", label: "Smoke Model" }],
    supportsLocalAgentJwt: true,
    supportsInstructionsBundle: true,
    instructionsPathKey: "instructionsFilePath",
    requiresMaterializedRuntimeSkills: false,
    sessionManagement: {
      supportsSessionResume: true,
      nativeContextManagement: "confirmed",
      defaultSessionCompaction: {
        enabled: true,
        maxSessionRuns: 0,
        maxRawInputTokens: 0,
        maxSessionAgeHours: 0
      }
    },
    async detectModel() {
      return {
        model: "smoke-model",
        provider: "smoke-provider",
        source: "external smoke fixture",
        candidates: ["smoke-model", "fallback-model"]
      };
    },
    getConfigSchema() {
      return {
        fields: [
          {
            key: "profile",
            label: "Profile",
            type: "select",
            options: [{ label: "Default", value: "default" }],
            default: "default"
          },
          {
            key: "instructionsFilePath",
            label: "Agent instructions file",
            type: "text"
          }
        ]
      };
    },
    async execute(ctx) {
      await ctx.onMeta?.({
        adapterType: "external_smoke",
        command: "external-smoke",
        cwd: "/tmp/paperclip-external-smoke",
        prompt: "Smoke prompt",
        promptMetrics: { chars: 12 },
        context: ctx.context
      });
      await ctx.onLog("stdout", "external smoke adapter executed\n");
      return {
        exitCode: 0,
        signal: null,
        timedOut: false,
        sessionParams: { sessionId: "smoke-session" },
        sessionDisplayId: "smoke-session",
        model: "smoke-model",
        provider: "smoke-provider"
      };
    },
    async testEnvironment() {
      return {
        adapterType: "external_smoke",
        status: "pass",
        checks: [
          {
            code: "fixture_loaded",
            level: "info",
            message: "External smoke fixture loaded"
          }
        ],
        testedAt: "2026-04-23T00:00:00.000Z"
      };
    }
  };
}
