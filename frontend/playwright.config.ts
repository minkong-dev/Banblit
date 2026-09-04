import { defineConfig, devices } from "@playwright/test";

// docker-compose.yml 의 e2e 서비스가 E2E_BASE_URL 을 http://web:5173 로 준다.
// 컨테이너 사이는 서비스 이름으로 닿는다 — localhost 가 아니다. 기본값은 이 config
// 를 컨테이너 밖에서 불러 읽기만 할 때(타입 검사 등)를 위한 자리이며, 브라우저는
// 호스트에 깔지 않으므로 실제로 이 기본값으로 검사가 도는 일은 없다.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
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
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
