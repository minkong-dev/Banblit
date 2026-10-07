// 설정 화면의 집중 합주기간 구역입니다. 기간 목록·추가·수정·삭제와, 기간에 딸린 전체 합주 설정을 담당합니다.
// 전체 합주 입력칸 자체는 SettingsEnsemble 이 제공합니다. 달력의 하루 dialog 도 같은 부품을 사용합니다.

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode, RefObject } from "react";

import { Card, SectionHead } from "../components/Layout";
import { CheckMark } from "../components/CheckMark";
import { useReturnFocus } from "../components/hooks";
import { Modal } from "../components/Modal";
import { useSlotMinutes } from "../components/queries";
import { getJSON, reason } from "../lib/api";
import { askDelete } from "../lib/confirm";
import type { ClockRange, Period, PracticeWindow, Room } from "../lib/contract";
import { formError } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import {
  checkEnsemble, checkPeriod, checkPracticeWindow, daysBetween,
  periodBody, savePeriod,
} from "../lib/pipeline";
import type { PeriodBody } from "../lib/pipeline";
import { periodTitle } from "../lib/settings";
import type { WindowPair } from "../lib/settings";
import { say } from "../lib/toast";
import { EnsembleDays, EnsembleFields, EnsembleToggle, ensembleBody, ensembleDraft } from "./SettingsEnsemble";
import {
  Cell,
  CardState,
  FormTail,
  Row,
  useFirstField,
  useForm,
} from "./SettingsForm";

const NO_WINDOW: PracticeWindow = { weekday: null, weekend: null };

const BLANK_PERIOD: PeriodBody = {
  kind: "focused",
  name: "",
  starts_on: "",
  ends_on: "",
  everyday: false,
  first_run_at: "09:00",
  second_run_at: "21:00",
  practice_window: NO_WINDOW,
};

