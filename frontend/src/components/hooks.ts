// 여러 화면에서 공유하는 훅입니다.

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { colorKey, fetchMe, getJSON, myTeamIds } from "../lib/pipeline";
import type { Account, Period, Room, Team } from "../lib/contract";

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

/** 화면별 CSS는 body[data-page="..."] 속에 격리됩니다. data-page 속성을 설정/해제하는 곳입니다. */
export function usePage(page: string): void {
  useEffect(() => {
    document.body.dataset.page = page;
    return () => {
      delete document.body.dataset.page;
    };
  }, [page]);
}

/** 팀·합주실·기간 목록입니다. 여러 화면에서 같은 조회를 다시 작성하지 않습니다. queryKey 가 같아 cache 도 하나입니다. */
export function useTeams() {
  return useQuery({ queryKey: ["teams"], queryFn: () => getJSON<{ teams: Team[] }>("/teams") });
}
export function useRooms() {
  return useQuery({ queryKey: ["rooms"], queryFn: () => getJSON<{ rooms: Room[] }>("/rooms") });
}
/** 저장소 전체 설정입니다. 지금은 칸 하나의 크기(분) 하나뿐입니다.
 *  아직 받지 못했으면 slotMinutes 는 60 입니다. 서버 기본값과 같은 값이라, 받는 사이에
 *  화면이 잠깐 다른 격자를 그리는 일이 없습니다. */
export function useSlotMinutes(): number {
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => getJSON<{ slot_minutes: number }>("/settings"),
  });
  return query.data?.slot_minutes ?? 60;
}

export function usePeriods() {
  return useQuery({ queryKey: ["periods"], queryFn: () => getJSON<{ periods: Period[] }>("/periods") });
}

/** 현재 로그인한 계정과, 그 계정이 소속된 팀 번호들입니다.
 *  /me 가 teams 와 함께 반환됩니다. 팀 명단을 하나씩 조회하지 않아도 됩니다.
 *  아직 로드되지 않았으면 me는 null입니다. */
export function useMe(): {
  me: Account | null;
  teamIds: number[];
  teams: Team[];
} {
  const mine = useQuery({ queryKey: ["me"], queryFn: fetchMe, retry: false });
  const teamList = useTeams();

  // 이전 버전의 서버가 teams 없이 응답하면 소속 팀이 없는 것으로 처리합니다. 잠시 표시되었다가
  // 사라지는 "내 팀" 배지보다 처음부터 없는 편이 낫습니다.
  return {
    me: mine.data?.account ?? null,
    teamIds: myTeamIds(mine.data?.teams ?? []),
    teams: teamList.data?.teams ?? [],
  };
}

export type MyTeam = { id: number; name: string; colorKey: string };

/** 내가 속한 팀을 전체 팀 목록에서 필터링하고, 목록 내 순서로 색상을 할당합니다(스케줄러와
 *  같은 규칙입니다. 전체 팀 목록에서의 순서가 곧 달력 색입니다). 여러 화면에서 프로필 카드가
 *  사용합니다. 아직 로드되지 않았거나 실패하면 빈 배열을 반환합니다. 프로필 카드는 팀 없이도 렌더링됩니다. */
export function useMyTeams(): MyTeam[] {
  const { teamIds, teams } = useMe();
  return teams
    .map((team, index) => ({ ...team, colorKey: colorKey(index) }))
    .filter((team) => teamIds.includes(team.id));
}

/** 목록 상자에 몇 줄이 들어가는지 측정해서 반환합니다.
 *
 *  목록을 스크롤하지 않습니다. 들어가는 만큼만 표시하고 나머지는 pagination 으로 나눕니다.
 *  그래야 페이지네이션과 추가 버튼이 화면에서 항상 같은 위치에 있습니다.
 *
 *  줄 높이는 첫 줄을 실제로 측정해서 사용합니다. 글자 크기나 여백을 수정하면 값이 자동으로 반영됩니다.
 *  아직 줄이 없으면 fallback 높이를 사용합니다. 창 크기가 변경되면 다시 측정합니다. */
export function useFitCount(fallbackRowHeight: number): [RefObject<HTMLUListElement | null>, number] {
  const box = useRef<HTMLUListElement | null>(null);
  const [count, setCount] = useState(1);

  useEffect(() => {
    const target = box.current;
    if (target === null) return;

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

  return [box, count];
}
