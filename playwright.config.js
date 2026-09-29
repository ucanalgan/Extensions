import { defineConfig } from "@playwright/test";

export const PORT = 4319;

export default defineConfig({
  testDir: "tests/sendry/e2e",
  // Each test launches its own Chromium with the unpacked extension; running them one at a time
  // keeps the machine responsive and the service worker startup predictable.
  workers: 1,
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  webServer: {
    command: `node tests/sendry/e2e/server.js ${PORT}`,
    port: PORT,
    reuseExistingServer: true
  }
});
