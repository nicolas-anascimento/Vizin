import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3210";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node --import tsx backend/src/app.ts",
    url: `${baseURL}/api/saude`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL || "",
      APP_URL: baseURL,
      FRONTEND_ORIGINS: baseURL,
      PORT: String(new URL(baseURL).port || 80),
      NODE_ENV: "test",
      MP_ACCESS_TOKEN: "",
    },
  },
  reporter: [["list"]],
});
