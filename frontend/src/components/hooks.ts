// 여러 화면에서 공유하는 DOM·화면 상태 훅입니다. 서버 조회 훅은 queries.ts 에 있습니다.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

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

/** 목록 상자에 몇 줄이 들어가는지 측정해서 반환합니다.
 *
 *  목록을 스크롤하지 않습니다. 들어가는 만큼만 표시하고 나머지는 pagination 으로 나눕니다.
 *  그래야 페이지네이션과 추가 버튼이 화면에서 항상 같은 위치에 있습니다.
 *
 *  줄 높이는 첫 줄을 실제로 측정해서 사용합니다. 글자 크기나 여백을 수정하면 값이 자동으로 반영됩니다.
 *  아직 줄이 없으면 fallback 높이를 사용합니다. 창 크기가 변경되면 다시 측정합니다.
 *
 *  ref 는 ref object 가 아니라 ref callback 입니다. 목록 상자는 상세 글을 열 때 DOM 에서 제거되고
 *  목록으로 돌아올 때 새 요소로 다시 생성됩니다. effect 로 감시하면 처음 상자만 계속 붙들고 있어,
 *  제거된 상자의 높이 0 이 count 를 1 로 만들고 새 상자는 측정되지 않습니다. ref callback 은
 *  요소가 바뀔 때마다 React 가 이전 것을 정리하고 다시 호출하므로 새 상자를 측정합니다. */
export function useFitCount(
  fallbackRowHeight: number,
): [(target: HTMLUListElement | null) => (() => void) | undefined, number] {
  const [count, setCount] = useState(1);

  const attach = useCallback((target: HTMLUListElement | null): (() => void) | undefined => {
    if (target === null) return undefined;

    const measure = (): void => {
      const row = target.querySelector("li");
      const height = row?.getBoundingClientRect().height || fallbackRowHeight;
      setCount(Math.max(1, Math.floor(target.clientHeight / height)));
    };

    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(target);
    return () => watch.disconnect();
  }, [fallbackRowHeight]);

  return [attach, count];
}
