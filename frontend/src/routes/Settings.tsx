import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { RefObject } from "react";

import { AppShell, Card, Panel, Tabs } from "../components/AppShell";
import { getJSON } from "../lib/api";
import { checkPeriod, checkRoom, daysBetween, openingHours } from "../lib/pipeline";
import { useMe, useToast } from "../components/hooks";
import { can, roleLabel } from "../lib/account";
import { PermissionCard } from "./SettingsPermissions";
import {
  Cell,
  CardState,
  FormTail,
  Row,
  reason,
  useFirstField,
  useForm,
  useRowFocus,
} from "./SettingsForm";
import "../styles/settings.css";
import type { Period, Room, Team } from "../lib/contract";


type Tab = "rooms" | "periods" | "permissions";

// 합주실·기간 목록은 계정만 있으면 서버가 보여준다. 그래서 탭은 늘 있고, 고치는
// 단추만 항목으로 가린다. 권한 탭은 목록을 받는 통로부터 permission_grant 를 요구한다.
const TABS = [
  { key: "rooms" as const, text: "합주실" },
  { key: "periods" as const, text: "기간" },
];
const PERMISSION_TAB = { key: "permissions" as const, text: "권한" };

const BLANK_ROOM = { name: "", opens_at: "18:00", closes_at: "23:00" };
const BLANK_PERIOD = {
  kind: "focused" as const,
  starts_on: "",
  ends_on: "",
  everyday: false,
  first_run_at: "09:00",
  second_run_at: "21:00",
};

const KIND_TEXT = { open: "상시 개방", focused: "집중 합주" };

/** 목록 줄 오른쪽에 붙는 한 줄. 집중 합주기간에만 계산 시각 둘이 더 붙는다. */
function periodSpan(period: Period): string {
  const days = ` · ${daysBetween(period.starts_on, period.ends_on)}일`;
  if (period.kind !== "focused") return days;
  return `${days} · 계산 ${period.first_run_at} · ${period.second_run_at}`;
}

/** 권한 탭에서 오른쪽에 두는 안내. 합주실·기간 탭의 셈(Readout)이 들어설 자리다. */
function PermissionNote() {
  return (
    <Panel title="권한" hint="항목 열한 가지">
      <div className="read">
        <p className="note">
          묶음을 만들어 할 수 있는 일을 켜고, 그 묶음을 사람에게 붙입니다.
          한 사람이 묶음을 여럿 가지면 켜진 항목이 모두 합쳐집니다.
        </p>
        <p className="note">
          이 화면이 단추를 감추는 것은 안내일 뿐입니다.
          실제로 허용할지는 서버가 요청마다 다시 판정합니다.
        </p>
      </div>
    </Panel>
  );
}

