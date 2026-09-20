// 설정 화면의 집중합주 기간 구역입니다. 기간 목록·추가·수정·삭제와, 기간에 딸린 전체합주 설정을 담당합니다.
// 전체합주 입력칸 자체는 SettingsEnsemble 이 제공합니다. 달력의 하루 dialog 도 같은 부품을 사용합니다.

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { RefObject } from "react";

import { Card } from "../components/AppShell";
import { CheckMark } from "../components/CheckMark";
import { Dropdown } from "../components/Dropdown";
import { Modal } from "../components/Modal";
import { useSlotMinutes } from "../components/queries";
import { getJSON, reason } from "../lib/api";
import { askDelete } from "../lib/confirm";
import type { ClockRange, Period, PracticeWindow, Room } from "../lib/contract";
import { formError } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import {
  checkEnsemble, checkPeriod, checkPracticeWindow, dayLabel, daysBetween,
  periodBody, savePeriod,
} from "../lib/pipeline";
import type { PeriodBody } from "../lib/pipeline";
import type { WindowPair } from "../lib/settings";
import { say } from "../lib/toast";
import { EnsembleDays, EnsembleFields, ensembleBody, ensembleDraft } from "./SettingsEnsemble";
import {
  Cell,
  CardState,
  FormTail,
  Row,
  useFirstField,
  useForm,
  SectionHead,
  useRowFocus,
} from "./SettingsForm";

const NO_WINDOW: PracticeWindow = { weekday: null, weekend: null };

const BLANK_PERIOD: PeriodBody = {
  kind: "focused",
  starts_on: "",
  ends_on: "",
  everyday: false,
  first_run_at: "09:00",
  second_run_at: "21:00",
  practice_window: NO_WINDOW,
};

const KIND_TEXT = { open: "상시 개방", focused: "집중 합주" };

/** 기간 form 이 수정하는 값만 추립니다. 목록에서 받은 기간에는 id·ensemble 이 함께 있어 그대로 보내면 요청 본문에 섞입니다. */
function periodFields(period: Period): PeriodBody {
  const { kind, starts_on, ends_on, everyday, first_run_at, second_run_at } = period;
  return { kind, starts_on, ends_on, everyday, first_run_at, second_run_at,
    practice_window: period.practice_window };
}

/** 시간대 한 쌍을 입력칸 두 개로 펼칩니다. 정하지 않은 쌍은 빈 칸 두 개입니다. */
function windowPair(pair: ClockRange | null): WindowPair {
  return pair ?? { starts_at: "", ends_at: "" };
}

/** 입력칸 두 개를 저장할 값으로 되돌립니다. 둘 다 비어 있으면 정하지 않은 쌍입니다. */
function windowValue(pair: WindowPair): ClockRange | null {
  return pair.starts_at === "" && pair.ends_at === "" ? null : pair;
}

/** 목록 줄 오른쪽에 붙는 한 줄입니다. 집중 합주기간(스케줄링을 자동으로 진행할 기간)일 때만 계산 시각 두 개가 더 붙고,
 *  전체합주를 지정했으면 그 날짜 범위가 붙습니다. */
function periodSpan(period: Period): string {
  const days = ` · ${daysBetween(period.starts_on, period.ends_on)}일`;
  if (period.kind !== "focused") return days;
  const ensemble = period.ensemble === null
    ? ""
    : ` · 전체합주 ${dayLabel(period.ensemble.starts_on)}–${dayLabel(period.ensemble.ends_on)}`;
  return `${days} · 계산 ${period.first_run_at} · ${period.second_run_at}${ensemble}`;
}

