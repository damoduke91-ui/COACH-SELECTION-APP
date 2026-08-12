import { defineConfig, devices } from "@playwright/test";

const vercelAutomationBypassSecret =
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PREVIEW_BASE_URL,
    extraHTTPHeaders: vercelAutomationBypassSecret
      ? {
          "x-vercel-protection-bypass": vercelAutomationBypassSecret,
          "x-vercel-set-bypass-cookie": "true",
        }
      : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
});
