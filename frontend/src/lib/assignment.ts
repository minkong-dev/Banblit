// 배정 화면(routes/Assignment)의 순수 계산입니다. 화면이나 서버와 상호작용하지 않습니다.

import { teamColorKey } from "./teamColors";
import { datesBetween, stampLabel } from "./calendar";
import { dayOf, mergeSessions } from "./slots";
import type { Session } from "./slots";
import type { AssignOut, ScheduleRow, Slot } from "./contract";

const MINUTES_PER_HOUR = 60;

/** 달력에 표시하는 대상입니다. 현재 확정된 시간표, n번째 조율안, 지난 배정기록 하나 중 하나입니다. */
export type View = { kind: "now" } | { kind: "proposal"; index: number } | { kind: "round"; at: string };
export const NOW: View = { kind: "now" };

// 탭은 문자열 키만 받습니다. 문자열과 View 를 변환하는 함수는 아래 2개뿐입니다.
export function tabKey(view: View): string {
  if (view.kind === "proposal") return `p${view.index}`;
  return view.kind === "round" ? `r:${view.at}` : "now";
}

export function viewOf(key: string): View {
  if (key.startsWith("p")) return { kind: "proposal", index: Number(key.slice(1)) };
  return key.startsWith("r:") ? { kind: "round", at: key.slice(2) } : NOW;
}

/** 팀별로 나뉘어 온 slot 을 하나의 목록으로 합쳐 연속된 slot 을 합주 한 번으로 묶습니다. */
export function sessionsOf(byTeam: Record<string, Slot[]>): Session[] {
  const flat: Session[] = [];
  for (const [team, slots] of Object.entries(byTeam)) {
    for (const slot of slots) {
      flat.push({ team, room: slot.room, start: slot.start, end: slot.end });
    }
  }
  return mergeSessions(flat);
}

/** 서버가 반환한 시간표 한 줄씩을 합주 목록으로 변환합니다. ScheduleRow 는 team_id·room_id 를
 *  함께 담지만 달력은 이름만 쓰므로 네 필드만 남기고, 맞닿은 slot 을 합주 한 번으로 묶습니다.
 *  확정된 시간표와 지난 배정기록이 같은 형식이라 두 곳이 이 함수를 씁니다. */
export function sessionsOfRows(rows: readonly ScheduleRow[]): Session[] {
  return mergeSessions(
    rows.map((row) => ({ team: row.team, room: row.room, start: row.start, end: row.end })),
  );
}

/** 합주 목록이 걸친 날짜 전부입니다. 첫 합주와 마지막 합주 사이에 합주가 없는 날짜도 들어갑니다 —
 *  달력이 그 칸도 그려야 합니다. 합주가 없을 경우 빈 목록을 반환합니다.
 *  sort 는 원본 배열을 수정하므로 map 으로 만든 사본을 정렬합니다. */
export function dayRangeOf(sessions: readonly Session[]): string[] {
  if (sessions.length === 0) return [];
  const starts = sessions.map((session) => session.start).sort();
  return datesBetween(dayOf(starts[0]), dayOf(starts[starts.length - 1]));
}

/** 배정 화면의 탭 목록입니다. 맨 앞은 현재 확정된 배정안이고, 그 뒤에 조율안이 A안·B안 순서로
 *  오며, 배정기록을 선택했을 경우 그 시각 탭이 맨 뒤에 옵니다.
 *  key 는 tabKey 가 만들므로 viewOf 가 되돌릴 수 있습니다. */
export function tabsOf(proposalCount: number, roundAt: string | null): { key: string; text: string }[] {
  const proposals = Array.from({ length: proposalCount }, (_, index) => ({
    key: tabKey({ kind: "proposal", index }),
    // 65 는 "A" 의 문자 번호입니다. 0번 조율안이 A안, 1번이 B안입니다.
    text: `${String.fromCharCode(65 + index)}안`,
  }));
  const round = roundAt === null
    ? []
    : [{ key: tabKey({ kind: "round", at: roundAt }), text: stampLabel(roundAt) }];
  return [{ key: tabKey(NOW), text: "현재 확정된 배정안" }, ...proposals, ...round];
}

function minutesOf(session: Session): number {
  return (new Date(session.end).getTime() - new Date(session.start).getTime()) / 60000;
}

/** 합주 목록의 총 시간을 시간 단위로 반환합니다. 1시간 30분이면 1.5 입니다. */
export function hoursOf(sessions: Session[]): number {
  return sessions.reduce((sum, session) => sum + minutesOf(session), 0) / MINUTES_PER_HOUR;
}

/** 계산이 끝난 뒤 알릴 한 줄입니다. 자리를 다 채웠는지, 채웠으면 저장까지 되었는지로 나뉩니다. */
export function runResultText(result: AssignOut): string {
  if (!result.assignment.feasible) {
    return `모든 시간을 다 사용하지는 못했어요 · 배정 제안 ${result.proposals.length}건`;
  }
  return result.saved ? "선택한 배정으로 확정했어요" : "해당 배정을 선택하지 않았어요";
}

/** 배정안에 나온 팀 이름마다 팀 색 key 를 반환합니다. 색은 teams(서버의 팀 목록)에 저장된 팀 색입니다.
 *  목록에 없는 이름(아직 받지 못했거나 삭제된 팀)은 빈 문자열이라 CSS 가 색 없는 막대로 표시합니다. */
export function colorsOf(
  sessions: Session[], teams: readonly { name: string; color: string }[],
): Map<string, string> {
  const colors = new Map(teams.map((team) => [team.name, teamColorKey(team.color)]));
  const names = [...new Set(sessions.map((session) => session.team))].sort();
  return new Map(names.map((name) => [name, colors.get(name) ?? ""]));
}
