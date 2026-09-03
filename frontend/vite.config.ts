import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 화면은 5173 에서 돌고 API 는 8000 에서 돈다. 브라우저는 받아온 곳이 아닌 데로
// 값을 물으면 막으므로, 개발 서버가 아래 경로를 API 로 대신 넘겨준다.
const API_PATHS = ["/health", "/assign", "/periods"];

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: Object.fromEntries(
      API_PATHS.map((path) => [
        path,
        { target: process.env.API_ORIGIN ?? "http://localhost:8000", changeOrigin: true },
      ]),
    ),
  },
  test: {
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
