// 배정 화면(routes/Assignment)의 순수 계산입니다. 화면이나 서버와 상호작용하지 않습니다.

import { teamColorKey } from "./teamColors";
import { datesBetween, stampLabel } from "./calendar";
import { dayOf, mergeSessions } from "./slots";
import type { Session } from "./slots";
import { memberLabel } from "./roster";
import type { Absence, ScheduleReport, ScheduleRow, SessionAbsence } from "./contract";

const MINUTES_PER_HOUR = 60;

/** 달력에 표시하는 대상입니다. 현재 확정된 시간표, 스케줄링 기록 하나 중 하나입니다. */
export type View = { kind: "now" } | { kind: "round"; at: string };
export const NOW: View = { kind: "now" };

// 탭은 문자열 키만 받습니다. 문자열과 View 를 변환하는 함수는 아래 2개뿐입니다.
export function tabKey(view: View): string {
  return view.kind === "round" ? `r:${view.at}` : "now";
}

export function viewOf(key: string): View {
  return key.startsWith("r:") ? { kind: "round", at: key.slice(2) } : NOW;
}

/** 서버가 반환한 시간표 한 줄씩을 합주 목록으로 변환합니다. ScheduleRow 는 team_id·room_id 를
 *  함께 담지만 달력은 이름만 쓰므로 네 필드만 남기고, 맞닿은 slot 을 합주 한 번으로 묶습니다.
 *  확정된 시간표와 지난 배정기록이 같은 형식이라 두 곳이 이 함수를 씁니다. */
export function sessionsOfRows(rows: readonly ScheduleRow[]): Session[] {
  return mergeSessions(
    rows.map((row) => ({ team: row.team, room: row.room, start: row.start, end: row.end })),
  );
}

/** 첫 합주 날짜부터 마지막 합주 날짜까지의 모든 일정입니다. 그 사이에 합주가 없는 날짜도 포함합니다.
 *  달력이 그 칸도 그려야 합니다. 합주가 없을 경우 빈 목록을 반환합니다.
 *  sort 는 원본 배열을 수정하므로 map 으로 만든 사본을 정렬합니다. */
export function dayRangeOf(sessions: readonly Session[]): string[] {
  if (sessions.length === 0) return [];
  const starts = sessions.map((session) => session.start).sort();
  return datesBetween(dayOf(starts[0]), dayOf(starts[starts.length - 1]));
}

/** 배정 화면의 탭 목록입니다. 맨 앞은 현재 확정된 배정안이고, 스케줄링 기록을 선택했을 경우 그 시각 탭이 뒤에 옵니다.
 *  key 는 tabKey 가 만들므로 viewOf 가 되돌릴 수 있습니다. */
export function tabsOf(roundAt: string | null): { key: string; text: string }[] {
  const round = roundAt === null
    ? []
    : [{ key: tabKey({ kind: "round", at: roundAt }), text: stampLabel(roundAt) }];
  return [{ key: tabKey(NOW), text: "현재 확정된 배정안" }, ...round];
}

function minutesOf(session: Session): number {
  return (new Date(session.end).getTime() - new Date(session.start).getTime()) / 60000;
}

/** 합주 목록의 총 시간을 시간 단위로 반환합니다. 1시간 30분이면 1.5 입니다. */
export function hoursOf(sessions: Session[]): number {
  return sessions.reduce((sum, session) => sum + minutesOf(session), 0) / MINUTES_PER_HOUR;
}

/** 결과 설명의 문단 1개입니다. lines 는 1줄씩, groups 는 팀 이름과 그 팀의 줄 목록, tail 은 목록 뒤 문장입니다. */
export type ReportParagraph = { title: string; lines: string[]; groups: { team: string; lines: string[] }[]; tail: string | null };

/** 1.5 는 "1.5", 3 은 "3" 으로 표기합니다. 서버의 시간 값은 소수 1자리까지입니다. */
function hoursText(hours: number): string {
  return String(Math.round(hours * 10) / 10);
}

/** 캘린더 아래 결과 설명 문단입니다(문구는 사용자 결정 2026-10-12). 목록이 빈 문단은 반환하지 않습니다. */
export function reportLines(report: ScheduleReport): ReportParagraph[] {
  const paragraphs: ReportParagraph[] = [];
  if (report.shortfalls.length > 0) {
    paragraphs.push({
      title: `팀 당 ${hoursText(report.target_hours)}시간을 배정받아야하나, 더 적게 배정받은 팀이 있어요.`,
      lines: report.shortfalls.map((item) => `${item.team} ${hoursText(item.assigned_hours)}시간 배정`),
      groups: [],
      tail: null,
    });
  }
  if (report.absences.length > 0) {
    paragraphs.push({
      title: "일부 인원을 제외하고 진행해야하는 팀이 있어요.",
      lines: [],
      groups: byTeam(report.absences),
      tail: "를 제외해야 연산이 가능했어요.",
    });
  }
  return paragraphs;
}

/** 불참자를 서버가 준 순서대로 팀마다 묶습니다. 줄은 "포지션 이름 (기수)" 입니다. */
function byTeam(absences: Absence[]): { team: string; lines: string[] }[] {
  const ids = [...new Set(absences.map((item) => item.team_id))];
  return ids.map((id) => {
    const own = absences.filter((item) => item.team_id === id);
    return { team: own[0].team, lines: own.map((item) => `${item.position} ${memberLabel(item.member, item.cohort)}`) };
  });
}

/** session 블록 시각 안에서 같은 팀의 불참자를 "이름 (기수)" 로 1번씩 쉼표로 이어 반환합니다. 없으면 빈 문자열입니다. */
export function absentOf(session: Session, absences: SessionAbsence[]): string {
  const inside = absences.filter(
    (item) => item.team === session.team && item.start >= session.start && item.start < session.end,
  );
  const names = new Map(inside.map((item) => [item.member_id, memberLabel(item.member, item.cohort)]));
  return [...names.values()].join(", ");
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
