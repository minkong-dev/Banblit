// 전체 합주 날짜 하나의 시각 입력입니다. 설정 화면(routes/SettingsEnsemble)과 달력의 하루 창(routes/DayDialog)이 함께 씁니다.

import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button, FormFoot, TimeRange } from "./controls";
import { PERIODS_KEY, useSlotMinutes } from "./queries";
import { say } from "./toast";
import type { Room } from "../lib/contract";
import type { EnsembleOn } from "../lib/dayEntries";
import { formError } from "../lib/loading";
import { clearEnsembleDay, saveEnsembleDay } from "../lib/pipeline";
import { ensembleTimeMessage } from "../lib/settings";
import { dayLabel } from "../lib/calendar";

/** 전체 합주 날짜 하나의 시각을 저장하거나 기본 시각으로 되돌립니다. 저장하면 기간 목록을 다시 조회해
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

  // done(text) 는 onSuccess 에 넣을 함수를 반환합니다. 저장과 되돌리기가 문구만 다른 같은 뒷처리를 쓰므로 문구를 먼저 받아 둡니다.
  const done = (text: string) => () => {
    void client.invalidateQueries({ queryKey: PERIODS_KEY });
    say(text);
  };
  const save = useMutation({
    mutationFn: () => saveEnsembleDay(on.periodId, day, times.starts, times.ends),
    onSuccess: done(`${dayLabel(day)} 전체 합주 시각을 저장했어요.`),
  });
  const reset = useMutation({
    mutationFn: () => clearEnsembleDay(on.periodId, day),
    onSuccess: done(`${dayLabel(day)} 전체 합주 시각을 기본 시각으로 되돌렸어요.`),
  });

  const why = room === undefined
    ? "전체 합주에 지정한 합주실을 찾을 수 없어요."
    : ensembleTimeMessage(times.starts, times.ends, room, slotMinutes);
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
      <TimeRange
        id={`ensday-${on.periodId}-${day}`}
        labels={["시작 시간", "종료 시간"]}
        value={[times.starts, times.ends]}
        step={slotMinutes * 60} // <input type="time"> 의 step 은 초 단위라 분에 60 을 곱합니다
        invalid={invalid}
        onChange={([starts, ends]) => setTimes({ starts, ends })}
      />
      <FormFoot
        submitLabel="저장"
        pending={save.isPending}
        blocked={pending || why !== ""}
        bad={bad}
        whyId={at("why")}
        extra={!on.custom ? undefined : (
          <Button kind="ghost" disabled={pending} onClick={() => reset.mutate()}>기본 시각으로 되돌리기</Button>
        )}
      />
    </form>
  );
}
