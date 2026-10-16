import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 화면은 5173, api 는 8000 port 에서 실행됩니다. 브라우저는 다른 출처로 보내는 요청을 막으므로 개발 서버가 proxy 합니다.
// 화면은 api 를 /api/... 로 호출하고(frontend/src/lib/api.ts 의 API_PREFIX), 개발 서버는 /api 접두사를 삭제해 전달합니다.
// 배포에서는 frontend/nginx.conf.template 이 같은 일을 합니다.
const API_PREFIX = "/api";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Windows 폴더를 volume 으로 연결하면 파일 변경 이벤트가 container 에 전달되지 않습니다.
    // 300ms 마다 polling(주기적으로 파일을 다시 확인하는 방식)합니다.
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
