// 화면이 함께 쓰는 훅.

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { colorKey, fetchMe, getJSON, myTeamIds } from "../lib/pipeline";
import type { Account, Period, Room, Team } from "../lib/contract";

/** 눌러서 여는 말풍선 하나. 열려 있는 동안 바깥을 누르거나 Escape 를 누르면 닫힌다.
 *  돌려주는 box 는 여는 단추와 말풍선을 함께 감싼 자리에 건다 — 단추를 누른 것까지
 *  바깥으로 세면, 닫고 곧바로 다시 여는 것이 되어 말풍선이 닫히지 않는다. */
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
    // mousedown 으로 듣는다. click 으로 들으면 누른 자리의 단추가 먼저 반응해,
    // 닫으려고 누른 것이 그 단추를 누른 것으로도 세어진다.
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // setOpen 은 늘 같은 함수라 열고 닫힐 때만 다시 건다.
  }, [open]);

  return { open, setOpen, toggle: () => setOpen((on) => !on), box };
}

/** 화면 CSS 는 body[data-page="..."] 안에 갇혀 있다. data-page 를 걸고 떼는 곳. */
export function usePage(page: string): void {
  useEffect(() => {
    document.body.dataset.page = page;
    return () => {
      delete document.body.dataset.page;
    };
  }, [page]);
}

/** 팀·합주실·기간 목록. 화면마다 같은 질의를 다시 적지 않는다 — 열쇠가 같아 캐시도 하나다. */
export function useTeams() {
  return useQuery({ queryKey: ["teams"], queryFn: () => getJSON<{ teams: Team[] }>("/teams") });
}
export function useRooms() {
  return useQuery({ queryKey: ["rooms"], queryFn: () => getJSON<{ rooms: Room[] }>("/rooms") });
}
export function usePeriods() {
  return useQuery({ queryKey: ["periods"], queryFn: () => getJSON<{ periods: Period[] }>("/periods") });
}

/** 지금 로그인한 계정과, 그 계정이 자리를 갖고 있는 팀 번호들.
 *  /me 가 teams 로 함께 준다 — 팀 명단을 하나씩 훑지 않아도 된다.
 *  아직 못 불러왔으면 me 는 null 이다. */
export function useMe(): {
  me: Account | null;
  teamIds: number[];
  teams: Team[];
} {
  const mine = useQuery({ queryKey: ["me"], queryFn: fetchMe, retry: false });
  const teamList = useTeams();

  // 낡은 서버가 teams 없이 답하면 아무 자리도 없는 것으로 본다 — 잠깐 보였다
  // 사라지는 "내 팀" 배지보다 처음부터 없는 편이 낫다.
  return {
    me: mine.data?.account ?? null,
    teamIds: myTeamIds(mine.data?.teams ?? []),
    teams: teamList.data?.teams ?? [],
  };
}

export type MyTeam = { id: number; name: string; colorKey: string };

/** 내가 속한 팀을 전체 팀 목록에서 골라내고, 목록 안 순서로 색을 매긴다(스케줄러와
 *  같은 규칙 — 전체 팀 목록에서의 순서가 곧 달력 색이다). 프로필 말풍선이 화면마다
 *  쓴다. 아직 못 불러왔거나 실패하면 빈 배열을 돌려준다 — 말풍선은 팀 없이도 그려진다. */
export function useMyTeams(): MyTeam[] {
  const { teamIds, teams } = useMe();
  return teams
    .map((team, index) => ({ ...team, colorKey: colorKey(index) }))
    .filter((team) => teamIds.includes(team.id));
}

/** 목록 상자에 몇 줄이 들어가는지 재서 돌려준다.
 *
 *  목록을 스크롤하지 않는다 — 들어가는 만큼만 보여주고 나머지는 쪽으로 넘긴다.
 *  그래야 쪽 넘기기와 만드는 단추가 화면에서 늘 같은 자리에 있다.
 *
 *  줄 높이는 첫 줄을 실제로 재서 쓴다. 글자 크기나 여백을 고치면 값이 저절로 따라온다.
 *  아직 줄이 하나도 없으면 fallback 을 쓴다. 창 크기가 바뀌면 다시 잰다. */
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
