// 팀 만들기·자리 채우기의 검사와 이름 짓기. 화면도 서버도 건드리지 않는다.
// 검사 함수는 값이 성하면 빈 문자열을, 아니면 사람이 읽을 사유를 돌려준다.

import type { Instrument, MyTeam } from "./contract";
import { uniqueNameMessage } from "./validate";

/** 배정 계산이 팀당 10명까지만 받는다 — 그보다 많은 자리는 만들어도 못 쓴다. */
export const MAX_SLOTS_PER_TEAM = 10;

export function teamNameMessage(name: string, taken: string[]): string {
  return uniqueNameMessage(name, taken, "팀");
}

/** 악기마다 몇 자리인지 정한 것을 보내기 전에 거른다. 서버도 같은 것을 다시 거른다. */
export function slotCountsMessage(counts: Record<string, number>): string {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total === 0) return "악기를 하나 이상 골라 주세요.";
  if (total > MAX_SLOTS_PER_TEAM) {
    return `한 팀의 자리는 ${MAX_SLOTS_PER_TEAM}개까지입니다.`;
  }
  return "";
}

/** 자리 이름. 같은 악기가 하나뿐이면 번호를 붙이지 않는다 — "드럼 1"은 군더더기다. */
export function slotName(
  instrument: Instrument, ordinal: number, sameInstrumentCount: number,
): string {
  return sameInstrumentCount > 1 ? `${instrument} ${ordinal}` : instrument;
}

/** 사람 이름 옆에 기수를 붙인다. 동명이인을 화면에서 가르는 값이 이것뿐이다. */
export function memberLabel(name: string, cohort: number | null): string {
  return cohort === null ? name : `${name} (${cohort}기)`;
}

export type TeamRow = { team_id: number; team: string };
export type DayTeam = { id: number; name: string; key: string; mine: boolean };

export function teamsOf(rows: TeamRow[], myTeamIds: number[]): DayTeam[] {
  // 확정된 시간표에 나온 팀을 번호 순으로 모으고, 자리 순서로 달력 색을 매긴다.
  // mine 은 목록에서의 자리가 아니라 myTeamIds(로그인한 계정이 실제로 앉은 자리)로 정한다.
  const seen = new Map<number, string>();
  for (const row of rows) {
    if (!seen.has(row.team_id)) seen.set(row.team_id, row.team);
  }
  const mine = new Set(myTeamIds);
  return [...seen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, name], index) => ({
      id,
      name,
      key: `c${(index % 4) + 1}`,
      mine: mine.has(id),
    }));
}

/** /me 가 준 자리 목록에서 팀 번호만 뽑는다. 한 팀에 자리는 하나뿐이라 겹치지 않는다. */
export function myTeamIds(teams: MyTeam[]): number[] {
  return teams.map((item) => item.team_id);
}
