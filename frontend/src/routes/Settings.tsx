import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

import { AppShell, Card, Panel, Tabs } from "../components/AppShell";
import { getJSON } from "../lib/api";
import { checkPeriod, checkRoom, daysBetween, openingHours } from "../lib/pipeline";
import { useToast } from "../components/hooks";
import "../styles/settings.css";
import type { Period, Room } from "../lib/contract";


type Tab = "rooms" | "periods";

const TABS = [
  { key: "rooms" as const, text: "합주실" },
  { key: "periods" as const, text: "기간" },
];

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

function reason(error: unknown): string {
  return error instanceof Error ? error.message : "저장하지 못했습니다";
}

/** 고치기/취소로 줄이 통째로 갈릴 때 초점이 사라지지 않게, 눌렀던 단추를 기억해 둔다. */
function useRowFocus(): {
  editing: number | null;
  open: (id: number) => void;
  close: () => void;
  register: (id: number) => (el: HTMLButtonElement | null) => void;
} {
  const [editing, setEditing] = useState<number | null>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  // 되돌아갈 곳은 화면에 그려지는 값이 아니므로 state 로 들지 않는다. state 로 들면
  // 초점을 옮긴 뒤 그것을 비우려고 다시 그리게 된다.
  const back = useRef<number | null>(null);

  // 단추는 편집을 떠나며 다시 그려진다. 그려진 뒤에 초점을 옮겨야 잡힌다.
  useEffect(() => {
    if (editing !== null || back.current === null) return;
    buttons.current.get(back.current)?.focus();
    back.current = null;
  }, [editing]);

  return {
    editing,
    open: (id) => setEditing(id),
    close: () => {
      back.current = editing;
      setEditing(null);
    },
    register: (id) => (el) => {
      if (el === null) buttons.current.delete(id);
      else buttons.current.set(id, el);
    },
  };
}

/** 고치기로 들어온 서식의 첫 칸에 초점을 옮긴다. autoFocus 는 이 화면에서 걸리지
 *  않아 직접 옮긴다. 추가 서식(editing 이 아닌 것)에는 걸지 않는다 — 화면을 열자마자
 *  아래쪽 서식으로 끌려가면 안 된다. */
function useFirstField<T extends HTMLElement>(editing: boolean): RefObject<T | null> {
  const first = useRef<T>(null);
  useEffect(() => {
    if (editing) first.current?.focus();
  }, [editing]);
  return first;
}

/** 서식 한 벌의 상태. 사람이 손대기 전에는 빨간 사유를 띄우지 않으려고 touched 를 함께 든다. */
function useForm<T>(start: T): [T, (next: T) => void, boolean, () => void] {
  const [value, write] = useState(start);
  const [touched, setTouched] = useState(false);
  const set = (next: T): void => {
    setTouched(true);
    write(next);
  };
  const reset = (): void => {
    setTouched(false);
    write(start);
  };
  return [value, set, touched, reset];
}

/** 서식 한 칸. 계정 화면의 Field 는 그쪽 CSS 에 묶여 있어 여기서는 쓰지 않는다. */
function Cell(props: { label: string; htmlFor: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={props.wide ? "wide" : undefined} htmlFor={props.htmlFor}>
      {props.label}
      {props.children}
    </label>
  );
}

function CardState({ state, empty }: { state: string; empty: string }) {
  // 비어 있는 것과 고장 난 것을 구분해서 말한다.
  if (state === "loading") return <div className="empty">불러오는 중…</div>;
  return <div className="empty">{state === "" ? empty : state}</div>;
}

export function Settings() {
  const [tab, setTab] = useState<Tab>("rooms");
  const { message, say } = useToast();
  const client = useQueryClient();

  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: () => getJSON<{ rooms: Room[] }>("/rooms"),
  });
  const periods = useQuery({
    queryKey: ["periods"],
    queryFn: () => getJSON<{ periods: Period[] }>("/periods"),
  });

  const roomList = rooms.data?.rooms ?? [];
  const periodList = periods.data?.periods ?? [];

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
          <span className="face" aria-hidden="true">박서</span>
          <span className="nm">박서연</span>
          <span className="role">헤드매니저</span>
        </button>
      }
    >
      <Tabs label="설정" items={TABS} selected={tab} onSelect={setTab} />

      <div className="main">
        {tab === "rooms" ? (
          <RoomCard
            rooms={roomList}
            state={stateOf(rooms)}
            onSaved={saved("rooms", "합주실을 저장했습니다")}
          />
        ) : (
          <PeriodCard
            periods={periodList}
            state={stateOf(periods)}
            onSaved={saved("periods", "기간을 저장했습니다")}
          />
        )}
      </div>

      <div className="rail">
        <Readout rooms={roomList} periods={periodList} tab={tab} />
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

