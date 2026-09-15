// 집중 합주기간의 전체합주 설정 부품입니다. 설정 화면의 기간 form 과 달력의 하루 dialog 가 사용합니다.

import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { CheckMark } from "../components/CheckMark";
import { useSlotMinutes } from "../components/queries";
import type { Period, Room } from "../lib/contract";
import { ensembleOn } from "../lib/dayEntries";
import type { EnsembleOn } from "../lib/dayEntries";
import { formError } from "../lib/loading";
import {
  checkEnsembleTime,
  clearEnsembleDay,
  datesBetween,
  dayLabel,
  focusedRanges,
  saveEnsembleDay,
} from "../lib/pipeline";
import type { EnsembleBody, PeriodBody } from "../lib/pipeline";
import { say } from "../lib/toast";
import { Cell } from "./SettingsForm";

/** 기간 form 이 보유하는 전체합주 입력값입니다. on 이 false 면 저장할 때 전체합주를 해제합니다. */
export type EnsembleDraft = {
  on: boolean;
  starts_on: string;
  ends_on: string;
  room_id: number | null;
  starts_at: string;
  ends_at: string;
};

/** 저장된 전체합주가 있으면 그 값, 없으면 첫 합주실과 그 운영 시간으로 채운 꺼진 입력값입니다. */
export function ensembleDraft(period: Period | null, rooms: Room[]): EnsembleDraft {
  const saved = period?.ensemble ?? null;
  if (saved !== null) {
    const { starts_on, ends_on, room_id, starts_at, ends_at } = saved;
    return { on: true, starts_on, ends_on, room_id, starts_at, ends_at };
  }
  const room = rooms[0];
  return {
    on: false,
    starts_on: "",
    ends_on: "",
    room_id: room?.id ?? null,
    starts_at: room?.opens_at ?? "",
    ends_at: room?.closes_at ?? "",
  };
}

/** 서버에 보낼 전체합주 값입니다. 합주실을 선택하지 않은 입력은 검증(checkEnsemble)이 저장 전에 거절합니다. */
export function ensembleBody(draft: EnsembleDraft): EnsembleBody {
  const { starts_on, ends_on, room_id, starts_at, ends_at } = draft;
  return { starts_on, ends_on, room_id: room_id ?? 0, starts_at, ends_at };
}

/** 팀별합주 날짜를 한 줄로 표시합니다. 전체합주 날짜 범위가 아직 성립하지 않으면 빈 문자열입니다. */
function teamDaysText(period: PeriodBody, draft: EnsembleDraft): string {
  if (draft.starts_on === "" || draft.ends_on === "" || draft.ends_on < draft.starts_on) return "";
  const ranges = focusedRanges([{ ...period, ensemble: draft }]);
  if (ranges.length === 0) return "팀별합주 날짜가 없어요. 모든 날짜가 전체합주예요.";
  const parts = ranges.map((range) =>
    range.from === range.to ? dayLabel(range.from) : `${dayLabel(range.from)}–${dayLabel(range.to ?? "")}`);
  return `팀별합주 날짜: ${parts.join(", ")}`;
}

/** 기간 form 안의 전체합주 입력칸입니다. 체크했을 때만 날짜 범위·합주실·기본 시각을 받습니다.
 *  "매일" 기간은 팀별합주 날짜가 끝없이 이어지므로 계산 결과 줄을 표시하지 않습니다(사용자 결정 2026-09-15). */
export function EnsembleFields(props: {
  draft: EnsembleDraft;
  setDraft: (next: EnsembleDraft) => void;
  period: PeriodBody;
  rooms: Room[];
  at: (field: string) => string;
  bad: string;
  whyId: string;
}) {
  const { draft, setDraft, period, rooms, at, bad, whyId } = props;
  const slotMinutes = useSlotMinutes();
  const invalid = { "aria-invalid": bad !== "", "aria-describedby": bad === "" ? undefined : whyId };
  const teamDays = period.everyday ? "" : teamDaysText(period, draft);

  return (
    <>
      <Cell label="전체 합주기간 지정" htmlFor={at("ensemble")}>
        <CheckMark id={at("ensemble")} checked={draft.on} onChange={(on) => setDraft({ ...draft, on })} />
      </Cell>
      {!draft.on ? null : (
        <div className="ensemble">
          <Cell label="전체합주 시작일" htmlFor={at("ens-starts")}>
            <input
              type="date"
              id={at("ens-starts")}
              value={draft.starts_on}
              min={period.starts_on}
              max={period.everyday ? undefined : period.ends_on}
              {...invalid}
              onChange={(event) => setDraft({ ...draft, starts_on: event.target.value })}
            />
          </Cell>
          <Cell label="전체합주 종료일" htmlFor={at("ens-ends")}>
            <input
              type="date"
              id={at("ens-ends")}
              value={draft.ends_on}
              min={draft.starts_on || period.starts_on}
              max={period.everyday ? undefined : period.ends_on}
              {...invalid}
              onChange={(event) => setDraft({ ...draft, ends_on: event.target.value })}
            />
          </Cell>
          <Cell label="합주실" htmlFor={at("ens-room")}>
            <select
              id={at("ens-room")}
              value={draft.room_id ?? ""}
              {...invalid}
              onChange={(event) =>
                setDraft({ ...draft, room_id: event.target.value === "" ? null : Number(event.target.value) })}
            >
              <option value="">선택</option>
              {rooms.map((room) => <option value={room.id} key={room.id}>{room.name}</option>)}
            </select>
          </Cell>
          <Cell label="시작 시각" htmlFor={at("ens-from")}>
            <input
              type="time"
              step={slotMinutes * 60}
              id={at("ens-from")}
              value={draft.starts_at}
              {...invalid}
              onChange={(event) => setDraft({ ...draft, starts_at: event.target.value })}
            />
          </Cell>
          <Cell label="끝 시각" htmlFor={at("ens-to")}>
            <input
              type="time"
              step={slotMinutes * 60}
              id={at("ens-to")}
              value={draft.ends_at}
              {...invalid}
              onChange={(event) => setDraft({ ...draft, ends_at: event.target.value })}
            />
          </Cell>
          {teamDays === "" ? null : <p className="teamdays">{teamDays}</p>}
        </div>
      )}
    </>
  );
}

