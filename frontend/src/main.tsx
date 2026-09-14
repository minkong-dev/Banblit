import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { applyTheme, readSavedTheme } from "./lib/theme";
import "./styles/base.css";

// 고른 밝기를 첫 그림 전에 붙인다. 그리고 나서 붙이면 밝은 화면이 한 번 번쩍인다.
applyTheme(readSavedTheme());

// 화면에 떠 있는 모든 조회를 이 간격으로 다시 받는다(20초는 사용자 결정, 2026-09-14). 배정 결과·남의 예약·새 글·알림은
// 이 브라우저의 동작 없이 서버에서 바뀌므로, refetch 하지 않으면 새로고침 전에는 영영 안 바뀐다.
// ponytail: 떠 있는 조회 전부를 같은 간격으로 묻는다. 서버 부하가 문제가 되면 조회마다
// 간격을 따로 주거나 서버가 밀어 주는 방식(SSE)으로 올린다.
const LIVE_REFETCH_MS = 20_000;

// 되묻는 횟수에 상한을 둔다. 서버가 죽어 있을 때 frontend 가 조용히 계속 두드리면
// 사람은 멈춘 화면만 보게 된다. 한 번 더 해보고 안 되면 사유를 화면에 띄운다.
// 창으로 돌아올 때도 다시 받는다 — 다른 탭에 갔다 온 사이 바뀐 것을 바로 보게 한다.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true, refetchInterval: LIVE_REFETCH_MS },
  },
});

const root = document.getElementById("root");
if (root === null) {
  throw new Error("index.html 에 #root 가 없습니다");
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