/** 기간 form 이 수정하는 값만 추립니다. 목록에서 받은 기간에는 id·ensemble 이 함께 있어 그대로 보내면 요청 본문에 섞입니다. */
function periodFields(period: Period): PeriodBody {
  const { kind, name, starts_on, ends_on, everyday, first_run_at, second_run_at } = period;
  return { kind, name, starts_on, ends_on, everyday, first_run_at, second_run_at,
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

/** "09:00" → "오전 9시", "21:30" → "오후 9시 30분". 목록 줄의 스케줄링 시간 표기입니다. */
function clockText(hhmm: string): string {
  const [hour, minute] = hhmm.split(":").map(Number);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour < 12 ? "오전" : "오후"} ${hour12}시${minute === 0 ? "" : ` ${minute}분`}`;
}

/** 목록 줄의 제목 아래 줄들입니다(2026-10-07 개발자님이 정한 구성).
 *  총 합주기간 → 전체 합주기간(지정한 경우만) → 스케줄링 시간(집중 합주기간만) 순서입니다. */
function PeriodLines({ period }: { period: Period }) {
  const { starts_on, ends_on, everyday, ensemble } = period;
  return (
    <>
      <div>
        총 합주기간{" "}
        {everyday
          ? <><b>{starts_on}</b> 부터 매일</>
          : <><b>{starts_on}</b> ~ <b>{ends_on}</b>, 총 {daysBetween(starts_on, ends_on)}일</>}
      </div>
      {ensemble === null ? null : (
        <div>
          전체 합주기간 <b>{ensemble.starts_on}</b> ~ <b>{ensemble.ends_on}</b>,
          총 {daysBetween(ensemble.starts_on, ensemble.ends_on)}일
        </div>
      )}
      {period.kind !== "focused" ? null : (
        <div>스케줄링 시간 {clockText(period.first_run_at)}, {clockText(period.second_run_at)}</div>
      )}
    </>
  );
}

/** 기간 form 의 입력칸입니다. 집중 합주기간일 때만 계산 시각 입력칸 2개가 더 표시됩니다.
 *  종류(kind) 선택은 없습니다 — 상시 개방(open)은 서버가 아무 동작도 하지 않는 값이라 2026-10-07 에 공연명 입력으로
 *  바꿨습니다. 새 기간은 전부 집중 합주(focused)이고, 저장된 open 기간은 수정 form 에서 그 값을 유지합니다. */
function PeriodFields(props: {
  form: PeriodBody;
  setForm: (next: PeriodBody) => void;
  at: (field: string) => string;
  bad: string;
  whyId: string;
  first: RefObject<HTMLInputElement | null>;
  /** 전체 합주 체크박스(EnsembleToggle). 날짜 줄의 "매일" 옆에 놓입니다 — 둘 다 날짜에 딸린 옵션입니다. */
  ensembleToggle: ReactNode;
}) {
  const { form, setForm, at, bad, whyId, first, ensembleToggle } = props;
  return (
    <>
      <div className="fgroup">
      <h4>일반</h4>
      <div className="frow">
      <Cell label="공연명" wide htmlFor={at("name")}>
        <input
          ref={first}
          id={at("name")}
          type="text"
          maxLength={60}
          placeholder="공연명을 입력해주세요"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </Cell>
      </div>
      <div className="frow">
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
      {/* 체크 2개는 3번째 열 한 칸 안에 나란히 둡니다(styles/settings.css 의 .checks). */}
      {form.kind === "focused" ? (
        <div className="checks">
          <Cell label="매일" htmlFor={at("everyday")}>
            <CheckMark
              id={at("everyday")}
              checked={form.everyday}
              onChange={(on) => setForm({ ...form, everyday: on })}
            />
          </Cell>
          {ensembleToggle}
        </div>
      ) : null}
      </div>
      </div>
      {form.kind === "focused" ? (
        <>
          <div className="fgroup">
          <h4>스케줄링</h4>
          <div className="frow">
          <Cell label="1차" htmlFor={at("first")}>
            <input
              id={at("first")}
              type="time"
              value={form.first_run_at}
              onChange={(event) => setForm({ ...form, first_run_at: event.target.value })}
            />
          </Cell>
          <Cell label="2차" htmlFor={at("second")}>
            <input
              id={at("second")}
              type="time"
              value={form.second_run_at}
              onChange={(event) => setForm({ ...form, second_run_at: event.target.value })}
            />
          </Cell>
          </div>
          </div>
          <div className="fgroup">
          <h4>팀별 합주</h4>
          {/* 합주실 개방시각과는 다른 값입니다. 합주실이 09시에 열어도 팀별 합주는 17시부터만
              배정할 수 있고, 남는 시간은 선착순 예약으로 열립니다. 비워 두면 개방시각 전체를 씁니다. */}
          <div className="frow">
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
          </div>
          <div className="frow">
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
          </div>
          </div>
        </>
      ) : null}
    </>
  );
}

/** 팀별 합주 시간대 한 쌍의 입력칸입니다. 두 칸을 모두 비우면 그날 합주실 개방시각 전체를 씁니다. */
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
      <Cell label={`${label} 시작`} htmlFor={at(`${field}From`)}>
        <input
          id={at(`${field}From`)}
          type="time"
          value={pair.starts_at}
          onChange={(event) => onChange({ ...pair, starts_at: event.target.value })}
        />
      </Cell>
      <Cell label={`${label} 종료`} htmlFor={at(`${field}To`)}>
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
  const { openId: editing, open, close, register } = useReturnFocus();
  const [making, setMaking] = useState(false);
  // 기간을 삭제하면 서버가 그 기간의 배정 결과·계산 기록·이전 배정기록을 함께 삭제합니다(외래 키 CASCADE).
  const drop = useMutation({
    mutationFn: (id: number) => getJSON(`/periods/${id}`, { method: "DELETE" }),
    onSuccess: onDeleted,
    onError: (error) => say(reason(error)),
  });

  return (
    <Card>
      <SectionHead title="집중 합주기간" desc="자동 스케줄링을 진행할 기간을 설정해요" />

      {state.kind !== "ready" || periods.length === 0 ? (
        <CardState state={state} empty="아직 등록된 집중 합주기간이 없어요." />
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
                title={periodTitle(period)}
                when={<PeriodLines period={period} />}
                span=""
                editLabel={canEdit ? `${period.starts_on} 부터의 기간을 수정` : undefined}
                buttonRef={canEdit ? register(period.id) : undefined}
                onEdit={canEdit ? () => open(period.id) : undefined}
                deleteLabel={canDelete ? `${period.starts_on} 부터의 기간을 삭제` : undefined}
                // 삭제 요청이 진행 중이면 다시 누른 것을 무시합니다. 연속으로 누르면 같은 DELETE 가 여러 번 전송됩니다.
                onDelete={canDelete
                  ? () => {
                    if (drop.isPending) return;
                    if (askDelete(`${period.starts_on} 부터의 집중 합주기간과 그 배정 결과`)) drop.mutate(period.id);
                  }
                  : undefined}
              />
            ),
          )}
        </ul>
      )}

      {!canCreate ? null : (
        <div className="listfoot">
          <button className="new" onClick={() => setMaking(true)}>+ 새 집중 합주기간</button>
        </div>
      )}

      {!making ? null : (
        <Modal title="새 집중 합주기간" hint="집중 합주기간을 설정해요"
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
 *  집중 합주기간이면 전체 합주 입력칸이 함께 표시되고, 저장은 savePeriod 가 기간·전체 합주 요청을 순서대로 보냅니다.
 *  날짜별 전체 합주 시각은 저장된 전체 합주가 있을 때만 form 아래에 별도 form 으로 표시합니다. form 안에 두면 그 버튼이 기간 form 을 제출합니다. */
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
  const first = useFirstField<HTMLInputElement>(onCancel !== undefined);
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
        <div className="fields period">
          <h3 className="fsec">기간 기본설정</h3>
          <PeriodFields form={form} setForm={setForm} at={at} bad={bad} whyId={whyId} first={first}
            ensembleToggle={<EnsembleToggle draft={draft} setDraft={setDraft} at={at} />} />
          {withEnsemble ? (
            <div className="fgroup">
              <h4>전체 합주</h4>
              <EnsembleFields draft={draft} setDraft={setDraft} period={periodBody(form)} rooms={rooms}
                at={at} bad={bad} whyId={whyId} />
            </div>
          ) : null}
          <FormTail submit={submit} pending={send.isPending} blocked={why !== ""}
              bad={bad} whyId={whyId} onCancel={onCancel} />
        </div>
      </form>
      {before === null || before.ensemble === null ? null : <EnsembleDays period={before} room={savedRoom} />}
    </>
  );
}
