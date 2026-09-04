import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 화면은 5173 에서 돌고 API 는 8000 에서 돈다. 브라우저는 받아온 곳이 아닌 데로
// 값을 물으면 막으므로, 개발 서버가 대신 넘겨준다.
// 화면은 서버 통로를 /api/... 로 부른다(frontend/src/lib/api.ts 의 API_PREFIX).
// 개발 서버는 그 하나만 넘기면서 접두사를 떼어 준다 — 서버는 /periods 로 알고 있고
// /api/periods 를 모른다. 배포에서는 frontend/nginx.conf.template 이 같은 일을 한다.
const API_PREFIX = "/api";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Vite 는 낯선 Host 헤더를 기본으로 막는다. e2e 컨테이너는 이 서비스를
    // localhost 가 아니라 "web"(컨테이너 사이 서비스 이름)으로 부르므로 허용해 둔다.
    allowedHosts: ["web"],
    // 윈도우 폴더를 컨테이너에 걸면 파일이 바뀌었다는 알림이 컨테이너 안까지
    // 오지 않는다. 그러면 개발 서버가 이미 고친 코드를 계속 물고 있어, 고쳐도
    // 화면이 안 바뀌는 것을 코드 문제로 오진하게 된다. 직접 들여다보게 한다.
    watch: { usePolling: true, interval: 300 },
    proxy: {
      [API_PREFIX]: {
        target: process.env.API_ORIGIN ?? "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.slice(API_PREFIX.length),
      },
    },
  },
  test: {
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
