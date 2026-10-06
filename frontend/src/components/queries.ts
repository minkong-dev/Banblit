// 여러 화면에서 공유하는 서버 조회 훅입니다. DOM·화면 상태 훅은 hooks.ts 에 있습니다.

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { fetchMe, getJSON, loadTeamMembers, myTeamIds } from "../lib/pipeline";
import { loadState, stillUnresolved } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import { teamColorKey } from "../lib/teamColors";
import type { Account, Period, Room, Team } from "../lib/contract";

/** 팀·합주실·기간 목록입니다. 여러 화면에서 같은 조회를 다시 작성하지 않습니다. queryKey 가 같아 cache 도 하나입니다.
 *
 *  enabled 를 false 로 주면 요청을 보내지 않고 data 가 undefined 로 남습니다. hook 은 조건문 안에서
 *  부를 수 없으므로, 화면의 어느 구역에서는 쓰고 어느 구역에서는 쓰지 않는 목록이 이 값을 사용합니다. */
export function useTeams(enabled = true) {
  return useQuery({ queryKey: ["teams"], queryFn: () => getJSON<{ teams: Team[] }>("/teams"), enabled });
}
export function useRooms(enabled = true) {
  return useQuery({ queryKey: ["rooms"], queryFn: () => getJSON<{ rooms: Room[] }>("/rooms"), enabled });
}
/** 저장소 전체 설정입니다. 칸 하나의 크기(slotMinutes)와 합주 1회 길이(sessionMinutes)입니다.
 *  칸은 합주를 시작할 수 있는 간격이고, 합주 길이는 한 번 시작하면 이어지는 시간입니다.
 *  아직 받지 못했으면 둘 다 60 입니다. 서버 기본값과 같은 값이라, 받는 사이에
 *  화면이 잠깐 다른 격자를 그리는 일이 없습니다. */
export function useSettings(): { slotMinutes: number; sessionMinutes: number; dailyMaxHours: number } {
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => getJSON<{ slot_minutes: number; session_minutes: number; daily_max_hours: number }>("/settings"),
  });
  return {
    slotMinutes: query.data?.slot_minutes ?? 60,
    sessionMinutes: query.data?.session_minutes ?? 60,
    // 팀 하나가 하루에 배정받는 시간의 상한입니다. 서버 기본값(3)과 같게 둡니다.
    dailyMaxHours: query.data?.daily_max_hours ?? 3,
  };
}

/** 칸 하나의 크기(분)만 필요한 화면이 사용합니다. 달력을 그리는 곳이 대부분 그렇습니다. */
export function useSlotMinutes(): number {
  return useSettings().slotMinutes;
}

export function usePeriods(enabled = true) {
  return useQuery({ queryKey: ["periods"], queryFn: () => getJSON<{ periods: Period[] }>("/periods"), enabled });
}

/** 현재 로그인한 계정과, 그 계정이 소속된 팀 번호들입니다.
 *  /me 가 teams 와 함께 반환됩니다. 팀 명단을 하나씩 조회하지 않아도 됩니다.
 *  아직 로드되지 않았으면 me는 null입니다. */
