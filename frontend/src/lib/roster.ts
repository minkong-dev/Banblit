// 팀 생성과 자리 배정의 검증과 이름 정의입니다. 화면이나 서버와 상호작용하지 않습니다.
// 검증 함수는 값이 유효하면 빈 문자열을, 아니면 사람이 읽을 수 있는 사유를 반환합니다.

import { INSTRUMENTS } from "./contract";
import type { Instrument, Member, MyTeam, TeamSlot } from "./contract";
import { teamColorKey } from "./teamColors";
import { uniqueNameMessage } from "./validate";

/** 배정 계산이 팀당 10명까지만 받습니다. 그보다 많은 자리는 생성해도 사용할 수 없습니다. */
export const MAX_SLOTS_PER_TEAM = 10;

export function teamNameMessage(name: string, taken: string[]): string {
  return uniqueNameMessage(name, taken, "팀");
}

/** 포지션마다 지정한 자리 수를 전송하기 전에 검증합니다. 서버도 같은 값을 다시 검증합니다. */
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

/** 팀 창에서 저장 전의 자리 하나입니다. 서버 slot id 가 저장한 뒤에야 생기므로 포지션과 번호로 식별합니다. */
export type Seat = { instrument: Instrument; ordinal: number; label: string; member: Member | null };

export function seatKey(instrument: Instrument, ordinal: number): string {
  return `${instrument}:${ordinal}`;
}

/** 포지션마다 설정한 수만큼 자리를 생성하고, members 에서 같은 포지션·번호의 멤버를 지정합니다.
 *  수를 감소시켜 삭제된 자리의 멤버는 목록에 표시되지 않고 저장되지도 않습니다. */
export function seatsOf(counts: Record<string, number>, members: ReadonlyMap<string, Member>): Seat[] {
  return INSTRUMENTS.flatMap((instrument) => {
    const count = counts[instrument] ?? 0;
    return Array.from({ length: count }, (_unused, index) => ({
      instrument,
      ordinal: index + 1,
      label: slotName(instrument, index + 1, count),
      member: members.get(seatKey(instrument, index + 1)) ?? null,
    }));
  });
}

/** 서버에 저장된 자리(saved)를 seats 와 같게 만드는 요청 목록입니다.
 *  서버는 한 멤버를 한 팀의 두 자리에 배치하는 요청을 거절하므로(team_slots_team_id_member_id_key), 멤버가 변경된 자리 중
 *  멤버가 있던 자리를 전부 먼저 해제하고(clear) 그 다음 지정합니다(assign). 두 멤버의 자리를 교환해도 거절되지 않습니다. */
export function seatChanges(
  seats: Seat[], saved: TeamSlot[],
): { clear: number[]; assign: { slotId: number; memberId: number }[] } {
  const wanted = new Map(seats.map((seat) => [seatKey(seat.instrument, seat.ordinal), seat.member?.id ?? null]));
  const wantedOf = (slot: TeamSlot): number | null => wanted.get(seatKey(slot.instrument, slot.ordinal)) ?? null;
  const changed = saved.filter((slot) => wantedOf(slot) !== slot.member_id);
  return {
    clear: changed.filter((slot) => slot.member_id !== null).map((slot) => slot.id),
    assign: changed.flatMap((slot) => {
      const memberId = wantedOf(slot);
      return memberId === null ? [] : [{ slotId: slot.id, memberId }];
    }),
  };
}

/** 사람 이름 옆에 기수를 붙입니다. 동명이인을 화면에서 구분하는 값이 기수뿐입니다. */
export function memberLabel(name: string, cohort: number | null): string {
  return cohort === null ? name : `${name} (${cohort}기)`;
}

type TeamRow = { team_id: number; team: string };

/** 달력에 표시되는 팀입니다. 서버 규격(lib/contract 의 Team)이 아니라 확정된 일정에서
 *  생성하여 사용합니다. 색(key)과 내 팀인지(mine)를 함께 포함합니다. */
export type DayTeam = { id: number; name: string; key: string; mine: boolean };

export function teamsOf(
  rows: TeamRow[],
  myTeamIds: number[],
  allTeams: readonly { id: number; color: string }[],
): DayTeam[] {
  // 확정된 일정에 나온 팀을 번호 순서대로 수집합니다. 색은 전체 팀 목록(allTeams)에 저장된 팀 색입니다.
  // 프로필 카드(components/queries useMyTeams)도 같은 값을 쓰므로 같은 팀이 두 곳에서 다른 색으로 표시되지 않습니다.
  // 목록을 아직 받지 못한 팀은 색 없는 key(pending-<번호>)를 받습니다. 팀마다 다른 값이어야, key 로 팀을 찾는
  // 비교(DayDialog 의 entry.team === team.key)가 두 팀을 같은 팀으로 보지 않습니다.
  // mine 은 myTeamIds(로그인한 계정이 실제로 배정된 자리)로 결정합니다.
  const seen = new Map<number, string>();
  for (const row of rows) {
    if (!seen.has(row.team_id)) seen.set(row.team_id, row.team);
  }
  const mine = new Set(myTeamIds);
  const colors = new Map(allTeams.map((team) => [team.id, team.color]));
  return [...seen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, name]) => {
      const color = colors.get(id);
      const key = color === undefined ? `pending-${id}` : teamColorKey(color);
      return { id, name, key, mine: mine.has(id) };
    });
}

/** /me 에서 받은 자리 목록에서 팀 번호만 추출합니다. 한 팀에는 자리가 하나뿐이므로 중복되지 않습니다. */
export function myTeamIds(teams: MyTeam[]): number[] {
  return teams.map((item) => item.team_id);
}

/** 팀 목록 화면에 표시할 팀입니다. manages 가 true 이면 전체 팀, false 이면 teamIds 에 포함된 팀만 반환합니다. */
export function teamsShown<T extends { id: number }>(teams: T[], teamIds: number[], manages: boolean): T[] {
  return manages ? teams : teams.filter((team) => teamIds.includes(team.id));
}
