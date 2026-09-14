// 팀 생성과 자리 배정의 검증과 이름 정의입니다. 화면과 서버는 건드리지 않습니다.
// 검증 함수는 값이 유효하면 빈 문자열을, 아니면 사람이 읽을 수 있는 사유를 반환합니다.

import type { Instrument, MyTeam } from "./contract";
import { uniqueNameMessage } from "./validate";

/** 배정 계산이 팀당 10명까지만 받습니다. 그보다 많은 자리는 생성해도 사용할 수 없습니다. */
export const MAX_SLOTS_PER_TEAM = 10;

export function teamNameMessage(name: string, taken: string[]): string {
  return uniqueNameMessage(name, taken, "팀");
}

/** 포지션마다 몇 자리인지 정한 것을 전송하기 전에 검증합니다. 서버도 같은 것을 다시 검증합니다. */
export function slotCountsMessage(counts: Record<string, number>): string {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total === 0) return "포지션을 한 자리 이상 추가해주세요.";
  if (total > MAX_SLOTS_PER_TEAM) {
    return `팀 당 ${MAX_SLOTS_PER_TEAM} 자리의 포지션까지만 추가가 가능해요.`;
  }
  return "";
}

/** 자리 이름입니다. 같은 포지션이 1자리뿐이면 번호를 붙이지 않습니다. \"드럼 1\"은 불필요합니다. */
export function slotName(
  instrument: Instrument, ordinal: number, sameInstrumentCount: number,
): string {
  return sameInstrumentCount > 1 ? `${instrument} ${ordinal}` : instrument;
}

/** 사람 이름 옆에 기수를 붙입니다. 동명이인을 화면에서 구분하는 값이 이것뿐입니다. */
export function memberLabel(name: string, cohort: number | null): string {
  return cohort === null ? name : `${name} (${cohort}기)`;
}

export type TeamRow = { team_id: number; team: string };

// 달력과 목록에 사용되는 팀 색은 네 가지를 순환합니다. CSS 변수 --c1~--c4 와 짝입니다.
const TEAM_COLORS = 4;

/** 목록에서 index(목록에서의 위치 번호) 번째 팀에 줄 색 이름입니다. 목록 안 순서가 곧 색이므로,
 *  같은 목록을 다시 표시하면 같은 색이 나옵니다. */
export function colorKey(index: number): string {
  return `c${(index % TEAM_COLORS) + 1}`;
}

/** 달력에 표시되는 팀입니다. 서버 규격(lib/contract 의 Team)이 아니라 확정된 일정에서
 *  생성하여 사용합니다. 색(key)과 내 팀인지(mine)를 함께 포함합니다. */
export type DayTeam = { id: number; name: string; key: string; mine: boolean };

export function teamsOf(
  rows: TeamRow[],
  myTeamIds: number[],
  allTeams: readonly { id: number }[],
): DayTeam[] {
  // 확정된 일정에 나온 팀을 번호 순서대로 수집합니다. 색은 전체 팀 목록(allTeams)에서의
  // 위치로 매깁니다. 이는 프로필 카드(components/hooks useMyTeams)와 같은 규칙이므로 같은 팀이
  // 두 곳에서 다른 색으로 보이지 않습니다. 목록을 아직 받지 못했으면 일정 순서로 임시로 칠합니다.
  // mine 은 목록에서의 위치가 아니라 myTeamIds(로그인한 계정이 실제로 앉은 자리)로 결정합니다.
  const seen = new Map<number, string>();
  for (const row of rows) {
    if (!seen.has(row.team_id)) seen.set(row.team_id, row.team);
  }
  const mine = new Set(myTeamIds);
  return [...seen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, name], index) => {
      const at = allTeams.findIndex((team) => team.id === id);
      return { id, name, key: colorKey(at === -1 ? index : at), mine: mine.has(id) };
    });
}

/** /me 에서 받은 자리 목록에서 팀 번호만 추출합니다. 한 팀에는 자리가 하나뿐이므로 중복되지 않습니다. */
export function myTeamIds(teams: MyTeam[]): number[] {
  return teams.map((item) => item.team_id);
}
