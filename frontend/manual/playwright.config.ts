// 매뉴얼 그림을 캡쳐할 때의 설정입니다. E2E 설정(frontend/playwright.config.ts)과 별개입니다 —
// 검사는 동작을 판정하고, 이 설정은 그림을 생성합니다. 같은 설정에 두면 E2E 를 실행할 때마다
// 그림이 다시 생성됩니다.
import { defineConfig, devices } from "@playwright/test";

import { SCALE, STATE_PATH, VIEWPORT } from "./config";

const baseURL = "http://localhost:5173";
// container 안에서 npm install 뒤에 뜨므로 첫 응답까지 오래 걸릴 수 있습니다.
const DEV_SERVER_WAIT_MS = 120_000;
// 그림 1장마다 화면을 옮기고 기다리므로 검사 1개의 상한을 길게 둡니다.
const CAPTURE_TIMEOUT_MS = 900_000;

export default defineConfig({
  testDir: ".",
  testMatch: "capture.spec.ts",
  // 계정·합주실·팀·기간·예약·글을 만들고 로그인 cookie 를 STATE_PATH 에 저장합니다.
  globalSetup: "./seed.ts",
  timeout: CAPTURE_TIMEOUT_MS,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  // 동작 1개의 상한입니다. 기본값은 상한 없음이라, 선택자가 어긋나면 검사 상한(15분)까지 기다립니다.
  use: { baseURL, storageState: STATE_PATH, actionTimeout: 10_000 },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: false,
    timeout: DEV_SERVER_WAIT_MS,
  },
  projects: [
    {
      name: "chromium",
      // viewport 와 deviceScaleFactor 는 devices 뒤에 적습니다. devices 가 1280x720·1배를
      // 지정하므로 앞에 적으면 그 값으로 덮입니다.
      use: { ...devices["Desktop Chrome"], viewport: VIEWPORT, deviceScaleFactor: SCALE },
    },
  ],
});
