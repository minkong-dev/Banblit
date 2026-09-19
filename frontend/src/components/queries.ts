// 여러 화면에서 공유하는 서버 조회 훅입니다. DOM·화면 상태 훅은 hooks.ts 에 있습니다.

import { useQuery } from "@tanstack/react-query";

import { fetchMe, getJSON, myTeamIds } from "../lib/pipeline";
import { teamColorKey } from "../lib/teamColors";
import type { Account, Period, Room, Team } from "../lib/contract";

/** 팀·합주실·기간 목록입니다. 여러 화면에서 같은 조회를 다시 작성하지 않습니다. queryKey 가 같아 cache 도 하나입니다. */
export function useTeams() {
  return useQuery({ queryKey: ["teams"], queryFn: () => getJSON<{ teams: Team[] }>("/teams") });
}
export function useRooms() {
  return useQuery({ queryKey: ["rooms"], queryFn: () => getJSON<{ rooms: Room[] }>("/rooms") });
}
/** 저장소 전체 설정입니다. 칸 하나의 크기(slotMinutes)와 합주 1회 길이(sessionMinutes)입니다.
 *  칸은 합주를 시작할 수 있는 간격이고, 합주 길이는 한 번 시작하면 이어지는 시간입니다.
 *  아직 받지 못했으면 둘 다 60 입니다. 서버 기본값과 같은 값이라, 받는 사이에
 *  화면이 잠깐 다른 격자를 그리는 일이 없습니다. */
export function useSettings(): { slotMinutes: number; sessionMinutes: number } {
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => getJSON<{ slot_minutes: number; session_minutes: number }>("/settings"),
  });
  return {
    slotMinutes: query.data?.slot_minutes ?? 60,
    sessionMinutes: query.data?.session_minutes ?? 60,
  };
}

/** 칸 하나의 크기(분)만 필요한 화면이 사용합니다. 달력을 그리는 곳이 대부분 그렇습니다. */
export function useSlotMinutes(): number {
  return useSettings().slotMinutes;
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

/** 내가 속한 팀을 전체 팀 목록에서 필터링하고, 팀에 저장된 색을 CSS key 로 붙입니다(스케줄러의 teamsOf 와
 *  같은 값입니다). 여러 화면에서 프로필 카드가 사용합니다. 아직 로드되지 않았거나 실패하면 빈 배열을 반환합니다.
 *  프로필 카드는 팀 없이도 렌더링됩니다. */
export function useMyTeams(): ProfileTeam[] {
  const { teamIds, teams } = useMe();
  return teams
    .filter((team) => teamIds.includes(team.id))
    .map((team) => ({ ...team, colorKey: teamColorKey(team.color) }));
}
