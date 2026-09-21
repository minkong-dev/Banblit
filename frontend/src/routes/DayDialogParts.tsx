// 하루 dialog(routes/DayDialog)의 부품입니다. 서버를 호출하지 않습니다. 보유하는 값은 드래그 중 누른 위치 하나뿐입니다.

import { useRef } from "react";
import type { CSSProperties, PointerEvent } from "react";

import { Dropdown } from "../components/Dropdown";
import { CheckMark } from "../components/CheckMark";
import { PencilIcon, TrashIcon } from "../components/icons";
import {
  acceptsDrag, cellAt, dragRange, hasWeekday, REPEAT_WEEKDAY_NAMES, repeatLabel, slotSteps,
  toggleWeekday, weekdayIndex,
} from "../lib/calendar";
import { NO_REPEAT, slotLabel } from "../lib/pipeline";
import type { Repeat } from "../lib/pipeline";
import { offWhenLabel } from "../lib/dayEntries";
import type { Entry } from "../lib/dayEntries";
import { cohortLabel } from "../lib/roster";
import type { DayTeam } from "../lib/roster";

export type SlotRange = { a: number; b: number };

/** slot 번호를 "18:00" 으로 변경하는 함수 2개를 반환합니다. endLabel 은 마지막 칸이면 닫는 시각을 씁니다. */
export function slotLabels(openHour: number, closeHour: number, slotCount: number) {
  const label = (index: number) => slotLabel(index, openHour);
  const endLabel = (index: number) => (index >= slotCount ? `${closeHour}:00` : label(index));
  return { label, endLabel };
}

/** 항목에 표시할 이름입니다. 불가능 일정은 일정 이름, 배정·예약은 팀 이름, 팀이 없으면 예약자 이름입니다. */
export function entryName(entry: Entry, teams: DayTeam[]): string {
  return entry.kind === "off"
    ? entry.who ?? "불가능 일정"
    : teams.find((team) => team.key === entry.team)?.name ?? entry.who ?? "개인";
}

/** 막대·항목의 색 class 입니다. 전체합주는 팀이 아니라 전원의 일정이라 팀 색 대신 ens, 팀이 없는 항목은 off 입니다. */
export function entryClass(entry: Entry): string {
  if (entry.kind === "ensemble") return "ens";
  return entry.team ?? "off";
}

function kindLabel(entry: Entry): string {
  if (entry.kind === "assign") return "자동 배정";
  if (entry.kind === "ensemble") return "전체합주";
  return entry.kind === "book" ? "예약" : "불가능 일정";
}

type HoursProps = { openHour: number; closeHour: number; slotCount: number };

/** 찬 칸이 걸치지 않는 구간만 pick 에 넘깁니다. 걸치면 아무것도 하지 않아 직전 구간이 남습니다. */
function apply(pick: DragPick, next: SlotRange): void {
  if (acceptsDrag(pick.grid, next, pick.slotMinutes)) pick.onChange(next);
}

/** 드래그로 구간을 선택하게 할 때 넘기는 값입니다. 없으면 타임라인은 보기 전용입니다. range 가 null 이면 아직 선택하지 않은 상태입니다.
 *  grid 는 이미 찬 칸(slotMinutes 길이)입니다. 넘기면 찬 칸이 걸치는 구간을 반영하지 않아 드래그가 그 앞에서 멈춥니다.
 *  불가능 일정은 겹쳐도 되므로 넘기지 않습니다. */
export type DragPick = {
  range: SlotRange | null;
  slotMinutes: number;
  onChange: (next: SlotRange) => void;
  grid?: boolean[];
};

/** 하루를 세로 띠로 표시합니다. 시각은 왼쪽에 시간 단위로만 적습니다.
 *  pick 이 있으면 누른 자리부터 끄는 자리까지를 slotMinutes 간격으로 선택해 onChange 에 넘기고, 선택한 구간을 점선 막대로 표시합니다. */
