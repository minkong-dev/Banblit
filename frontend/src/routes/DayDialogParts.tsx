// 하루 dialog(routes/DayDialog)의 부품입니다. 값을 보유하지 않으며, 서버도 호출하지 않습니다.

import type { CSSProperties } from "react";

import { TrashIcon } from "../components/icons";
import { slotSteps } from "../lib/calendar";
import { slotLabel } from "../lib/pipeline";
import type { Entry } from "../lib/dayEntries";
import type { DayTeam } from "../lib/roster";

export type SlotRange = { a: number; b: number };

/** slot 번호를 "18:00" 으로 바꾸는 함수 2개를 반환합니다. endLabel 은 마지막 칸이면 닫는 시각을 씁니다. */
export function slotLabels(openHour: number, closeHour: number, slotCount: number) {
  const label = (index: number) => slotLabel(index, openHour);
  const endLabel = (index: number) => (index >= slotCount ? `${closeHour}:00` : label(index));
  return { label, endLabel };
}

/** 항목에 표시할 이름입니다. 불가능 일정은 사유, 배정·예약은 팀 이름, 팀이 없으면 예약자 이름입니다. */
export function entryName(entry: Entry, teams: DayTeam[]): string {
  return entry.kind === "off"
    ? entry.who ?? "불가능 일정"
    : teams.find((team) => team.key === entry.team)?.name ?? entry.who ?? "개인";
}

function kindLabel(entry: Entry): string {
  if (entry.kind === "assign") return "자동 배정";
  return entry.kind === "book" ? "예약" : "불가능 일정";
}

type HoursProps = { openHour: number; closeHour: number; slotCount: number };

/** 하루를 세로 띠로 표시합니다. 시각은 왼쪽에 시간 단위로만 적습니다. */
export function DayTimeline({ list, teams, openHour, closeHour, slotCount }: HoursProps & {
  list: Entry[];
  teams: DayTeam[];
}) {
  const { label, endLabel } = slotLabels(openHour, closeHour, slotCount);
  return (
    <div className="tlscroll"><div className="tl">
      {Array.from({ length: closeHour - openHour }, (_, i) => openHour + i).map((hour) => (
        <div className="hr" data-h={`${hour}:00`} key={hour} />
      ))}
      {list.map((entry, index) => (
        <span
          className={`evb ${entry.team ? `${entry.team}` : "off"}`}
          style={{ "--from": entry.a, "--span": entry.b - entry.a } as CSSProperties}
          key={index}
        >
          {entryName(entry, teams)}
          <small>{label(entry.a)}–{endLabel(entry.b)} · {kindLabel(entry)}</small>
        </span>
      ))}
    </div></div>
  );
}

/** 시작 시각과 종료 시각을 선택하는 입력입니다. 선택지는 설정의 slotMinutes 간격이고, lock 이면 이미 예약된
 *  1시간 칸에 속한 시각은 선택할 수 없게 차단합니다. */
export function SlotPicker({ prefix, range, onChange, grid, lock, slotMinutes, openHour, closeHour, slotCount }: HoursProps & {
  prefix: string;
  range: SlotRange;
  onChange: (next: SlotRange) => void;
  grid: boolean[];
  lock: boolean;
  slotMinutes: number;
}) {
  const { label, endLabel } = slotLabels(openHour, closeHour, slotCount);
  const steps = slotSteps(slotCount, slotMinutes);
  return (
    <div className="pick">
      <div className="fld">
        <label htmlFor={`${prefix}-from`}>시작</label>
        <select
          id={`${prefix}-from`}
          value={range.a}
          onChange={(event) => onChange({ ...range, a: Number(event.target.value) })}
        >
          {steps.slice(0, -1).map((slot) => (
            <option value={slot} key={slot} disabled={lock && grid[Math.floor(slot)]}>
              {label(slot)}{lock && grid[Math.floor(slot)] ? " (찼어요)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="fld">
        <label htmlFor={`${prefix}-to`}>끝</label>
        <select
          id={`${prefix}-to`}
          value={range.b}
          onChange={(event) => onChange({ ...range, b: Number(event.target.value) })}
        >
          {steps.slice(1).map((slot) => (
            <option value={slot} key={slot}>{endLabel(slot)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** 타임라인 아래의 목록입니다. 로그인한 사용자가 이날 등록한 항목만 나열해 삭제할 수 있게 합니다.
 *  막대 안에 삭제 버튼을 넣지 않는 이유는 1시간 slot 막대가 14px 이라 클릭 영역이 없기 때문입니다. */
export function MyEntriesList({ entries, teams, onRemove, openHour, closeHour, slotCount }: HoursProps & {
  entries: Entry[];
  teams: DayTeam[];
  onRemove: (entry: Entry) => void;
}) {
  if (entries.length === 0) return null;
  const { label, endLabel } = slotLabels(openHour, closeHour, slotCount);
  return (
    <div className="people">
      <h3>등록된 불가능 일정</h3>
      <ul className="mlist">
        {entries.map((entry) => (
          <li className="prow" key={`${entry.kind}-${entry.bookingId ?? entry.removeIds?.[0] ?? entry.a}`}>
            <i className={`dot ${entry.team ?? "off"}`} aria-hidden="true" />
            <span className="nm">{entry.kind === "book" ? entryName(entry, teams) : "불가능 일정"}</span>
            <span className="ps">{label(entry.a)}–{endLabel(entry.b)}</span>
            <button
              className="ic danger"
              aria-label={entry.kind === "book"
                ? `${entryName(entry, teams)} ${label(entry.a)}–${endLabel(entry.b)} 예약 취소`
                : `${label(entry.a)}–${endLabel(entry.b)} 불가능 일정 삭제`}
              onClick={() => onRemove(entry)}
            >
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 그날 합주에 참여하는 멤버 목록입니다. 명단 조회가 실패하면 그 사유를 대신 표시합니다. */
export function DayPeople({ people, error }: {
  people: { team: DayTeam; member: { id: number; name: string; cohort: number | null } }[];
  error: unknown;
}) {
  return (
    <div className="people"><h3>참여 멤버</h3>
      {error === undefined ? (
        <div className="plist">
          {people.map(({ team, member }) => (
            <div className="prow" key={`${team.id}-${member.id}`}>
              <span
                className="pic"
                style={{ background: `var(--${team.key}-tint)`, color: `var(--${team.key})` }}
              >
                {member.name.slice(0, 2)}
              </span>
              <span className="nm">{member.name} <i>{team.name}</i></span>
              <span className="ps">{member.cohort === null ? "" : `${member.cohort}기`}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="msg">
          {error instanceof Error ? error.message : "멤버 리스트를 불러오지 못했어요."}
        </p>
      )}
    </div>
  );
}
