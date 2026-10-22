// 설정 화면의 집중 합주기간 구역입니다. 기간 목록, 추가, 수정, 삭제와, 기간에 딸린 전체 합주 설정을 담당합니다.
// 전체 합주 입력칸은 SettingsEnsemble 이 제공합니다.

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode, RefObject } from "react";

import { Card, SectionHead } from "../components/Layout";
import { Button, Cell, Empty, FormFoot, TimeRange, Toggle } from "../components/controls";
import { useReturnFocus } from "../components/hooks";
import { Modal } from "../components/Modal";
import { useRemoveRow, useSlotMinutes } from "../components/queries";
import { askDelete } from "../lib/confirm";
import type { ClockRange, Period, PracticeWindow, Room } from "../lib/contract";
import { formError } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import { checkPeriod, daysBetween, periodBody, removePeriod, savePeriod } from "../lib/pipeline";
import type { PeriodDraft } from "../lib/pipeline";
import { MAX_DAILY_HOURS, assignRuleDraft, periodTitle } from "../lib/settings";
import type { WindowPair } from "../lib/settings";
import { EnsembleDays, EnsembleFields, EnsembleToggle, ensembleBody, ensembleDraft } from "./SettingsEnsemble";
import { Row, useFirstField, useForm } from "./SettingsForm";
import { assignRuleMessage as checkAssignRule, ensembleMessage as checkEnsemble, practiceWindowMessage as checkPracticeWindow } from "../lib/settings";

const NO_WINDOW: PracticeWindow = { weekday: null, weekend: null };

const BLANK_PERIOD: PeriodDraft = {
  kind: "focused",
  name: "",
  starts_on: "",
  ends_on: "",
  everyday: false,
  first_run_at: "09:00",
  second_run_at: "21:00",
  practice_window: NO_WINDOW,
  assign_rule: { target_hours: null, max_absent: "0", daily_max_hours: "2", max_consecutive_hours: "2" },
  closes_at: null,
};

/** 기간 form 이 수정하는 값만 추립니다. 목록에서 받은 기간에는 id, ensemble 이 함께 있어 그대로 보내면 요청 본문에 섞입니다.
 *  배정 규칙의 숫자 칸은 입력 문자열로 변환합니다. */
function periodFields(period: Period): PeriodDraft {
  const { kind, name, starts_on, ends_on, everyday, first_run_at, second_run_at } = period;
  return { kind, name, starts_on, ends_on, everyday, first_run_at, second_run_at,
    practice_window: period.practice_window, assign_rule: assignRuleDraft(period.assign_rule), closes_at: period.closes_at };
}

/** 시간대 한 쌍을 입력칸 두 개로 펼칩니다. 지정하지 않은 쌍은 빈 문자열 2개입니다. */
function windowPair(pair: ClockRange | null): WindowPair {
  return pair ?? { starts_at: "", ends_at: "" };
}

/** 입력칸 두 개를 저장할 값으로 변환합니다. 둘 다 비어 있으면 지정하지 않은 쌍입니다. */
function windowValue(pair: WindowPair): ClockRange | null {
  return pair.starts_at === "" && pair.ends_at === "" ? null : pair;
}

