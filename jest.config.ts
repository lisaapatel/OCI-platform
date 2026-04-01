import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jsdom",
  preset: "ts-jest",
  maxWorkers: 1,
  testTimeout: 10_000,
  forceExit: true,
  detectOpenHandles: true,
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^server-only$": "<rootDir>/__tests__/mocks/server-only.ts",
  },
  globals: {
    "ts-jest": {
      tsconfig: {
        // Ensure compile-time type assertions fail the test run.
        isolatedModules: false,
      },
      diagnostics: true,
    },
  },
};

export default config;
