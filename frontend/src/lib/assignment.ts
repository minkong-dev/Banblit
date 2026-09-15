// 배정 화면(routes/Assignment)의 순수 계산입니다. 화면이나 서버와 상호작용하지 않습니다.

import { colorKey } from "./roster";
import { mergeSessions } from "./slots";
import type { Session } from "./slots";
import type { AssignOut, Slot } from "./contract";

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

/** 팀 이름에 색을 하나씩 배정합니다. 이름 순으로 배정해야 다시 그려도 색이 바뀌지 않습니다. */
export function colorsOf(sessions: Session[]): Map<string, string> {
  const names = [...new Set(sessions.map((session) => session.team))].sort();
  return new Map(names.map((name, index) => [name, colorKey(index)]));
}
