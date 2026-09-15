import { defineConfig, devices } from "@playwright/test";

import { E2E_STATE_PATH } from "./e2e/helpers";

// 화면은 e2e 컨테이너 안에서 webServer 가 띄우는 Vite 개발 서버입니다. 같은 컨테이너라 localhost 로 닿습니다.
const baseURL = "http://localhost:5173";
// 컨테이너 안에서 매번 npm install 뒤에 뜨므로 첫 응답까지 오래 걸릴 수 있습니다.
const DEV_SERVER_WAIT_MS = 120_000;

export default defineConfig({
  testDir: "./e2e",
  // 계정·팀·합주실·기간을 만들고 로그인 상태를 E2E_STATE_PATH 에 저장합니다.
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  // 배정 계산을 기다리는 검사는 각자 test.setTimeout 으로 따로 늘린다(assignment.spec.ts).
  fullyParallel: false,
  workers: 1,
  // 검사가 저장된 데이터를 고치고 되돌리는 방식이라 동시에 돌면 서로 값을 밟는다.
  // ponytail: 재시도로 뭉개지 않는다 — 실패는 원인을 봐야 한다. 불안정해지면 그때 늘린다.
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    storageState: E2E_STATE_PATH,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: false,
    timeout: DEV_SERVER_WAIT_MS,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
