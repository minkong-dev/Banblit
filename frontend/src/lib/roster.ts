// 팀 만들기·자리 채우기의 검사와 이름 짓기. 화면도 서버도 건드리지 않는다.
// 검사 함수는 값이 성하면 빈 문자열을, 아니면 사람이 읽을 사유를 돌려준다.

import type { Instrument, MyTeam } from "./contract";

/** 배정 계산이 팀당 10명까지만 받는다 — 그보다 많은 자리는 만들어도 못 쓴다. */
export const MAX_SLOTS_PER_TEAM = 10;

export function teamNameMessage(name: string, taken: string[]): string {
  // name 을 taken 과 견줘, 비었거나 겹치면 그 사유를 돌려준다.
  // 앞뒤 공백을 뗀 뒤 견주므로 공백만 다른 이름도 겹친 것으로 본다 — settings.ts의
  // roomNameMessage와 같은 규칙이다.
  const trimmed = name.trim();
  if (!trimmed) return "팀 이름을 입력해 주세요.";
  const clash = taken.some((other) => other.trim() === trimmed);
  return clash ? "같은 이름의 팀이 이미 있습니다." : "";
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

/** 사람 하나 — 화면에는 번호가 아니라 이름과 소속으로 나온다. 동명이인이 있어 소속을 함께 붙인다. */
export type Person = { id: number; name: string; where: string };

export type RosterTeam = { id: number; name: string };
export type RosterMember = { id: number; name: string; cohort: number | null };

export function peopleOf(
  teams: RosterTeam[], rosters: (RosterMember[] | undefined)[],
): Person[] {
  // 팀마다 받아 둔 명단을 사람 번호로 합쳐, 이름 순으로 늘어놓는다. 두 팀에 걸친
  // 사람은 소속을 이어 붙여 한 줄로 만든다. 아직 못 받은 명단(undefined)은 건너뛴다.
  const found = new Map<number, Person>();
  teams.forEach((team, index) => {
    for (const member of rosters[index] ?? []) {
      const already = found.get(member.id);
      found.set(member.id, {
        id: member.id,
        name: memberLabel(member.name, member.cohort),
        where: already === undefined ? team.name : `${already.where}, ${team.name}`,
      });
    }
  });
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/** /me 가 준 자리 목록에서 팀 번호만 뽑는다. 한 팀에 자리는 하나뿐이라 겹치지 않는다. */
export function myTeamIds(teams: MyTeam[]): number[] {
  return teams.map((item) => item.team_id);
}
