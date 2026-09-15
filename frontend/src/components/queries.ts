// 여러 화면에서 공유하는 서버 조회 훅입니다. DOM·화면 상태 훅은 hooks.ts 에 있습니다.

import { useQuery } from "@tanstack/react-query";

import { colorKey, fetchMe, getJSON, myTeamIds } from "../lib/pipeline";
import type { Account, Period, Room, Team } from "../lib/contract";

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

/** 프로필 카드에 표시하는 소속 팀입니다. 서버가 반환하는 배정 자리(lib/contract 의 MyTeam)와 다른 자료형입니다. */
export type ProfileTeam = { id: number; name: string; colorKey: string };

/** 내가 속한 팀을 전체 팀 목록에서 필터링하고, 목록 내 순서로 색상을 할당합니다(스케줄러와
 *  같은 규칙입니다. 전체 팀 목록에서의 순서가 곧 달력 색입니다). 여러 화면에서 프로필 카드가
 *  사용합니다. 아직 로드되지 않았거나 실패하면 빈 배열을 반환합니다. 프로필 카드는 팀 없이도 렌더링됩니다. */
export function useMyTeams(): ProfileTeam[] {
  const { teamIds, teams } = useMe();
  return teams
    .map((team, index) => ({ ...team, colorKey: colorKey(index) }))
    .filter((team) => teamIds.includes(team.id));
}
