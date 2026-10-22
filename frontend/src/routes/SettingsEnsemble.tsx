// 집중 합주기간의 전체 합주 설정 부품입니다. 설정 화면의 기간 form 이 사용합니다. 날짜 하나의 시각 입력은 components/EnsembleDayEditor 입니다.

import { Cell, DateRange, TimeRange, Toggle } from "../components/controls";
import { Dropdown } from "../components/Dropdown";
import { useSlotMinutes } from "../components/queries";
import type { Period, Room } from "../lib/contract";
import { ensembleOn } from "../lib/dayEntries";
import type { EnsembleBody, PeriodBody } from "../lib/pipeline";
import { WEEKDAY_NAMES, datesBetween, dayLabel, focusedRanges } from "../lib/calendar";
import { EnsembleDayEditor } from "../components/EnsembleDayEditor";

/** 기간 form 이 보유하는 전체 합주 입력값입니다. on 이 false 면 저장할 때 전체 합주를 해제합니다. */
export type EnsembleDraft = {
  on: boolean;
  starts_on: string;
  ends_on: string;
  room_id: number | null;
  starts_at: string;
  ends_at: string;
};

/** 저장된 전체 합주가 있으면 그 값, 없으면 첫 합주실과 그 운영 시간을 기본값으로 둔, on 이 false 인 입력값입니다. */
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

/** 서버에 보낼 전체 합주 값입니다. 합주실을 선택하지 않은 입력은 검증(checkEnsemble)이 저장 전에 거절합니다. */
export function ensembleBody(draft: EnsembleDraft): EnsembleBody {
  const { starts_on, ends_on, room_id, starts_at, ends_at } = draft;
  return { starts_on, ends_on, room_id: room_id ?? 0, starts_at, ends_at };
}

/** 팀별 합주 날짜를 한 줄로 표시합니다. 전체 합주 날짜 범위가 아직 성립하지 않으면 빈 문자열입니다. */
function teamDaysText(period: PeriodBody, draft: EnsembleDraft): string {
  if (draft.starts_on === "" || draft.ends_on === "" || draft.ends_on < draft.starts_on) return "";
  const ranges = focusedRanges([{ ...period, ensemble: draft }]);
  if (ranges.length === 0) return "팀별 합주 날짜가 존재하지 않아요. 모든 날짜가 전체 합주예요.";
  const parts = ranges.map((range) =>
    range.from === range.to ? dayLabel(range.from) : `${dayLabel(range.from)}–${dayLabel(range.to ?? "")}`);
  return `팀별 합주 날짜: ${parts.join(", ")}`;
}

/** 기간 form 안의 전체 합주 입력칸입니다. 체크했을 때만 날짜 범위, 합주실, 기본 시각을 받습니다.
 *  "매일" 기간은 팀별 합주 날짜가 끝없이 이어지므로 계산 결과 줄을 표시하지 않습니다. */
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

  if (!draft.on) return null;
  return (
        <div className="ensemble">
          <div className="frow">
          <Cell label="합주실" htmlFor={at("ens-room")}>
            <Dropdown
              id={at("ens-room")}
              value={draft.room_id ?? ""}
              invalid={bad !== ""}
              describedBy={bad === "" ? undefined : whyId}
              choices={[
                { value: "" as const, label: "선택" },
                ...rooms.map((room) => ({ value: room.id, label: room.name })),
              ]}
              onChange={(next) => setDraft({ ...draft, room_id: next === "" ? null : next })}
            />
          </Cell>
          </div>
          <div className="frow">
          <DateRange
            id={at("ens-days")}
            labels={["시작일", "종료일"]}
            value={[draft.starts_on, draft.ends_on]}
            min={period.starts_on}
            max={period.everyday ? undefined : period.ends_on}
            invalid={invalid}
            onChange={([starts_on, ends_on]) => setDraft({ ...draft, starts_on, ends_on })}
          />
          </div>
          <div className="frow">
          <TimeRange
            id={at("ens")}
            labels={["시작 시간", "종료 시간"]}
            value={[draft.starts_at, draft.ends_at]}
            step={slotMinutes * 60}
            invalid={invalid}
            onChange={([starts_at, ends_at]) => setDraft({ ...draft, starts_at, ends_at })}
          />
          </div>
          {teamDays === "" ? null : <p className="teamdays">{teamDays}</p>}
        </div>
  );
}

/** 전체 합주 지정 여부를 선택하는 체크박스입니다. 기간 form 의 날짜 줄(시작일, 종료일 옆)에 놓입니다(사용자 결정 2026-10-07).
 *  체크하면 form 아래 "전체 합주" 묶음(EnsembleFields)이 열립니다. */
export function EnsembleToggle({ draft, setDraft, at }: {
  draft: EnsembleDraft;
  setDraft: (next: EnsembleDraft) => void;
  at: (field: string) => string;
}) {
  return (
    <Cell label="전체 합주기간 지정" htmlFor={at("ensemble")}>
      <Toggle kind="check" id={at("ensemble")} checked={draft.on} onChange={(on) => setDraft({ ...draft, on })} />
    </Cell>
  );
}

/** day 의 요일 1글자를 반환합니다. 날짜별 시각 행에 표시합니다. */
function weekdayLetter(day: string): string {
  return WEEKDAY_NAMES[new Date(`${day}T12:00:00`).getDay()];
}

/** 설정 화면 기간 편집 행 아래에 붙는 날짜별 시각 구역입니다. 전체 합주 날짜 범위의 날짜를 전부 행으로 나열하고,
 *  행마다 그 날짜의 시각을 저장하거나 기본 시각으로 되돌립니다. 날짜별로 지정한 행은 "지정" 표시가 붙습니다. */
export function EnsembleDays({ period, room }: { period: Period; room: Room | undefined }) {
  if (period.ensemble === null) return null;
  const { starts_on, ends_on } = period.ensemble;

  return (
    <div className="ensdays">
      <h3 className="fsec">날짜별 전체 합주 시각</h3>
      {datesBetween(starts_on, ends_on).map((day) => {
        const on = ensembleOn([period], day);
        if (on === null) return null;
        return (
          <EnsembleDayEditor
            key={`${day}-${on.startsAt}-${on.endsAt}`}
            day={day}
            on={on}
            room={room}
            picker={
              <div className="ensdate">
                <b className="d">{dayLabel(day)}</b>
                <span className="w">{weekdayLetter(day)}</span>
                {on.custom ? <span className="enstag">지정</span> : null}
              </div>
            }
          />
        );
      })}
    </div>
  );
}