/** HH:MM 을 오전, 오후와 시, 분으로 표기한 문자열을 반환합니다. 목록 줄의 스케줄링 시간에 표시합니다. */
function clockText(hhmm: string): string {
  const [hour, minute] = hhmm.split(":").map(Number);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour < 12 ? "오전" : "오후"} ${hour12}시${minute === 0 ? "" : ` ${minute}분`}`;
}

/** 목록 줄의 제목 아래 줄들입니다(사용자 결정 2026-10-07).
 *  총 합주기간, 전체 합주기간(지정한 경우만), 스케줄링 시간(집중 합주기간만), 마감 일시(지정한 경우만) 순서입니다.
 *  확정 해제는 배정 결과 확인 화면에서 합니다(사용자 결정 2026-10-21). */
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
      {period.closes_at === null ? null : (
        <div>
          마감 일시 <b>{period.closes_at.slice(0, 10)} {period.closes_at.slice(11, 16)}</b>
          {period.fixed_at === null ? null : ", 배정 확정"}
        </div>
      )}
    </>
  );
}

/** 기간 form 의 입력칸입니다. 집중 합주기간일 때만 계산 시각 입력칸 2개가 더 표시됩니다.
 *  종류(kind) 선택 대신 공연명 입력이 있습니다(사용자 결정 2026-10-07). 새 기간은 전부 집중 합주(focused)이고,
 *  저장된 open 기간은 수정 form 에서 그 값을 유지합니다. */
function PeriodFields(props: {
  form: PeriodDraft;
  setForm: (next: PeriodDraft) => void;
  at: (field: string) => string;
  bad: string;
  whyId: string;
  first: RefObject<HTMLInputElement | null>;
  /** 확정된 기간이면 마감 일시를 변경할 수 없습니다. 서버도 거절합니다. */
  fixed: boolean;
  /** 전체 합주 체크박스(EnsembleToggle). 날짜 줄의 "매일" 옆에 놓입니다 — 둘 다 날짜에 딸린 옵션입니다. */
  ensembleToggle: ReactNode;
}) {
  const { form, setForm, at, bad, whyId, first, fixed, ensembleToggle } = props;
  const rule = form.assign_rule;
  // 폼 하단 오류(bad)가 배정 규칙 때문일 때만 두 입력칸을 오류로 표시합니다.
  const ruleBad = bad !== "" && checkAssignRule(rule) !== "";
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
            <Toggle
              kind="check"
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
          <div className="frow">
          {/* 선택 입력입니다. 지나면 서버가 마지막 불가능 일정으로 1회 계산해 배정을 확정합니다(사용자 결정 2026-10-20). */}
          <Cell label="마감 일시" htmlFor={at("closes")}>
            <input
              id={at("closes")}
              type="datetime-local"
              disabled={fixed}
              value={form.closes_at?.slice(0, 16) ?? ""}
              onChange={(event) => setForm({ ...form, closes_at: event.target.value === "" ? null : event.target.value })}
            />
          </Cell>
          </div>
          <div className="frow">
          {/* 빈칸이면 서버가 목표를 자동으로 조정합니다(사용자 결정 2026-10-12). */}
          <Cell label="팀당 목표 시간" htmlFor={at("target")}>
            <input
              id={at("target")}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              placeholder="미입력 시 자동 조정"
              aria-invalid={ruleBad}
              aria-describedby={ruleBad ? whyId : undefined}
              value={rule.target_hours ?? ""}
              onChange={(event) => setForm({
                ...form,
                assign_rule: { ...rule, target_hours: event.target.value === "" ? null : Number(event.target.value) },
              })}
            />
          </Cell>
          {/* 숫자 칸 3개는 입력 문자열 그대로 보관합니다. 빈칸은 checkAssignRule 이 거부하고, 저장할 때 periodBody 가 숫자로 변환합니다. */}
          <Cell label="불참 허용 인원" htmlFor={at("absent")}>
            <input
              id={at("absent")}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={rule.max_absent}
              aria-invalid={ruleBad}
              aria-describedby={ruleBad ? whyId : undefined}
              onChange={(event) => setForm({
                ...form,
                assign_rule: { ...rule, max_absent: event.target.value },
              })}
            />
          </Cell>
          </div>
          <div className="frow">
          {/* 팀 1개가 하루에 배정받는 시간의 상한과, 끊기지 않고 이어지는 시간의 상한입니다(사용자 결정 2026-10-20). 최대 연속은 하루 최대 이하입니다. */}
          <Cell label="팀당 하루 최대 배정시간" htmlFor={at("daily")}>
            <input
              id={at("daily")}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_DAILY_HOURS}
              step={1}
              value={rule.daily_max_hours}
              aria-invalid={ruleBad}
              aria-describedby={ruleBad ? whyId : undefined}
              onChange={(event) => setForm({
                ...form,
                assign_rule: { ...rule, daily_max_hours: event.target.value },
              })}
            />
          </Cell>
          <Cell label="최대 연속 배정시간" htmlFor={at("consecutive")}>
            <input
              id={at("consecutive")}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_DAILY_HOURS}
              step={1}
              value={rule.max_consecutive_hours}
              aria-invalid={ruleBad}
              aria-describedby={ruleBad ? whyId : undefined}
              onChange={(event) => setForm({
                ...form,
                assign_rule: { ...rule, max_consecutive_hours: event.target.value },
              })}
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
    <TimeRange
      id={at(field)}
      labels={[`${label} 시작 시간`, `${label} 종료 시간`]}
      value={[pair.starts_at, pair.ends_at]}
      onChange={([starts_at, ends_at]) => onChange({ starts_at, ends_at })}
    />
  );
}

export function PeriodCard(props: {
  periods: Period[]; rooms: Room[]; state: LoadState; canEdit: boolean; canCreate: boolean; canDelete: boolean;
  onSaved: () => void; onDeleted: () => void;
}) {
  const { periods, rooms, state, canEdit, canCreate, canDelete, onSaved, onDeleted } = props;
  const { openId: editing, open, close, register } = useReturnFocus();
  const drop = useRemoveRow(removePeriod, onDeleted);

  return (
    <Card>
      <SectionHead title="집중 합주기간" desc="자동 스케줄링을 진행할 기간을 설정해요" />

      {state.kind !== "ready" || periods.length === 0 ? (
        <Empty as="div" state={state} text="아직 등록된 집중 합주기간이 존재하지 않아요." />
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
              // onEdit 이 없으면 Row 가 수정 버튼을 그리지 않습니다. period_edit 권한이 없는 사람에게는
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
                onDelete={canDelete
                  ? () => drop(period.id, () => askDelete(`${period.starts_on} 부터의 집중 합주기간과 그 배정 결과`))
                  : undefined}
              />
            ),
          )}
        </ul>
      )}

      {!canCreate ? null : <NewPeriodButton rooms={rooms} onSaved={onSaved} />}
    </Card>
  );
}

/** "+ 새 집중 합주기간" 버튼과 생성 modal 입니다. 저장이 끝나면 modal 을 닫고 onSaved 를 호출합니다. */
function NewPeriodButton({ rooms, onSaved }: { rooms: Room[]; onSaved: () => void }) {
  const [making, setMaking] = useState(false);
  return (
    <>
      <div className="listfoot">
        <Button kind="go" onClick={() => setMaking(true)}>+ 새 집중 합주기간</Button>
      </div>
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
    </>
  );
}

/** 기간 form 입니다. before 가 null 이면 새 기간을 만들고, 아니면 그 기간을 수정합니다.
 *  집중 합주기간이면 전체 합주 입력칸이 함께 표시되고, 저장은 savePeriod 가 기간, 전체 합주 요청을 순서대로 보냅니다.
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
    || checkAssignRule(form.assign_rule)
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
            fixed={before?.fixed_at != null}
            ensembleToggle={<EnsembleToggle draft={draft} setDraft={setDraft} at={at} />} />
          {withEnsemble ? (
            <div className="fgroup">
              <h4>전체 합주</h4>
              <EnsembleFields draft={draft} setDraft={setDraft} period={periodBody(form)} rooms={rooms}
                at={at} bad={bad} whyId={whyId} />
            </div>
          ) : null}
          <FormFoot submitLabel={submit} pending={send.isPending} blocked={why !== ""}
              bad={bad} whyId={whyId} onCancel={onCancel} />
        </div>
      </form>
      {before === null || before.ensemble === null ? null : <EnsembleDays period={before} room={savedRoom} />}
    </>
  );
}
