import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { RefObject } from "react";

import { AppShell, Card, Panel, Tabs } from "../components/AppShell";
import { CheckMark } from "../components/CheckMark";
import { Dropdown } from "../components/Dropdown";
import { Modal } from "../components/Modal";
import { getJSON, reason } from "../lib/api";
import { askDelete } from "../lib/confirm";
import { formError, loadState } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import { say } from "../lib/toast";
import {
  checkEnsemble, checkPeriod, checkRoom, dayLabel, daysBetween, openingHours, periodBody, savePeriod,
  saveSlotMinutes,
} from "../lib/pipeline";
import { SLOT_MINUTE_CHOICES, slotMinutesLabel } from "../lib/settings";
import type { PeriodBody } from "../lib/pipeline";
import { EnsembleDays, EnsembleFields, ensembleBody, ensembleDraft } from "./SettingsEnsemble";
import { useMe, usePeriods, useRooms, useSlotMinutes, useTeams } from "../components/queries";
import { can } from "../lib/account";
import { applyTheme, readSavedTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { MemberCards } from "./SettingsMembers";
import { ReservationCards } from "./SettingsReservations";
import { BlindedCards } from "./SettingsBlinded";
import { AccountCards } from "./SettingsAccount";
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
import "../styles/settings.css";
import type { Period, Room, Team } from "../lib/contract";


type Tab = "rooms" | "periods" | "members" | "reservations" | "blinded" | "account";

// 탭마다 필요한 권한 항목이 다릅니다. 가진 권한의 탭만 표시되므로, 관리 권한이 없는 사람에게는 계정 탭 하나만 남습니다.
// 내 정보·비밀번호·화면 밝기·탈퇴는 전부 자기 계정에 대한 설정이라 한 탭에 둡니다.
// needs가 없는 탭은 로그인한 모든 사람이 볼 수 있습니다.
const TABS = [
  { key: "rooms" as const, text: "합주실", needs: ["room_create", "room_edit"] as const },
  { key: "periods" as const, text: "기간", needs: ["period_create", "period_edit", "period_delete"] as const },
  { key: "members" as const, text: "멤버", needs: ["permission_manage", "permission_grant"] as const },
  { key: "reservations" as const, text: "예약", needs: ["reservation_manage"] as const },
  { key: "blinded" as const, text: "블라인드", needs: ["board_moderate"] as const },
  { key: "account" as const, text: "계정", needs: null },
];

const BLANK_ROOM = { name: "", opens_at: "18:00", closes_at: "23:00" };
const BLANK_PERIOD: PeriodBody = {
  kind: "focused",
  starts_on: "",
  ends_on: "",
  everyday: false,
  first_run_at: "09:00",
  second_run_at: "21:00",
};

const KIND_TEXT = { open: "상시 개방", focused: "집중 합주" };

/** 기간 form 이 수정하는 값만 추립니다. 목록에서 받은 기간에는 id·ensemble 이 함께 있어 그대로 보내면 요청 본문에 섞입니다. */
function periodFields(period: Period): PeriodBody {
  const { kind, starts_on, ends_on, everyday, first_run_at, second_run_at } = period;
  return { kind, starts_on, ends_on, everyday, first_run_at, second_run_at };
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

/** 화면 밝기를 선택하는 카드입니다. 선택한 값은 브라우저에 저장되어 다음에 열 때도 유지됩니다. */
function ThemeCard() {
  // 초기값을 한 번만 읽습니다. 이후 사용자가 선택한 값이 정본입니다.
  const [theme, setTheme] = useState<Theme>(() => readSavedTheme());

  const choices: { key: Theme; label: string }[] = [
    { key: "light", label: "라이트" },
    { key: "dark", label: "다크" },
  ];

  return (
    <Card>
      <SectionHead title="테마" desc="현재 브라우저에서의 테마를 지정해요" />
      <div className="display">
        <div className="pick" role="group" aria-label="화면 밝기">
          {choices.map((choice) => (
            <button
              key={choice.key}
              aria-pressed={theme === choice.key}
              onClick={() => setTheme(applyTheme(choice.key))}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function Settings() {
  const [tab, setTab] = useState<Tab>("rooms");
  const client = useQueryClient();
  const { me } = useMe();

  // 권한 항목 하나만 있어도 그 탭을 엽니다. 생성만 할 수 있고 수정할 수 없는 사람도 목록은 봐야 하기 때문입니다.
  const tabs = TABS.filter(
    (item) => item.needs === null || item.needs.some((need) => can(me, need)),
  );
  // 권한을 잃은 채로 그 탭에 머물러 있지 않게, 없는 탭이면 남은 탭 중 첫 탭을 표시합니다.
  // 계정 탭은 모든 사람이 볼 수 있으므로 tabs가 비는 일은 없습니다.
  const shown: Tab = tabs.some((item) => item.key === tab) ? tab : tabs[0].key;

  const rooms = useRooms();
  const periods = usePeriods();
  // 팀 목록은 오른쪽 계산에만 사용합니다. queryKey 가 다른 화면에서 사용하는 것과 같아서,
  // 이미 받은 목록이 있으면 다시 조회하지 않습니다.
  const teams = useTeams();

  const roomList = rooms.data?.rooms ?? [];
  const periodList = periods.data?.periods ?? [];
  const teamList = teams.data?.teams ?? [];

  // 저장이 끝나면 목록을 서버에서 다시 조회합니다. 화면은 서버에서 받은 값만 표시합니다.
  function saved(key: string, text: string): () => void {
    return () => {
      void client.invalidateQueries({ queryKey: [key] });
      say(text);
    };
  }

  return (
    <AppShell
      page="settings"
      current="settings"
    >
      <Tabs label="설정" items={tabs} selected={shown} onSelect={setTab} />

      <div className="main">
        {shown === "rooms" ? (
          <>
            <RoomCard
              rooms={roomList}
              state={loadState(rooms)}
              canEdit={can(me, "room_edit")}
              canCreate={can(me, "room_create")}
              onSaved={saved("rooms", "합주실 정보를 등록했어요.")}
            />
            <SlotUnitCard
              canEdit={can(me, "room_edit")}
              onSaved={saved("settings", "점유 단위를 변경했어요.")}
            />
          </>
        ) : shown === "periods" ? (
          <PeriodCard
            periods={periodList}
            rooms={roomList}
            state={loadState(periods)}
            canEdit={can(me, "period_edit")}
            canCreate={can(me, "period_create")}
            canDelete={can(me, "period_delete")}
            onSaved={saved("periods", "집중 합주기간을 등록했어요.")}
            onDeleted={saved("periods", "집중 합주기간을 삭제했어요.")}
          />
        ) : shown === "members" ? (
          <MemberCards />
        ) : shown === "reservations" ? (
          <ReservationCards />
        ) : shown === "blinded" ? (
          <BlindedCards />
        ) : (
          <AccountCards theme={<ThemeCard />} />
        )}
      </div>

      {shown === "members" || shown === "reservations" || shown === "blinded" || shown === "account" ? null : (
        <div className="rail">
          <Readout
            rooms={roomList}
            periods={periodList}
            teams={teamList}
            teamsState={loadState(teams)}
            tab={shown}
          />
        </div>
      )}
    </AppShell>
  );
}

/** 점유 단위(칸 하나의 크기)를 변경하는 카드입니다. 합주실 운영을 맡은 사람의 설정이라 합주실 탭에 둡니다.
 *  권한(room_edit)이 없으면 현재 값만 표시합니다. 변경해도 이미 저장된 예약과 배정은 그대로 남습니다. */
function SlotUnitCard({ canEdit, onSaved }: { canEdit: boolean; onSaved: () => void }) {
  const slotMinutes = useSlotMinutes();
  const [why, setWhy] = useState("");
  const save = useMutation({
    mutationFn: saveSlotMinutes,
    onSuccess: () => { setWhy(""); onSaved(); },
    onError: (error: unknown) => setWhy(reason(error)),
  });

  return (
    <Card>
      <SectionHead title="점유 단위" desc="변경해도 등록된 예약과 배정은 그대로 남아요" />
      <div className="fields">
        <Cell label="단위" htmlFor="slotUnit">
          <Dropdown
            id="slotUnit"
            value={slotMinutes}
            disabled={!canEdit || save.isPending}
            invalid={why !== ""}
            describedBy={why === "" ? undefined : "slotUnitWhy"}
            choices={SLOT_MINUTE_CHOICES.map((minutes) => ({
              value: minutes,
              label: slotMinutesLabel(minutes),
            }))}
            onChange={(next) => save.mutate(next)}
          />
        </Cell>
        {why === "" ? null : <p className="why" id="slotUnitWhy" role="alert">{why}</p>}
      </div>
    </Card>
  );
}

/** 합주실 form 의 입력칸입니다. */
function RoomFields(props: {
  form: { name: string; opens_at: string; closes_at: string };
  setForm: (next: { name: string; opens_at: string; closes_at: string }) => void;
  at: (field: string) => string;
  bad: string;
  whyId: string;
  first: RefObject<HTMLInputElement | null>;
}) {
  const { form, setForm, at, bad, whyId, first } = props;
  return (
    <>
      <Cell label="이름" wide htmlFor={at("name")}>
        <input
          ref={first}
          value={form.name}
          id={at("name")}
          aria-invalid={bad !== ""}
          aria-describedby={bad === "" ? undefined : whyId}
          placeholder="합주실"
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </Cell>
      <Cell label="개방 시간" htmlFor={at("opens")}>
        <input
          type="time"
          step={3600}
          value={form.opens_at}
          id={at("opens")}
          aria-invalid={bad !== ""}
          aria-describedby={bad === "" ? undefined : whyId}
          onChange={(event) => setForm({ ...form, opens_at: event.target.value })}
        />
      </Cell>
      <Cell label="마감 시간" htmlFor={at("closes")}>
        <input
          type="time"
          step={3600}
          value={form.closes_at}
          id={at("closes")}
          aria-invalid={bad !== ""}
          aria-describedby={bad === "" ? undefined : whyId}
          onChange={(event) => setForm({ ...form, closes_at: event.target.value })}
        />
      </Cell>
    </>
  );
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
        </>
      ) : null}
    </>
  );
}

function RoomCard(props: {
  rooms: Room[]; state: LoadState; canEdit: boolean; canCreate: boolean; onSaved: () => void;
}) {
  const { rooms, state, canEdit, canCreate, onSaved } = props;
  const slotMinutes = useSlotMinutes();
  const { editing, open, close, register } = useRowFocus();
  const [making, setMaking] = useState(false);

  return (
    <Card>
      <SectionHead title="합주실" desc="개방 및 마감시간은 정각으로만 설정이 가능해요" />

      {state.kind !== "ready" || rooms.length === 0 ? (
        <CardState state={state} empty="아직 등록된 합주실이 없어요" />
      ) : (
        <ul className="rows">
          {rooms.map((room) =>
            canEdit && editing === room.id ? (
              <li className="editing" key={room.id}>
                <RoomForm
                  start={room}
                  // 자신의 이름은 중복 검사 대상에서 제외합니다.
                  taken={rooms.filter((other) => other.id !== room.id).map((other) => other.name)}
                  path={`/rooms/${room.id}`}
                  method="PATCH"
                  submit="저장"
                  onCancel={close}
                  onDone={() => {
                    close();
                    onSaved();
                  }}
                />
              </li>
            ) : (
              // onEdit이 없으면 Row가 수정 버튼을 그리지 않습니다. room_edit 권한이 없는 사람에게는
              // 목록만 표시됩니다.
              <Row
                key={room.id}
                title={room.name}
                when={<><b>{room.opens_at}</b> 부터 <b>{room.closes_at}</b> 까지</>}
                span={` · 하루 ${openingHours({ rooms: [room], days: 1, teams: 0, slotMinutes }).perDay}`}
                editLabel={canEdit ? `${room.name} 수정` : undefined}
                buttonRef={canEdit ? register(room.id) : undefined}
                onEdit={canEdit ? () => open(room.id) : undefined}
              />
            ),
          )}
        </ul>
      )}

      {/* 합주실은 하나만 사용합니다. 이미 하나 있으면 추가 form 을 표시하지 않습니다.
          저장소와 배정 계산은 합주실 2개 이상을 다룰 수 있게 그대로 두고, 추가 경로만 차단했습니다.
          여러 합주실을 다시 쓸 일이 생기면 이 조건 하나를 제거하면 됩니다. */}
      {!canCreate || rooms.length > 0 ? null : (
        <div className="listfoot">
          <button className="new" onClick={() => setMaking(true)}>+ 새 합주실</button>
        </div>
      )}

      {!making ? null : (
        <Modal title="새 합주실" hint="합주실 이름과 개방 및 마감시간을 지정해주세요"
          onClose={() => setMaking(false)}>
          <RoomForm
            start={BLANK_ROOM}
            taken={rooms.map((room) => room.name)}
            path="/rooms"
            method="POST"
            submit="합주실 추가"
            onCancel={() => setMaking(false)}
            onDone={() => { setMaking(false); onSaved(); }}
          />
        </Modal>
      )}
    </Card>
  );
}

function RoomForm(props: {
  start: { name: string; opens_at: string; closes_at: string };
  taken: string[];
  path: string;
  method: "POST" | "PATCH";
  submit: string;
  onCancel?: () => void;
  onDone: () => void;
}) {
  const { start, taken, path, method, submit, onCancel, onDone } = props;
  const [form, setForm, touched, reset] = useForm(start);
  const first = useFirstField<HTMLInputElement>(onCancel !== undefined);

  const send = useMutation({
    mutationFn: () =>
      getJSON<{ room: Room }>(path, {
        method,
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      // 새로 생성한 뒤에는 다음 항목을 입력하도록 form 을 초기화합니다. 수정 중이면 그대로 둡니다.
      if (method === "POST") reset();
      onDone();
    },
  });

  const slotMinutes = useSlotMinutes();
  const why = checkRoom(form, taken, slotMinutes);

  // 같은 화면에 추가 form 과 수정 행이 함께 표시될 수 있습니다. label 이 어느 입력칸을 가리키는지
  // 모호해지지 않도록, 화면 내 식별자를 form 마다 다르게 짓습니다.
  const at = (field: string): string => `${path}-${field}`;
  const whyId = at("why");
  const bad = formError(touched, why, send.error);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (why === "") send.mutate();
      }}
    >
      <div className="fields">
        <RoomFields form={form} setForm={setForm} at={at} bad={bad} whyId={whyId} first={first} />
        <FormTail submit={submit} pending={send.isPending} blocked={why !== ""}
            bad={bad} whyId={whyId} onCancel={onCancel} />
      </div>
    </form>
  );
}

function PeriodCard(props: {
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

/** 팀 목록이 성공적으로 조회되면 팀 수와 배정된 인원 수를 반환합니다. 그렇지 않을 경우 조회할 수 없는 이유를 반환합니다. */
function teamLine(teams: Team[], state: LoadState): string {
  if (state.kind === "loading") return "팀 리스트를 불러오는 중…";
  if (state.kind === "failed") return state.why;
  const filled = teams.reduce((sum, team) => sum + team.filled_count, 0);
  const slots = teams.reduce((sum, team) => sum + team.slot_count, 0);
  return `팀 ${teams.length}개 · 포지션 ${slots}개 중 ${filled}명 배정됨`;
}

/** 현재 설정에서 실제로 얼마가 개방되는지를 표시합니다. 집중 합주기간은 모든 팀이 같은 배정을 받아야 합니다. */
function Readout(props: {
  rooms: Room[];
  periods: Period[];
  teams: Team[];
  teamsState: LoadState;
  tab: Tab;
}) {
  const { rooms, periods, teams, teamsState, tab } = props;
  const slotMinutes = useSlotMinutes();

  // 집중 합주기간이 2개 이상이면 첫 번째 기간만 계산합니다. 어느 기간인지는 아래 날짜로 표시하므로
  // 혼동하지 않습니다. 여러 개를 비교하는 기능은 선택지를 만든 뒤에 추가합니다.
  const focused = periods.filter((period) => period.kind === "focused");
  const period = tab === "periods" ? focused[0] : undefined;
  const days = period ? daysBetween(period.starts_on, period.ends_on) : 1;
  // 팀 수는 팀 목록 endpoint(API의 요청 주소 단위)가 제공합니다. 아직 조회하지 못했으면 0 이며,
  // 이 경우 팀당 배정을 계산하지 않습니다.
  const count = teams.length;
  const sum = openingHours({ rooms, days, teams: count, slotMinutes });

  return (
    <Panel title="해당 설정으로" hint={period ? `${days}일 기준` : "하루 기준"}>
      <div className="read">
        <div className="big">
          {sum.total}
          <small>
            {period
              ? `${period.starts_on} – ${period.ends_on} 동안 개방을 진행해요.`
              : `합주실 ${rooms.length} 전체 총 개방 시간`}
          </small>
        </div>

        <dl>
          <dt>하루</dt>
          <dd>{sum.perDay}</dd>
          {count > 0 ? (
            <>
              <dt>팀당</dt>
              <dd>{sum.perTeam}</dd>
              <dt>균등 배정 후 잔여 시간</dt>
              <dd className="left">{sum.leftover}</dd>
            </>
          ) : null}
        </dl>

        <div className="teams">{teamLine(teams, teamsState)}</div>

        <p className="note">
          {count > 0
            ? "집중합주 기간에는 모든 팀이 같은 합주 횟수를 갖도록 스케줄링을 진행해요."
            : "현재 생성된 팀이 없어요."}
        </p>
      </div>
    </Panel>
  );
}