export function useMe(): {
  me: Account | null;
  /** /me 조회 상태입니다. Me 의 account 는 non-null 이므로 me 가 null 인 경우는 조회 중과
   *  조회 실패 둘이고, 그 둘에 표시할 문구가 다릅니다(불러오는 중 / 실패 사유).
   *  me 만으로는 구분할 수 없으므로 상태를 함께 반환합니다.
   *  로그아웃 상태는 /me 가 401 을 반환해 failed 가 되고, lib/api.ts 의 401 처리가 로그인
   *  화면으로 이동시킵니다. */
  meState: LoadState;
  /** 계정 조회가 한 번 실패한 뒤 아직 성공하지 못했는지입니다. 안내를 표시할지 판정하는 값입니다.
   *  meState 로 판정하지 않는 이유는 lib/loading 의 stillUnresolved 에 있습니다. */
  meUnresolved: boolean;
  teamIds: number[];
  teams: Team[];
} {
  const mine = useQuery({ queryKey: ["me"], queryFn: fetchMe, retry: false });
  const teamList = useTeams();

  // 이전 버전의 서버가 teams 없이 응답하면 소속 팀이 없는 것으로 처리합니다. 잠시 표시되었다가
  // 사라지는 "내 팀" 배지보다 처음부터 없는 편이 낫습니다.
  // 호출할 때마다 새 배열을 만들면, 이 값을 useMemo 의 의존성으로 받는 화면에서 그 useMemo 가
  // 렌더마다 다시 실행됩니다(routes/Scheduler 의 teams·assigned·bookEntries).
  const teamIds = useMemo(() => myTeamIds(mine.data?.teams ?? []), [mine.data]);
  const teams = useMemo(() => teamList.data?.teams ?? [], [teamList.data]);

  return {
    me: mine.data?.account ?? null,
    meState: loadState(mine),
    meUnresolved: stillUnresolved(mine),
    teamIds,
    teams,
  };
}

/** 프로필 카드에 표시하는 소속 팀입니다. 서버가 반환하는 배정 자리(lib/contract 의 MyTeam)와 다른 자료형입니다. */
type ProfileTeam = { id: number; name: string; colorKey: string };

/** 내가 속한 팀을 전체 팀 목록에서 필터링하고, 팀에 저장된 색을 CSS key 로 붙입니다(스케줄러의 teamsOf 와
 *  같은 값입니다). 여러 화면에서 프로필 카드가 사용합니다. 아직 로드되지 않았거나 실패하면 빈 배열을 반환합니다.
 *  프로필 카드는 팀 없이도 렌더링됩니다. */
export function useMyTeams(): ProfileTeam[] {
  const { teamIds, teams } = useMe();
  return teams
    .filter((team) => teamIds.includes(team.id))
    .map((team) => ({ ...team, colorKey: teamColorKey(team.color) }));
}

/** 소속 팀 목록에, 그 팀 명단에서 찾은 내 기수를 붙입니다. 이름이 아니라 번호로 자신을 찾습니다(동명이인 규칙).
 *  명단이 아직 오지 않았거나 조회가 실패하면 cohort 는 null 입니다. queryKey 는 날짜 dialog·프로필 화면과
 *  같아서 이미 받아 둔 명단이 있으면 다시 요청하지 않습니다. 저장하는 값의 모양이 같아야 하므로 셋 다
 *  loadTeamMembers(배열)를 씁니다. */
export function useMyTeamCohorts(): (ProfileTeam & { cohort: number | null })[] {
  const { me } = useMe();
  const teams = useMyTeams();
  const rosters = useQueries({
    queries: teams.map((team) => ({
      queryKey: ["members", team.id],
      queryFn: () => loadTeamMembers(team.id),
    })),
  });
  return teams.map((team, index) => ({
    ...team,
    cohort: rosters[index]?.data?.find((member) => member.id === me?.id)?.cohort ?? null,
  }));
}

export const SETS_KEY = ["permission-sets"] as const;
export const MEMBERS_KEY = ["member-roster"] as const;
/** 설정 화면의 멤버 구역이 수정하는 서버 자료입니다. 권한 집합을 수정·삭제하면 그 집합을 부여받은 멤버의 권한과
 *  로그인 계정의 권한(["me"])이 함께 바뀝니다. 셋 중 하나를 빠뜨리면 사이드바 메뉴가 옛 권한으로 남습니다. */
const MEMBER_AREA_KEYS: readonly (readonly string[])[] = [SETS_KEY, MEMBERS_KEY, ["me"]];

export function refreshMemberArea(client: QueryClient): void {
  for (const queryKey of MEMBER_AREA_KEYS) void client.invalidateQueries({ queryKey });
}
