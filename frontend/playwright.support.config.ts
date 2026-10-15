import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testIgnore: [], testMatch: "**/support.spec.ts", timeout: 90000,
  webServer: {
    command: '"../backend/.venv/Scripts/python.exe" ../backend/tests/serve_platform.py',
    url: "http://127.0.0.1:5031/health", reuseExistingServer: false, timeout: 30000,
  },
});
