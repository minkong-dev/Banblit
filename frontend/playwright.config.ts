import { defineConfig, devices } from "@playwright/test";

import { E2E_STATE_PATH } from "./e2e/helpers";

// 화면은 e2e container 안에서 webServer 가 시작하는 Vite 개발 서버입니다. 같은 container 라 localhost 로 접속합니다.
const baseURL = "http://localhost:5173";
// container 안에서 매번 npm install 뒤에 시작하므로 첫 응답까지 오래 걸릴 수 있습니다.
const DEV_SERVER_WAIT_MS = 120_000;

export default defineConfig({
  testDir: "./e2e",
  // 계정·팀·합주실·기간을 만들고 로그인 상태를 E2E_STATE_PATH 에 저장합니다.
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  // 배정 계산을 기다리는 테스트는 각자 test.setTimeout 으로 늘립니다(assignment.spec.ts).
  // 테스트가 같은 데이터를 수정하므로 1개씩 실행합니다.
  fullyParallel: false,
  workers: 1,
  // 재시도하지 않습니다. 실패 원인을 trace 로 확인합니다.
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
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Safari 엔진입니다. 팝업 4종(프로필·알림·사진 변경·글자색)이 CSS anchor positioning 으로 위치를 잡으므로,
    // 그 테스트 2개만 WebKit 에서도 실행해 Safari 에서 팝업이 화면 밖으로 나가지 않는지 확인합니다.
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: /(popovers|profile-card)\.spec\.ts/ },
  ],
});
