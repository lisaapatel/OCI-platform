import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jsdom",
  preset: "ts-jest",
  maxWorkers: 1,
  testTimeout: 10_000,
  forceExit: true,
  detectOpenHandles: true,
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  // mrz is ESM-only; allow ts-jest to transform it
  transformIgnorePatterns: ["node_modules/(?!(mrz)/)"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^server-only$": "<rootDir>/__tests__/mocks/server-only.ts",
    "\\.css$": "<rootDir>/__tests__/mocks/cssMock.ts",
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
