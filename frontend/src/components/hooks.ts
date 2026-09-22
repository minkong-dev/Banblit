// 여러 화면에서 공유하는 DOM·화면 상태 훅입니다. 서버 조회 훅은 queries.ts 에 있습니다.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useLocation } from "react-router-dom";

/** 클릭으로 여는 팝업 하나입니다. 열려 있는 동안 바깥을 누르거나 Escape를 누르면 닫힙니다.
 *  반환되는 box ref 는 열기 버튼과 팝업을 감싼 요소에 연결합니다. 버튼 클릭까지 외부 클릭으로 감지하면,
 *  닫은 후 곧바로 다시 열려 팝업이 닫히지 않기 때문입니다. */
export function useDismissible(): {
  open: boolean;
  setOpen: (next: boolean) => void;
  toggle: () => void;
  box: RefObject<HTMLDivElement | null>;
} {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // 주소가 바뀌면(뒤로 가기처럼 클릭이 없는 이동 포함) 닫습니다. 상단바는 화면을 이동해도 유지되므로
  // 열림 상태가 저절로 초기화되지 않습니다. effect 대신 렌더링 중에 비교해 이동한 화면이 처음부터 닫힌 상태로 그려집니다.
  const { pathname } = useLocation();
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      if (box.current !== null && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    // mousedown 이벤트로 감지합니다. click으로 감지하면 누른 버튼이 먼저 처리되어,
    // 닫으려고 누른 동작이 그 버튼 클릭으로도 세어집니다.
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // setOpen은 항상 같은 함수이므로 열고 닫힐 때만 의존성을 다시 설정합니다.
  }, [open]);

  return { open, setOpen, toggle: () => setOpen((on) => !on), box };
}

/** 화면별 CSS는 body[data-page="..."] 속에 격리됩니다. data-page 속성을 설정/해제하는 곳입니다.
 *  AppShell 의 data-shell 과 같은 이유로 useLayoutEffect 입니다. 자식 effect 가 크기를 잴 때 속성이 비어 있지 않게 합니다. */
export function usePage(page: string): void {
  useLayoutEffect(() => {
    document.body.dataset.page = page;
    return () => {
      delete document.body.dataset.page;
    };
  }, [page]);
}
