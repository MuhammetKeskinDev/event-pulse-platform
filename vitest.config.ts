import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: [
        "src/domain/rules/**/*.ts",
        "src/domain/notifications/**/*.ts",
        "src/application/use-cases/evaluate-alert-rules.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@src": path.resolve(__dirname, "src"),
    },
  },
});