/** 기간 form 의 입력칸입니다. 집중 합주기간일 때만 계산 시각 입력칸 2개가 더 표시됩니다. */
function PeriodFields(props: {
  form: PeriodBody;
  setForm: (next: PeriodBody) => void;
  at: (field: string) => string;
  bad: string;
  whyId: string;
  first: RefObject<HTMLButtonElement | null>;
}) {
  const { form, setForm, at, bad, whyId, first } = props;
  return (
    <>
      <Cell label="분류" htmlFor={at("kind")}>
        <Dropdown
          buttonRef={first}
          id={at("kind")}
          invalid={bad !== ""}
          describedBy={bad === "" ? undefined : whyId}
          value={form.kind}
          choices={[
            { value: "focused", label: "집중 합주" },
            { value: "open", label: "상시 개방" },
          ]}
          onChange={(next) => setForm({ ...form, kind: next })}
        />
      </Cell>
      <Cell label="시작일" htmlFor={at("starts")}>
        <input
          type="date"
          value={form.starts_on}
          id={at("starts")}
          aria-invalid={bad !== ""}
          aria-describedby={bad === "" ? undefined : whyId}
          onChange={(event) => setForm({ ...form, starts_on: event.target.value })}
        />
      </Cell>
      {/* 매일이 켜진 집중 합주기간은 종료일이 없습니다. 입력칸을 감추고 서버에는 시작일을 종료일로 보냅니다. */}
      {form.kind === "focused" && form.everyday ? null : (
        <Cell label="종료일" htmlFor={at("ends")}>
          <input
            type="date"
            value={form.ends_on}
            id={at("ends")}
            aria-invalid={bad !== ""}
            aria-describedby={bad === "" ? undefined : whyId}
            onChange={(event) => setForm({ ...form, ends_on: event.target.value })}
          />
        </Cell>
      )}
      {form.kind === "focused" ? (
        <>
          <Cell label="매일" htmlFor={at("everyday")}>
            <CheckMark
              id={at("everyday")}
              checked={form.everyday}
              onChange={(on) => setForm({ ...form, everyday: on })}
            />
          </Cell>
          <Cell label="1차 스케줄링 시간" htmlFor={at("first")}>
            <input
              id={at("first")}
              type="time"
              value={form.first_run_at}
              onChange={(event) => setForm({ ...form, first_run_at: event.target.value })}
            />
          </Cell>
          <Cell label="2차 스케줄링 시간" htmlFor={at("second")}>
            <input
              id={at("second")}
              type="time"
              value={form.second_run_at}
              onChange={(event) => setForm({ ...form, second_run_at: event.target.value })}
            />
          </Cell>
          {/* 합주실 개방시각과는 다른 값입니다. 합주실이 09시에 열어도 팀별합주는 17시부터만
              배정할 수 있고, 남는 시간은 선착순 예약으로 열립니다. 비워 두면 개방시각 전체를 씁니다. */}
          <WindowFields
            label="평일"
            pair={windowPair(form.practice_window.weekday)}
            at={at}
            field="weekday"
            onChange={(next) => setForm({
              ...form,
              practice_window: { ...form.practice_window, weekday: windowValue(next) },
            })}
          />
          <WindowFields
            label="주말"
            pair={windowPair(form.practice_window.weekend)}
            at={at}
            field="weekend"
            onChange={(next) => setForm({
              ...form,
              practice_window: { ...form.practice_window, weekend: windowValue(next) },
            })}
          />
        </>
      ) : null}
    </>
  );
}

/** 팀별합주 시간대 한 쌍의 입력칸입니다. 두 칸을 모두 비우면 그날 합주실 개방시각 전체를 씁니다. */
function WindowFields(props: {
  label: string;
  pair: WindowPair;
  field: string;
  at: (field: string) => string;
  onChange: (next: WindowPair) => void;
}) {
  const { label, pair, field, at, onChange } = props;
  return (
    <>
      <Cell label={`${label} 합주 시작`} htmlFor={at(`${field}From`)}>
        <input
          id={at(`${field}From`)}
          type="time"
          value={pair.starts_at}
          onChange={(event) => onChange({ ...pair, starts_at: event.target.value })}
        />
      </Cell>
      <Cell label={`${label} 합주 종료`} htmlFor={at(`${field}To`)}>
        <input
          id={at(`${field}To`)}
          type="time"
          value={pair.ends_at}
          onChange={(event) => onChange({ ...pair, ends_at: event.target.value })}
        />
      </Cell>
    </>
  );
}

