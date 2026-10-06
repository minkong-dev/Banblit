// 원고(manual.html)를 PDF 로 출력할 때의 설정입니다. 캡쳐 설정과 분리한 이유는 2가지입니다 —
// 이 단계는 Vite 개발 서버와 서버 데이터가 필요하지 않고, 그림을 다시 캡쳐하지 않고 원고만
// 고쳐 PDF 를 다시 출력하는 경우가 더 자주 발생합니다.
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