/** 전체합주 날짜 하나의 시각을 저장하거나 기본 시각으로 되돌립니다. 저장하면 기간 목록을 다시 조회해
 *  설정 화면과 달력이 같은 값을 표시합니다. picker 는 입력칸 앞에 붙는 날짜 선택입니다(설정 화면만 사용). */
export function EnsembleDayEditor({ day, on, room, picker }: {
  day: string;
  on: EnsembleOn;
  room: Room | undefined;
  picker?: ReactNode;
}) {
  const client = useQueryClient();
  const slotMinutes = useSlotMinutes();
  const [times, setTimes] = useState({ starts: on.startsAt, ends: on.endsAt });

  const done = (text: string) => () => {
    void client.invalidateQueries({ queryKey: ["periods"] });
    say(text);
  };
  const save = useMutation({
    mutationFn: () => saveEnsembleDay(on.periodId, day, times.starts, times.ends),
    onSuccess: done(`${dayLabel(day)} 전체합주 시각을 저장했어요.`),
  });
  const reset = useMutation({
    mutationFn: () => clearEnsembleDay(on.periodId, day),
    onSuccess: done(`${dayLabel(day)} 전체합주 시각을 기본 시각으로 되돌렸어요.`),
  });

  const why = room === undefined
    ? "전체합주에 지정한 합주실을 찾을 수 없어요."
    : checkEnsembleTime(times.starts, times.ends, room, slotMinutes);
  const touched = times.starts !== on.startsAt || times.ends !== on.endsAt;
  const bad = formError(touched, why, save.error ?? reset.error);
  const pending = save.isPending || reset.isPending;
  const at = (field: string): string => `ensday-${on.periodId}-${day}-${field}`;
  const invalid = { "aria-invalid": bad !== "", "aria-describedby": bad === "" ? undefined : at("why") };

  return (
    <form
      className="fields ensday"
      onSubmit={(event) => {
        event.preventDefault();
        if (why === "") save.mutate();
      }}
    >
      {picker}
      <Cell label="시작 시각" htmlFor={at("from")}>
        <input
          type="time"
          step={slotMinutes * 60}
          id={at("from")}
          value={times.starts}
          {...invalid}
          onChange={(event) => setTimes({ ...times, starts: event.target.value })}
        />
      </Cell>
      <Cell label="끝 시각" htmlFor={at("to")}>
        <input
          type="time"
          step={slotMinutes * 60}
          id={at("to")}
          value={times.ends}
          {...invalid}
          onChange={(event) => setTimes({ ...times, ends: event.target.value })}
        />
      </Cell>
      <div className="acts">
        {on.custom ? (
          <button className="btn" type="button" disabled={pending} onClick={() => reset.mutate()}>
            기본 시각으로 되돌리기
          </button>
        ) : null}
        <button className="btn go" type="submit" disabled={pending || why !== ""}>
          {save.isPending ? "저장하는 중…" : "시각 저장"}
        </button>
      </div>
      {bad === "" ? null : <p className="why" id={at("why")} role="alert">{bad}</p>}
    </form>
  );
}

/** 설정 화면 기간 편집 행 아래에 붙는 날짜별 시각 구역입니다. 날짜를 선택하면 그 날짜의 편집기가 새로 열립니다.
 *  선택지에는 기본 시각과 다르게 지정한 날짜의 시각을 함께 표시합니다. */
export function EnsembleDays({ period, room }: { period: Period; room: Room | undefined }) {
  const [day, setDay] = useState(period.ensemble?.starts_on ?? "");
  const on = ensembleOn([period], day);
  if (period.ensemble === null || on === null) return null;
  const { days } = period.ensemble;
  const pickerId = `ensday-${period.id}-day`;

  return (
    <div className="ensdays">
      <b>날짜별 전체합주 시각</b>
      <EnsembleDayEditor
        key={day}
        day={day}
        on={on}
        room={room}
        picker={
          <Cell label="날짜" htmlFor={pickerId}>
            <select id={pickerId} value={day} onChange={(event) => setDay(event.target.value)}>
              {datesBetween(period.ensemble.starts_on, period.ensemble.ends_on).map((key) => {
                const own = days.find((item) => item.day === key);
                return (
                  <option value={key} key={key}>
                    {dayLabel(key)}{own === undefined ? "" : ` (${own.starts_at}–${own.ends_at})`}
                  </option>
                );
              })}
            </select>
          </Cell>
        }
      />
    </div>
  );
}
