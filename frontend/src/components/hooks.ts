// 화면이 함께 쓰는 훅.

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { fetchMe, getJSON, myTeamIds } from "../lib/pipeline";
import type { Account, Period, Room, Team } from "../lib/contract";

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
    .map((team, index) => ({ ...team, colorKey: `c${(index % 4) + 1}` }))
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