export function PeriodCard(props: {
  periods: Period[]; rooms: Room[]; state: LoadState; canEdit: boolean; canCreate: boolean; canDelete: boolean;
  onSaved: () => void; onDeleted: () => void;
}) {
  const { periods, rooms, state, canEdit, canCreate, canDelete, onSaved, onDeleted } = props;
  const { editing, open, close, register } = useRowFocus();
  const [making, setMaking] = useState(false);
  // 기간을 삭제하면 서버가 그 기간의 배정 결과·계산 기록·이전 배정기록을 함께 삭제합니다(외래 키 CASCADE).
  const drop = useMutation({
    mutationFn: (id: number) => getJSON(`/periods/${id}`, { method: "DELETE" }),
    onSuccess: onDeleted,
    onError: (error) => say(reason(error)),
  });

  return (
    <Card>
      <SectionHead title="집중합주 기간" desc="자동 스케줄링을 진행할 기간을 설정해요" />

      {state.kind !== "ready" || periods.length === 0 ? (
        <CardState state={state} empty="아직 등록된 집중합주 기간이 없어요." />
      ) : (
        <ul className="rows">
          {periods.map((period) =>
            canEdit && editing === period.id ? (
              <li className="editing" key={period.id}>
                <PeriodForm
                  before={period}
                  rooms={rooms}
                  submit="저장"
                  onCancel={close}
                  onDone={() => {
                    close();
                    onSaved();
                  }}
                />
              </li>
            ) : (
              // onEdit이 없으면 Row가 수정 버튼을 그리지 않습니다. period_edit 권한이 없는 사람에게는
              // 목록만 표시됩니다.
              <Row
                key={period.id}
                title={KIND_TEXT[period.kind] + (period.everyday ? " · 매일" : "")}
                when={
                  period.everyday
                    ? <><b>{period.starts_on}</b> 부터 매일</>
                    : <><b>{period.starts_on}</b> 부터 <b>{period.ends_on}</b> 까지</>
                }
                span={periodSpan(period)}
                editLabel={canEdit ? `${period.starts_on} 부터의 기간을 수정` : undefined}
                buttonRef={canEdit ? register(period.id) : undefined}
                onEdit={canEdit ? () => open(period.id) : undefined}
                deleteLabel={canDelete ? `${period.starts_on} 부터의 기간을 삭제` : undefined}
                // 삭제 요청이 진행 중이면 다시 누른 것을 무시합니다. 연속으로 누르면 같은 DELETE 가 여러 번 전송됩니다.
                onDelete={canDelete
                  ? () => {
                    if (drop.isPending) return;
                    if (askDelete(`${period.starts_on} 부터의 집중합주 기간과 그 배정 결과`)) drop.mutate(period.id);
                  }
                  : undefined}
              />
            ),
          )}
        </ul>
      )}

      {!canCreate ? null : (
        <div className="listfoot">
          <button className="new" onClick={() => setMaking(true)}>+ 새 집중합주 기간</button>
        </div>
      )}

      {!making ? null : (
        <Modal title="새 집중합주 기간" hint="집중합주 기간을 설정해요"
          onClose={() => setMaking(false)}>
          <PeriodForm
            before={null}
            rooms={rooms}
            submit="기간 추가"
            onCancel={() => setMaking(false)}
            onDone={() => { setMaking(false); onSaved(); }}
          />
        </Modal>
      )}
    </Card>
  );
}

/** 기간 form 입니다. before 가 null 이면 새 기간을 만들고, 아니면 그 기간을 수정합니다.
 *  집중 합주기간이면 전체합주 입력칸이 함께 표시되고, 저장은 savePeriod 가 기간·전체합주 요청을 순서대로 보냅니다.
 *  날짜별 전체합주 시각은 저장된 전체합주가 있을 때만 form 아래에 별도 form 으로 표시합니다. form 안에 두면 그 버튼이 기간 form 을 제출합니다. */
function PeriodForm(props: {
  before: Period | null;
  rooms: Room[];
  submit: string;
  onCancel?: () => void;
  onDone: () => void;
}) {
  const { before, rooms, submit, onCancel, onDone } = props;
  const [form, setForm, touched, reset] = useForm(before === null ? BLANK_PERIOD : periodFields(before));
  const [draft, setDraft, draftTouched, resetDraft] = useForm(ensembleDraft(before, rooms));
  const first = useFirstField<HTMLButtonElement>(onCancel !== undefined);
  const slotMinutes = useSlotMinutes();

  const withEnsemble = form.kind === "focused" && draft.on;
  const send = useMutation({
    mutationFn: () => savePeriod(before, form, withEnsemble ? ensembleBody(draft) : null),
    onSuccess: () => {
      if (before === null) {
        reset();
        resetDraft();
      }
      onDone();
    },
  });

  const room = rooms.find((item) => item.id === draft.room_id);
  const why = checkPeriod(form)
    || checkPracticeWindow(
      windowPair(form.practice_window.weekday),
      windowPair(form.practice_window.weekend),
      slotMinutes,
    )
    || (withEnsemble ? checkEnsemble(draft, periodBody(form), room, slotMinutes) : "");

  const at = (field: string): string => `${before === null ? "/periods" : `/periods/${before.id}`}-${field}`;
  const whyId = at("why");
  const bad = formError(touched || draftTouched, why, send.error);
  const savedRoom = rooms.find((item) => item.id === before?.ensemble?.room_id);

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (why === "") send.mutate();
        }}
      >
        <div className="fields">
          <PeriodFields form={form} setForm={setForm} at={at} bad={bad} whyId={whyId} first={first} />
          {form.kind === "focused" ? (
            <EnsembleFields draft={draft} setDraft={setDraft} period={periodBody(form)} rooms={rooms}
              at={at} bad={bad} whyId={whyId} />
          ) : null}
          <FormTail submit={submit} pending={send.isPending} blocked={why !== ""}
              bad={bad} whyId={whyId} onCancel={onCancel} />
        </div>
      </form>
      {before === null || before.ensemble === null ? null : <EnsembleDays period={before} room={savedRoom} />}
    </>
  );
}
