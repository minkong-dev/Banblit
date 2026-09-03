import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import "./styles/base.css";

// 되묻는 횟수에 상한을 둔다. 서버가 죽어 있을 때 화면이 조용히 계속 두드리면
// 사람은 멈춘 화면만 보게 된다. 한 번 더 해보고 안 되면 사유를 화면에 띄운다.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
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