/** 목록 한 줄 — 보고 있는 상태. 고치는 중이면 카드가 서식을 대신 그린다. */
function Row(props: {
  title: string;
  when: ReactNode;
  span: string;
  editLabel: string;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onEdit: () => void;
}) {
  const { title, when, span, editLabel, buttonRef, onEdit } = props;
  return (
    <li>
      <div>
        <div className="nm">{title}</div>
        <div className="when">
          {when}
          <span className="span">{span}</span>
        </div>
      </div>
      <div className="acts">
        <button className="btn" ref={buttonRef} aria-label={editLabel} onClick={onEdit}>
          고치기
        </button>
      </div>
    </li>
  );
}

/** 서식 꼬리 — 취소·저장 단추와 사유. 두 서식이 같은 것을 쓴다. */
function FormTail(props: {
  submit: string;
  pending: boolean;
  blocked: boolean;
  bad: string;
  whyId: string;
  onCancel?: () => void;
}) {
  const { submit, pending, blocked, bad, whyId, onCancel } = props;
  return (
    <>
      <div className="acts">
        {onCancel === undefined ? null : (
          <button className="btn" type="button" onClick={onCancel}>취소</button>
        )}
        <button className="btn go" type="submit" disabled={blocked || pending}>
          {pending ? "저장하는 중…" : submit}
        </button>
      </div>
      {/* role="alert" 이라야 화면을 보지 않는 사람에게도 사유가 전해진다. */}
      {bad === "" ? null : <p className="why" id={whyId} role="alert">{bad}</p>}
    </>
  );
}

function RoomCard(props: { rooms: Room[]; state: string; onSaved: () => void }) {
  const { rooms, state, onSaved } = props;
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
            editing === room.id ? (
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
              <Row
                key={room.id}
                title={room.name}
                when={<><b>{room.opens_at}</b> 부터 <b>{room.closes_at}</b> 까지</>}
                span={` · 하루 ${openingHours({ rooms: [room], days: 1, teams: 0 }).perDay}`}
                editLabel={`${room.name} 고치기`}
                buttonRef={register(room.id)}
                onEdit={() => open(room.id)}
              />
            ),
          )}
        </ul>
      )}

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

function PeriodCard(props: { periods: Period[]; state: string; onSaved: () => void }) {
  const { periods, state, onSaved } = props;
  const { editing, open, close, register } = useRowFocus();

  return (
    <Card>
      <div className="sethead">
        <b>기간</b>
        <span>집중 합주기간에만 자동 배정이 돕니다</span>
      </div>

      {state !== "" || periods.length === 0 ? (
        <CardState state={state} empty="아직 등록된 기간이 없습니다" />
      ) : (
        <ul className="rows">
          {periods.map((period) =>
            editing === period.id ? (
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
              <Row
                key={period.id}
                title={KIND_TEXT[period.kind] + (period.everyday ? " · 매일" : "")}
                when={<><b>{period.starts_on}</b> 부터 <b>{period.ends_on}</b> 까지</>}
                span={
                  ` · ${daysBetween(period.starts_on, period.ends_on)}일` +
                  (period.kind === "focused"
                    ? ` · 계산 ${period.first_run_at} · ${period.second_run_at}`
                    : "")
                }
                editLabel={`${period.starts_on} 부터의 기간 고치기`}
                buttonRef={register(period.id)}
                onEdit={() => open(period.id)}
              />
            ),
          )}
        </ul>
      )}

      <div className="addrow">
        <PeriodForm
          start={BLANK_PERIOD}
          path="/periods"
          method="POST"
          submit="기간 추가"
          onDone={onSaved}
        />
      </div>
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

/** 지금 설정이면 실제로 얼마가 열리는지. 집중기간은 모든 팀이 같은 몫을 가져야 한다. */
function Readout(props: { rooms: Room[]; periods: Period[]; tab: Tab }) {
  const { rooms, periods, tab } = props;
  // 명단 API 가 없어 팀 수를 알 수 없다. 헤드매니저가 직접 넣어 견주게 한다.
  const [teams, setTeams] = useState("");

  // 집중기간이 여럿이면 첫 것만 센다. 어느 기간인지는 아래 날짜로 밝히므로 사람이
  // 헷갈리지는 않는다. 여러 개를 견주는 것은 고를 자리를 만든 뒤에 한다.
  const focused = periods.filter((period) => period.kind === "focused");
  const period = tab === "periods" ? focused[0] : undefined;
  const days = period ? daysBetween(period.starts_on, period.ends_on) : 1;
  const count = Math.max(0, Math.floor(Number(teams) || 0));
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

        <div className="teams">
          <label htmlFor="teamCount">팀 수</label>
          <input
            id="teamCount"
            type="number"
            min={0}
            value={teams}
            placeholder="6"
            onChange={(event) => setTeams(event.target.value)}
          />
        </div>

        <p className="note">
          {count > 0
            ? "집중 합주기간에는 모든 팀이 정확히 같은 몫을 갖습니다. 한 팀이라도 채우지 못하면 배정 전체가 실패로 넘어갑니다."
            : "팀 수를 넣으면 팀마다 얼마씩 돌아가는지 계산합니다. 명단 API 가 아직 없어 직접 넣습니다."}
        </p>
      </div>
    </Panel>
  );
}