export function DayTimeline({ list, teams, pick, openHour, closeHour, slotCount }: HoursProps & {
  list: Entry[];
  teams: DayTeam[];
  pick?: DragPick;
}) {
  const { label, endLabel } = slotLabels(openHour, closeHour, slotCount);
  // 누른 위치(소수 칸 번호)입니다. null 이면 드래그 중이 아닙니다.
  const pressed = useRef<number | null>(null);

  /** 포인터의 세로 위치를 소수 칸 번호로 변경합니다. 띠 높이가 slotCount 칸이므로 비율에 칸 수를 곱합니다. */
  const slotAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return ((event.clientY - rect.top) / rect.height) * slotCount;
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // button 0 이 왼쪽 버튼입니다. 오른쪽·가운데 버튼으로는 드래그를 시작하지 않습니다.
    if (pick === undefined || event.button !== 0) return;
    // 포인터가 띠 밖으로 나가도 move·up 이 이 요소로 계속 옵니다.
    event.currentTarget.setPointerCapture(event.pointerId);
    pressed.current = slotAt(event);
    apply(pick, dragRange(pressed.current, pressed.current, pick.slotMinutes, slotCount));
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (pick === undefined || pressed.current === null) return;
    apply(pick, dragRange(pressed.current, slotAt(event), pick.slotMinutes, slotCount));
  };
  const onPointerEnd = () => { pressed.current = null; };

  return (
    <div className="tlscroll"><div
      className={`tl${pick === undefined ? "" : " pickable"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      {Array.from({ length: closeHour - openHour }, (_, i) => openHour + i).map((hour) => (
        <div className="hr" data-h={`${hour}:00`} key={hour} />
      ))}
      {list.map((entry, index) => (
        <span
          className={`evb ${entryClass(entry)}`}
          style={{ "--from": entry.a, "--span": entry.b - entry.a } as CSSProperties}
          key={index}
        >
          {entryName(entry, teams)}
          <small>{label(entry.a)}–{endLabel(entry.b)} · {kindLabel(entry)}{entry.note ? ` · ${entry.note}` : ""}</small>
        </span>
      ))}
      {pick === undefined || pick.range === null ? null : (
        <span
          className="evb sel"
          style={{ "--from": pick.range.a, "--span": pick.range.b - pick.range.a } as CSSProperties}
          aria-hidden="true"
        >
          {label(pick.range.a)}–{endLabel(pick.range.b)}
        </span>
      )}
    </div></div>
  );
}

/** 시작 시각과 종료 시각을 선택하는 입력입니다. 선택지는 설정의 slotMinutes 간격이고, lock 이면 이미 예약된
 *  칸의 시작 시각은 선택할 수 없게 차단합니다. 드래그를 못 쓰는 키보드 사용자의 입력 수단이기도 합니다. */
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
        <Dropdown
          id={`${prefix}-from`}
          value={range.a}
          choices={steps.slice(0, -1).map((slot) => ({
            value: slot,
            label: `${label(slot)}${lock && grid[cellAt(slot, slotMinutes)] ? " (찼어요)" : ""}`,
            disabled: lock && grid[cellAt(slot, slotMinutes)],
          }))}
          onChange={(next) => onChange({ ...range, a: next })}
        />
      </div>
      <div className="fld">
        <label htmlFor={`${prefix}-to`}>끝</label>
        <Dropdown
          id={`${prefix}-to`}
          value={range.b}
          choices={steps.slice(1).map((slot) => ({ value: slot, label: endLabel(slot) }))}
          onChange={(next) => onChange({ ...range, b: next })}
        />
      </div>
    </div>
  );
}

/** 로그인한 사용자가 등록한 항목의 목록입니다. 줄마다 삭제 버튼이 있습니다. 불가능 일정은 전부를 나열하므로
 *  줄마다 날짜를 함께 적고(offWhenLabel), 예약은 이날의 항목만 나열하므로 시각만 적습니다.
 *  막대 안에 삭제 버튼을 넣지 않는 이유는 1시간 slot 막대가 14px 이라 클릭 영역이 없기 때문입니다. */
export function MyEntriesList({ title, empty, entries, teams, onRemove, onEdit, openHour, closeHour, slotCount }: HoursProps & {
  title: string;
  /** 항목이 없을 때 표시하는 한 줄입니다. */
  empty: string;
  entries: Entry[];
  teams: DayTeam[];
  onRemove: (entry: Entry) => void;
  /** 불가능 일정 줄의 수정 버튼입니다. 넘기지 않으면 그 버튼을 표시하지 않습니다(예약 목록). */
  onEdit?: (entry: Entry) => void;
}) {
  const { label, endLabel } = slotLabels(openHour, closeHour, slotCount);
  return (
    <div className="people">
      <h3>{title}</h3>
      {entries.length === 0 ? <p className="none">{empty}</p> : (
        <ul className="mlist">
          {entries.map((entry) => {
            // 날짜가 없는 항목(예약)은 offWhenLabel 이 빈 문자열이므로 trim 으로 앞의 공백을 삭제합니다.
            const when = `${offWhenLabel(entry)} ${label(entry.a)}–${endLabel(entry.b)}`.trim();
            return (
              <li className="prow" key={`${entry.kind}-${entry.bookingId ?? entry.removeIds?.[0] ?? entry.a}`}>
                <i className={`dot ${entry.team ?? "off"}`} aria-hidden="true" />
                {/* 이름과 상세를 세로로 쌓습니다. 가로로 두면 좁은 카드에서 이름이 글자마다 줄바꿈됩니다. */}
                <span className="txt">
                  <span className="nm">{entryName(entry, teams)}</span>
                  <span className="ps">{when}</span>
                </span>
                {onEdit === undefined || entry.kind !== "off" ? null : (
                  <button
                    className="ic"
                    aria-label={`${entryName(entry, teams)} ${when} 수정`}
                    onClick={() => onEdit(entry)}
                  >
                    <PencilIcon />
                  </button>
                )}
                <button
                  className="ic danger"
                  aria-label={`${entryName(entry, teams)} ${when} ${entry.kind === "book" ? "예약 취소" : "불가능 일정 삭제"}`}
                  onClick={() => onRemove(entry)}
                >
                  <TrashIcon />
                </button>
              </li>
            );
          })}
        </ul>
      )}
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
              <span className="ps">{cohortLabel(member.cohort)}</span>
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

/** 불가능 일정의 반복 설정입니다. 체크를 켜면 요일 버튼과 끝나는 조건이 나타납니다.
 *  요일을 일곱 개 전부 선택하면 매일과 같습니다. 끝나는 조건은 종료일과 횟수 중 하나만 채웁니다 —
 *  둘 다 채우면 아래에 사유를 표시하고 저장을 막습니다(서버도 422 로 거절합니다). */
export function RepeatFields({ dayKey, value, onChange }: {
  /** 지금 보고 있는 날짜입니다. 반복을 처음 켤 때 이 날의 요일을 기본으로 고릅니다. */
  dayKey: string;
  value: Repeat;
  onChange: (next: Repeat) => void;
}) {
  const on = value.weekdays !== 0;
  return (
    <div className="rep">
      {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- CheckMark 컴포넌트 안에 input 이 있습니다. eslint 는 컴포넌트 내부를 확인하지 못합니다. */}
      <label className="repon">
        <CheckMark
          id="offRepeatOn"
          checked={on}
          onChange={(next) => onChange(next
            ? { weekdays: 1 << weekdayIndex(dayKey), count: null, until: null }
            : NO_REPEAT)}
        />
        반복
      </label>
      {!on ? null : (
        <div className="repbody">
          <div className="repdays" role="group" aria-label="반복 요일">
            {REPEAT_WEEKDAY_NAMES.map((name, index) => (
              <button
                type="button"
                key={name}
                aria-pressed={hasWeekday(value.weekdays, index)}
                onClick={() => onChange({ ...value, weekdays: toggleWeekday(value.weekdays, index) })}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="sub">{repeatLabel(value.weekdays) || "요일을 하나 이상 선택해주세요."}</p>
          <label className="fld3" htmlFor="offRepeatUntil">
            반복 종료일
            <input
              id="offRepeatUntil"
              type="date"
              value={value.until ?? ""}
              min={dayKey}
              onChange={(event) => onChange({ ...value, until: event.target.value || null })}
            />
          </label>
          <label className="fld3" htmlFor="offRepeatCount">
            반복 횟수(주)
            <input
              id="offRepeatCount"
              type="number"
              min={1}
              max={1825}
              step={1}
              placeholder="예: 4"
              value={value.count ?? ""}
              onChange={(event) => onChange({
                ...value,
                count: event.target.value === "" ? null : Number(event.target.value),
              })}
            />
          </label>
          <p className="sub">고른 요일 전부가 한 세트입니다. 4 를 넣으면 그 요일들이 4주 동안 반복합니다.</p>
          {repeatConflict(value) === "" ? null : <p className="why">{repeatConflict(value)}</p>}
        </div>
      )}
    </div>
  );
}

/** 반복 설정을 저장할 수 없는 사유입니다. 저장할 수 있으면 빈 문자열입니다. */
export function repeatConflict(value: Repeat): string {
  if (value.weekdays === 0) return "";
  if (value.count !== null && value.until !== null) {
    return "반복 횟수와 반복 종료일은 동시에 설정할 수 없어요. 하나를 비워주세요.";
  }
  return "";
}
