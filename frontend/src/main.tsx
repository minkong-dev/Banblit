import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { applyTheme, readSavedTheme } from "./lib/theme";
import { teamColorCss } from "./lib/teamColors";
import "./styles/base.css";

// 선택한 테마를 첫 렌더링 전에 적용합니다. 이후에 적용하면 밝은 화면이 한 번 깜박입니다.
applyTheme(readSavedTheme());

// 팀 색 20가지의 CSS 변수(--team-<색>)를 첫 렌더링 전에 넣습니다. 이후에 넣으면 달력 막대가 한 번 색 없이 그려집니다.
document.head.append(Object.assign(document.createElement("style"), { textContent: teamColorCss() }));

// 화면에 떠 있는 모든 query(TanStack Query 가 관리하는 서버 조회 하나)를 이 간격으로 refetch 합니다(20초는 사용자 결정, 2026-09-14). 배정 결과·다른 사용자의 예약·새 글·알림은
// 이 브라우저의 동작 없이 서버에서 변경되므로, refetch하지 않으면 새로고침 전에는 변경사항을 볼 수 없습니다.
// ponytail: 떠 있는 모든 query를 같은 간격으로 요청합니다. 서버 부하가 문제가 되면 query마다
// 간격을 따로 설정하거나 서버 푸시 방식(SSE, Server-Sent Events)으로 전환합니다.
const LIVE_REFETCH_MS = 20_000;

// refetch 재시도 횟수에 상한을 둡니다. 서버가 작동하지 않을 때 frontend가 계속 요청하면
// 사용자는 멈춘 화면만 보게 됩니다. 한 번 더 시도한 후 실패하면 오류 메시지를 표시합니다.
// 창으로 돌아왔을 때도 refetch 합니다. 다른 탭에 있던 동안 변경된 내용을 바로 볼 수 있게 합니다.
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
