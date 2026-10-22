// 원고(manual.html)를 PDF 로 출력하는 설정입니다. Vite 개발 서버와 서버 데이터 없이 실행합니다.
import { defineConfig, devices } from "@playwright/test";

const PDF_TIMEOUT_MS = 300_000;

export default defineConfig({
  testDir: ".",
  testMatch: "pdf.spec.ts",
  timeout: PDF_TIMEOUT_MS,
  workers: 1,
  retries: 0,
  reporter: "list",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
