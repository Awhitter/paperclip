import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 30_000,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 15_000,
  },
});