export function Settings() {
  const [tab, setTab] = useState<Tab>("rooms");
  const { message, say } = useToast();
  const client = useQueryClient();
  const { me } = useMe();

  const canGrant = can(me, "permission_grant");
  const tabs = canGrant ? [...TABS, PERMISSION_TAB] : TABS;
  // 권한을 잃은 채로 그 탭에 머물러 있지 않게, 없는 탭이면 첫 탭을 보여준다.
  const shown: Tab = tabs.some((item) => item.key === tab) ? tab : "rooms";

  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: () => getJSON<{ rooms: Room[] }>("/rooms"),
  });
  const periods = useQuery({
    queryKey: ["periods"],
    queryFn: () => getJSON<{ periods: Period[] }>("/periods"),
  });
  // 팀 목록은 오른쪽 셈에만 쓴다. 질의 이름은 다른 화면이 쓰는 것과 같아, 이미 받아
  // 둔 목록이 있으면 다시 부르지 않는다.
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: () => getJSON<{ teams: Team[] }>("/teams"),
  });

  const roomList = rooms.data?.rooms ?? [];
  const periodList = periods.data?.periods ?? [];
  const teamList = teams.data?.teams ?? [];

  // 저장이 끝나면 그 목록을 다시 받아온다. 화면이 스스로 값을 지어내지 않게 한다.
  function saved(key: string, text: string): () => void {
    return () => {
      void client.invalidateQueries({ queryKey: [key] });
      say(text);
    };
  }

  function stateOf(query: { isPending: boolean; error: unknown }): string {
    if (query.isPending) return "loading";
    return query.error ? reason(query.error) : "";
  }

  return (
    <AppShell
      page="settings"
      current="settings"
      toast={message}
      profile={
        <button className="profbtn">
          <span className="face" aria-hidden="true">{me?.name.slice(0, 2) ?? ""}</span>
          <span className="nm">{me?.name ?? ""}</span>
          <span className="role">{me ? roleLabel(me.role) : ""}</span>
        </button>
      }
    >
      <Tabs label="설정" items={tabs} selected={shown} onSelect={setTab} />

      <div className="main">
        {shown === "rooms" ? (
          <RoomCard
            rooms={roomList}
            state={stateOf(rooms)}
            canEdit={can(me, "room_manage")}
            onSaved={saved("rooms", "합주실을 저장했습니다")}
          />
        ) : shown === "periods" ? (
          <PeriodCard
            periods={periodList}
            state={stateOf(periods)}
            canEdit={can(me, "period_manage")}
            onSaved={saved("periods", "기간을 저장했습니다")}
          />
        ) : (
          <PermissionCard onSay={say} />
        )}
      </div>

      <div className="rail">
        {shown === "permissions" ? (
          <PermissionNote />
        ) : (
          <Readout
            rooms={roomList}
            periods={periodList}
            teams={teamList}
            teamsState={stateOf(teams)}
            tab={shown}
          />
        )}
      </div>
    </AppShell>
  );
}

/** 합주실 서식의 입력칸들. */
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
          placeholder="합주실 A"
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </Cell>
      <Cell label="여는 시각" htmlFor={at("opens")}>
        <input
          type="time"
          step={1800}
          value={form.opens_at}
          id={at("opens")}
          aria-invalid={bad !== ""}
          aria-describedby={bad === "" ? undefined : whyId}
          onChange={(event) => setForm({ ...form, opens_at: event.target.value })}
        />
      </Cell>
      <Cell label="닫는 시각" htmlFor={at("closes")}>
        <input
          type="time"
          step={1800}
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

