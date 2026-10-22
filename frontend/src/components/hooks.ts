// 여러 화면에서 공유하는 DOM·화면 상태 훅입니다. 서버 조회 훅은 queries.ts 에 있습니다.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import { socialNotice } from "../lib/account";
import { say } from "./toast";

/** 번호 하나로 열림 상태를 관리하고, id 마다 등록된 버튼을 Map 으로 기억했다가 닫힐 때
 *  그 버튼으로 초점을 되돌립니다. 설정 화면의 행 편집(routes/SettingsForm.tsx)과 게시판 상세
 *  전환(components/PostBoard.tsx 의 usePostBoard)이 같은 구조라 이 훅 하나를 공유합니다.
 *  openFocus 는 열릴 때 초점을 옮길 대상의 ref 입니다 — 아무 요소에도 연결하지 않으면
 *  focus() 호출이 아무 일도 하지 않으므로, 열 때 초점을 옮기지 않는 화면은 그대로 무시하면 됩니다. */
// <Focus extends HTMLElement = HTMLElement> 는 generic 매개변수입니다. 호출부가 타입을 지정하지 않으면 = 뒤의 HTMLElement 를 씁니다.
export function useReturnFocus<Focus extends HTMLElement = HTMLElement>(
  /** 열림 상태를 바깥(주소 등)이 보유할 때 넘깁니다. 없으면 이 훅이 state 로 보유합니다. */
  controlled?: { openId: number | null; setOpenId: (id: number | null) => void },
): {
  openId: number | null;
  open: (id: number) => void;
  close: () => void;
  register: (id: number) => (el: HTMLButtonElement | null) => void;
  openFocus: RefObject<Focus | null>;
} {
  const own = useState<number | null>(null);
  // 두 경우 모두 [값, 설정 함수] 모양의 tuple 이라 같은 구조 분해로 받습니다. hook 은 조건 없이 항상 호출하고 결과만 고릅니다.
  const [openId, setOpenId] = controlled === undefined ? own : [controlled.openId, controlled.setOpenId];
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  // 돌아갈 버튼 ID를 state가 아닌 ref로 보유합니다. state로 보유하면 초점 이동 후 값을 초기화하는 과정에서 불필요한 재생성이 발생합니다.
  // 직전에 열려 있던 ID 도 기억합니다. 주소가 열림 상태를 보유하면 브라우저 뒤로 가기로도 닫히는데, 그 경로는 close() 를 거치지 않습니다.
  const back = useRef<number | null>(null);
  const previous = useRef<number | null>(null);
  const openFocus = useRef<Focus>(null);

  useEffect(() => {
    const target = back.current ?? previous.current;
    previous.current = openId;
    if (openId !== null) {
      openFocus.current?.focus();
      return;
    }
    if (target === null) return;
    buttons.current.get(target)?.focus();
    back.current = null;
  }, [openId]);

  return {
    openId,
    open: (id) => setOpenId(id),
    close: () => {
      back.current = openId;
      setOpenId(null);
    },
    // register(id) 는 그 id 전용 ref callback 을 반환합니다. React 는 ref 에 넘긴 함수를 요소가 붙을 때 el 로, 떨어질 때 null 로 호출합니다.
    register: (id) => (el) => {
      if (el === null) buttons.current.delete(id);
      else buttons.current.set(id, el);
    },
    openFocus,
  };
}

/** 주소의 번호 자리(:postId 등)를 정수로 읽습니다. 없거나 정수가 아니면 null 입니다 — /notices/abc 가 NaN 상세를 열지 않게 합니다. */
export function idParam(value: string | undefined): number | null {
  const id = Number(value);
  return value !== undefined && Number.isInteger(id) ? id : null;
}

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
  // 렌더링 중의 setState 는 React 가 허용하는 방식입니다(이전 렌더링의 값과 비교해 state 를 갱신). 같은 컴포넌트의 state 만 변경하고 DOM 은 건드리지 않습니다.
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

/** popover(HTML popover 속성, 바깥 클릭·Escape 로 자동으로 닫히는 브라우저 기본 팝업) 요소는
 *  경로가 바뀌어도 스스로 닫히지 않습니다 — 브라우저는 라우팅을 모릅니다. 경로가 바뀌면
 *  id 로 지정한 popover 를 직접 닫습니다. useDismissible 이 하던 것과 같은 useLocation 비교입니다. */
export function usePopoverRouteClose(id: string): void {
  const { pathname } = useLocation();
  const seenPath = useRef(pathname);
  // hidePopover 는 DOM 을 변경하므로 렌더링 중이 아니라 effect 에서 호출합니다. 첫 렌더링과 같은 주소에서는 호출하지 않습니다.
  useEffect(() => {
    if (seenPath.current === pathname) return;
    seenPath.current = pathname;
    document.getElementById(id)?.hidePopover();
  }, [id, pathname]);
}

// 가장 이른 일정 막대 위에 남기는 여백(px)입니다.
const FIRST_GAP = 12;

/** 반환한 ref 의 스크롤 영역을 data-first 요소가 맨 위에 오도록 스크롤합니다. first 가 바뀔 때만 다시 스크롤합니다.
 *  날짜 modal 의 타임라인(routes/DayDialogParts)과 불가능 일정 캘린더의 하루 modal(routes/UnavailableCalendar)이 같이 씁니다. */
export function useScrollToFirst(first: number | null): RefObject<HTMLDivElement | null> {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = box.current?.querySelector<HTMLElement>("[data-first]");
    if (!box.current || !target) return;
    box.current.scrollTop += target.getBoundingClientRect().top - box.current.getBoundingClientRect().top - FIRST_GAP;
  }, [first]);
  return box;
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

/** 소셜 로그인 callback 이 붙인 ?social=, ?detail= 을 toast 로 1회 표시하고 주소에서 삭제합니다.
 *  삭제하지 않으면 새로고침마다 같은 문구가 다시 표시됩니다. 로그인 화면(routes/Account)과 프로필 화면(routes/Profile)이 같이 씁니다. */
export function useSocialNotice(): void {
  const [params, setParams] = useSearchParams();
  const notice = socialNotice(params.get("social"), params.get("detail"));
  useEffect(() => {
    if (notice === "") return;
    say(notice);
    setParams((next) => {
      next.delete("social");
      next.delete("detail");
      return next;
    }, { replace: true });
  }, [notice, setParams]);
}