/** 기간 서식의 입력칸들. 집중 합주기간일 때만 계산 시각 두 칸이 더 나온다. */
function PeriodFields(props: {
  form: Omit<Period, "id">;
  setForm: (next: Omit<Period, "id">) => void;
  at: (field: string) => string;
  bad: string;
  whyId: string;
  first: RefObject<HTMLSelectElement | null>;
}) {
  const { form, setForm, at, bad, whyId, first } = props;
  return (
    <>
      <Cell label="종류" htmlFor={at("kind")}>
        <select
          ref={first}
          id={at("kind")}
          aria-invalid={bad !== ""}
          aria-describedby={bad === "" ? undefined : whyId}
          value={form.kind}
          onChange={(event) =>
            setForm({ ...form, kind: event.target.value as Period["kind"] })
          }
        >
          <option value="focused">집중 합주</option>
          <option value="open">상시 개방</option>
        </select>
      </Cell>
      <Cell label="시작하는 날" htmlFor={at("starts")}>
        <input
          type="date"
          value={form.starts_on}
          id={at("starts")}
          aria-invalid={bad !== ""}
          aria-describedby={bad === "" ? undefined : whyId}
          onChange={(event) => setForm({ ...form, starts_on: event.target.value })}
        />
      </Cell>
      <Cell label="끝나는 날" htmlFor={at("ends")}>
        <input
          type="date"
          value={form.ends_on}
          id={at("ends")}
          aria-invalid={bad !== ""}
          aria-describedby={bad === "" ? undefined : whyId}
          onChange={(event) => setForm({ ...form, ends_on: event.target.value })}
        />
      </Cell>
      {form.kind === "focused" ? (
        <>
          <Cell label="매일 (미연동)" htmlFor={at("everyday")}>
            <input
              id={at("everyday")}
              type="checkbox"
              checked={form.everyday}
              onChange={(event) => setForm({ ...form, everyday: event.target.checked })}
            />
          </Cell>
          <Cell label="첫 계산" htmlFor={at("first")}>
            <input
              id={at("first")}
              type="time"
              value={form.first_run_at}
              onChange={(event) => setForm({ ...form, first_run_at: event.target.value })}
            />
          </Cell>
          <Cell label="두 번째 계산" htmlFor={at("second")}>
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

function RoomCard(props: { rooms: Room[]; state: string; canEdit: boolean; onSaved: () => void }) {
  const { rooms, state, canEdit, onSaved } = props;
  const { editing, open, close, register } = useRowFocus();

  return (
    <Card>
      <div className="sethead">
        <b>합주실</b>
        <span>여닫는 시각은 정시 또는 30분에만 둘 수 있습니다</span>
      </div>

      {state !== "" || rooms.length === 0 ? (
        <CardState state={state} empty="아직 등록된 합주실이 없습니다" />
      ) : (
        <ul className="rows">
          {rooms.map((room) =>
            canEdit && editing === room.id ? (
              <li className="editing" key={room.id}>
                <RoomForm
                  start={room}
                  // 자기 이름은 겹침으로 보지 않는다.
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
              // onEdit 이 없으면 Row 가 고치기 단추를 그리지 않는다 — room_manage 가
              // 없는 사람에게는 목록만 보인다.
              <Row
                key={room.id}
                title={room.name}
                when={<><b>{room.opens_at}</b> 부터 <b>{room.closes_at}</b> 까지</>}
                span={` · 하루 ${openingHours({ rooms: [room], days: 1, teams: 0 }).perDay}`}
                editLabel={canEdit ? `${room.name} 고치기` : undefined}
                buttonRef={canEdit ? register(room.id) : undefined}
                onEdit={canEdit ? () => open(room.id) : undefined}
              />
            ),
          )}
        </ul>
      )}

      {!canEdit ? null : (
        <div className="addrow">
          <RoomForm
            start={BLANK_ROOM}
            taken={rooms.map((room) => room.name)}
            path="/rooms"
            method="POST"
            submit="합주실 추가"
            onDone={onSaved}
          />
        </div>
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      // 새로 만든 뒤에는 다음 것을 넣도록 서식을 비운다. 고치는 중이면 그대로 둔다.
      if (method === "POST") reset();
      onDone();
    },
  });

  const why = checkRoom(form, taken);

  // 같은 화면에 추가 서식과 고치는 줄이 함께 뜬다. 라벨이 어느 입력칸을 가리키는지
  // 흐려지지 않도록 화면 안 식별자를 서식마다 다르게 짓는다.
  const at = (field: string): string => `${path}-${field}`;
  const whyId = at("why");
  const bad = touched && why !== "" ? why : send.error ? reason(send.error) : "";

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

function PeriodCard(props: { periods: Period[]; state: string; canEdit: boolean; onSaved: () => void }) {
  const { periods, state, canEdit, onSaved } = props;
  const { editing, open, close, register } = useRowFocus();

  return (
    <Card>
      <div className="sethead">
        <b>기간</b>
        <span>
          집중 합주기간에만 자동 배정이 돕니다 · 매일은 저장까지만 되고 배정 계산은 아직 이 값을 보지 않습니다
        </span>
      </div>

      {state !== "" || periods.length === 0 ? (
        <CardState state={state} empty="아직 등록된 기간이 없습니다" />
      ) : (
        <ul className="rows">
          {periods.map((period) =>
            canEdit && editing === period.id ? (
              <li className="editing" key={period.id}>
                <PeriodForm
                  start={period}
                  path={`/periods/${period.id}`}
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
              // onEdit 이 없으면 Row 가 고치기 단추를 그리지 않는다 — period_manage 가
              // 없는 사람에게는 목록만 보인다.
              <Row
                key={period.id}
                title={KIND_TEXT[period.kind] + (period.everyday ? " · 매일" : "")}
                when={<><b>{period.starts_on}</b> 부터 <b>{period.ends_on}</b> 까지</>}
                span={periodSpan(period)}
                editLabel={canEdit ? `${period.starts_on} 부터의 기간 고치기` : undefined}
                buttonRef={canEdit ? register(period.id) : undefined}
                onEdit={canEdit ? () => open(period.id) : undefined}
              />
            ),
          )}
        </ul>
      )}

      {!canEdit ? null : (
        <div className="addrow">
          <PeriodForm
            start={BLANK_PERIOD}
            path="/periods"
            method="POST"
            submit="기간 추가"
            onDone={onSaved}
          />
        </div>
      )}
    </Card>
  );
}

function PeriodForm(props: {
  start: Omit<Period, "id">;
  path: string;
  method: "POST" | "PATCH";
  submit: string;
  onCancel?: () => void;
  onDone: () => void;
}) {
  const { start, path, method, submit, onCancel, onDone } = props;
  const [form, setForm, touched, reset] = useForm(start);
  const first = useFirstField<HTMLSelectElement>(onCancel !== undefined);

  const send = useMutation({
    mutationFn: () =>
      getJSON<{ period: Period }>(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      if (method === "POST") reset();
      onDone();
    },
  });

  const why = checkPeriod(form);

  const at = (field: string): string => `${path}-${field}`;
  const whyId = at("why");
  const bad = touched && why !== "" ? why : send.error ? reason(send.error) : "";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (why === "") send.mutate();
      }}
    >
      <div className="fields">
        <PeriodFields form={form} setForm={setForm} at={at} bad={bad} whyId={whyId} first={first} />
        <FormTail submit={submit} pending={send.isPending} blocked={why !== ""}
            bad={bad} whyId={whyId} onCancel={onCancel} />
      </div>
    </form>
  );
}

/** 팀 목록이 성하면 팀 수와 소속 인원 수를, 아니면 왜 셀 수 없는지 돌려준다. */
function teamLine(teams: Team[], state: string): string {
  if (state === "loading") return "팀 목록을 불러오는 중…";
  if (state !== "") return state;
  const members = teams.reduce((sum, team) => sum + team.member_count, 0);
  return `팀 ${teams.length}개 · 소속 인원 ${members}명`;
}

/** 지금 설정이면 실제로 얼마가 열리는지. 집중기간은 모든 팀이 같은 몫을 가져야 한다. */
function Readout(props: {
  rooms: Room[];
  periods: Period[];
  teams: Team[];
  teamsState: string;
  tab: Tab;
}) {
  const { rooms, periods, teams, teamsState, tab } = props;

  // 집중기간이 여럿이면 첫 것만 센다. 어느 기간인지는 아래 날짜로 밝히므로 사람이
  // 헷갈리지는 않는다. 여러 개를 견주는 것은 고를 자리를 만든 뒤에 한다.
  const focused = periods.filter((period) => period.kind === "focused");
  const period = tab === "periods" ? focused[0] : undefined;
  const days = period ? daysBetween(period.starts_on, period.ends_on) : 1;
  // 팀 수는 팀 목록 통로가 준다. 아직 못 받았으면 0 이고, 그러면 팀당 몫을 나누지 않는다.
  const count = teams.length;
  const sum = openingHours({ rooms, days, teams: count });

  return (
    <Panel title="이 설정이면" hint={period ? `${days}일 기준` : "하루 기준"}>
      <div className="read">
        <div className="big">
          {sum.total}
          <small>
            {period
              ? `${period.starts_on} – ${period.ends_on} 동안 열리는 시간`
              : `합주실 ${rooms.length}곳이 하루에 여는 시간`}
          </small>
        </div>

        <dl>
          <dt>하루</dt>
          <dd>{sum.perDay}</dd>
          {count > 0 ? (
            <>
              <dt>팀 하나당</dt>
              <dd>{sum.perTeam}</dd>
              <dt>고르게 나누고 남는 것</dt>
              <dd className="left">{sum.leftover}</dd>
            </>
          ) : null}
        </dl>

        <div className="teams">{teamLine(teams, teamsState)}</div>

        <p className="note">
          {count > 0
            ? "집중 합주기간에는 모든 팀이 정확히 같은 몫을 갖습니다. 한 팀이라도 채우지 못하면 배정 전체가 실패로 넘어갑니다."
            : "셀 팀이 없어 팀마다 얼마씩 돌아가는지는 계산하지 않습니다."}
        </p>
      </div>
    </Panel>
  );
}
