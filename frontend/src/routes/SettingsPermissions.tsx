// 설정 화면의 권한 구역. 권한을 만들고·수정하고·삭제하고, 사람에게 주고 뺀다.
// permission_grant 를 가진 사람에게만 그려진다(부르는 자리는 Settings.tsx 가 가린다).

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useMe } from "../components/hooks";
import { PERMISSION_ITEMS, permissionLabels, permissionSetNameMessage } from "../lib/account";
import { getJSON, peopleOf } from "../lib/pipeline";
import type { Person } from "../lib/pipeline";
import type { Member, Permission, PermissionSet } from "../lib/contract";
import { Card } from "../components/AppShell";
import { Cell, CardState, FormTail, Row, reason, useFirstField, useForm, useRowFocus } from "./SettingsForm";

const SETS_KEY = ["permission-sets"];

type SetDraft = { name: string; permissions: Permission[] };

const BLANK_SET: SetDraft = { name: "", permissions: [] };

/** 팀 명단을 모두 받아 사람 목록 하나로 편다. 질의 이름은 다른 화면이 쓰는 것과 같아,
 *  이미 받아 둔 명단이 있으면 다시 부르지 않는다. */
function usePeople(): Person[] {
  const { teams } = useMe();
  const rosters = useQueries({
    queries: teams.map((team) => ({
      queryKey: ["members", team.id],
      queryFn: () => getJSON<{ members: Member[] }>(`/teams/${team.id}/members`),
    })),
  });
  return peopleOf(teams, rosters.map((query) => query.data?.members));
}

export function PermissionCard({ onSay }: { onSay: (message: string) => void }) {
  const client = useQueryClient();
  const { editing, open, close, register } = useRowFocus();
  const people = usePeople();

  const sets = useQuery({
    queryKey: SETS_KEY,
    queryFn: () => getJSON<{ permission_sets: PermissionSet[] }>("/permission-sets"),
  });
  const list = sets.data?.permission_sets ?? [];
  const state = sets.isPending ? "loading" : sets.isError ? reason(sets.error) : "";

  // 저장이 끝나면 목록을 다시 받아온다. 화면이 스스로 값을 지어내지 않게 한다.
  // 내 계정도 함께 다시 받는다 — 고친 권한이 내 것이면 내가 가진 항목이 이미 바뀌었고,
  // 낡은 값을 들고 있으면 잃은 단추가 화면에 남는다.
  function saved(text: string): void {
    void client.invalidateQueries({ queryKey: SETS_KEY });
    void client.invalidateQueries({ queryKey: ["me"] });
    onSay(text);
  }

  return (
    <Card>
      <div className="sethead">
        <b>권한</b>
        <span>켜고 싶은 것만 켜서 권한을 만들고, 그 권한을 사람에게 줍니다</span>
      </div>

      {state !== "" || list.length === 0 ? (
        <CardState state={state} empty="아직 만든 권한이 없습니다" />
      ) : (
        <ul className="rows">
          {list.map((set) =>
            editing === set.id ? (
              <li className="editing" key={set.id}>
                <SetForm
                  start={{ name: set.name, permissions: set.permissions }}
                  // 자기 이름은 겹침으로 보지 않는다.
                  taken={list.filter((other) => other.id !== set.id).map((other) => other.name)}
                  path={`/permission-sets/${set.id}`}
                  method="PATCH"
                  submit="저장"
                  onCancel={close}
                  onDone={() => {
                    close();
                    saved("권한을 저장했습니다");
                  }}
                />
                <Holders set={set} people={people} onDone={saved} />
              </li>
            ) : (
              <Row
                key={set.id}
                title={set.name}
                when={itemsLine(set.permissions)}
                span={` · ${set.member_ids.length}명`}
                editLabel={`${set.name} 수정`}
                buttonRef={register(set.id)}
                onEdit={() => open(set.id)}
                extra={<DeleteButton set={set} onDone={saved} />}
              />
            ),
          )}
        </ul>
      )}

      <div className="addrow">
        <SetForm
          start={BLANK_SET}
          taken={list.map((set) => set.name)}
          path="/permission-sets"
          method="POST"
          submit="새 권한 추가"
          onDone={() => saved("권한을 만들었습니다")}
        />
      </div>
    </Card>
  );
}

/** 켜진 항목을 한국어로 이어 붙인다. 하나도 없으면 그렇다고 말한다. */
function itemsLine(permissions: Permission[]): string {
  const labels = permissionLabels(permissions);
  return labels.length === 0 ? "켜진 항목이 없습니다" : labels.join(" · ");
}

function DeleteButton({ set, onDone }: { set: PermissionSet; onDone: (text: string) => void }) {
  const send = useMutation({
    mutationFn: () => getJSON<null>(`/permission-sets/${set.id}`, { method: "DELETE" }),
    onSuccess: () => onDone("권한을 삭제했습니다"),
    onError: (error) => onDone(reason(error)),
  });

  // 삭제하면 이 권한을 가졌던 사람도 그 권한을 잃는다. 무를 수 없어 한 번 되묻는다.
  return (
    <button
      className="btn"
      disabled={send.isPending}
      aria-label={`${set.name} 삭제`}
      onClick={() => {
        const holders = set.member_ids.length;
        const warn = holders === 0 ? "" : ` 이 권한을 가진 ${holders}명이 그것을 잃습니다.`;
        if (window.confirm(`${set.name} 권한을 삭제합니다.${warn} 삭제할까요?`)) send.mutate();
      }}
    >
      {send.isPending ? "삭제하는 중…" : "삭제"}
    </button>
  );
}

/** 이름 한 칸과 항목마다 토글 한 개. 만들기와 수정이 같은 것을 쓰고 주소만 갈아 끼운다. */
function SetForm(props: {
  start: SetDraft;
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
      getJSON<{ permission_set: PermissionSet }>(path, {
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

  const why = permissionSetNameMessage(form.name, taken);

  // 같은 화면에 추가 서식과 고치는 줄이 함께 뜬다. 라벨이 어느 입력칸을 가리키는지
  // 흐려지지 않도록 화면 안 식별자를 서식마다 다르게 짓는다.
  const at = (field: string): string => `${path}-${field}`;
  const whyId = at("why");
  const bad = touched && why !== "" ? why : send.error ? reason(send.error) : "";

  function toggle(key: Permission, on: boolean): void {
    // 켜진 목록을 새로 만들어 넣는다 — 들고 있던 배열을 고치지 않는다.
    const kept = form.permissions.filter((item) => item !== key);
    setForm({ ...form, permissions: on ? [...kept, key] : kept });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (why === "") send.mutate();
      }}
    >
      <div className="fields">
        <Cell label="권한 이름" wide htmlFor={at("name")}>
          <input
            ref={first}
            value={form.name}
            id={at("name")}
            aria-invalid={bad !== ""}
            aria-describedby={bad === "" ? undefined : whyId}
            placeholder="합주실 담당"
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Cell>
      </div>

      {/* 한 줄에 항목 하나. 무엇을 켜는 것인지가 이름만으로는 안 읽혀 설명을 함께 둔다. */}
      <ul className="switches">
        {PERMISSION_ITEMS.map((item) => (
          <li key={item.key}>
            <label htmlFor={at(item.key)}>
              <b>{item.label}</b>
              <small>{item.note}</small>
            </label>
            <input
              className="sw"
              id={at(item.key)}
              type="checkbox"
              role="switch"
              checked={form.permissions.includes(item.key)}
              onChange={(event) => toggle(item.key, event.target.checked)}
            />
          </li>
        ))}
      </ul>

      <div className="fields">
        <FormTail submit={submit} pending={send.isPending} blocked={why !== ""}
            bad={bad} whyId={whyId} onCancel={onCancel} />
      </div>
    </form>
  );
}

/** 이 권한을 가진 사람들. 빼는 단추와, 새로 줄 사람을 고르는 칸이 함께 있다. */
function Holders(props: {
  set: PermissionSet;
  people: Person[];
  onDone: (text: string) => void;
}) {
  const { set, people, onDone } = props;
  const [chosen, setChosen] = useState<number | null>(null);

  const grant = useMutation({
    mutationFn: (memberId: number) =>
      getJSON<null>(`/members/${memberId}/permission-sets/${set.id}`, { method: "POST" }),
    onSuccess: () => {
      setChosen(null);
      onDone("권한을 주었습니다");
    },
    onError: (error) => onDone(reason(error)),
  });

  const revoke = useMutation({
    mutationFn: (memberId: number) =>
      getJSON<null>(`/members/${memberId}/permission-sets/${set.id}`, { method: "DELETE" }),
    onSuccess: () => onDone("권한을 뺐습니다"),
    onError: (error) => onDone(reason(error)),
  });

  // 이미 가진 사람은 고르는 칸에 두지 않는다 — 서버가 조용히 넘기는 요청을 보낼 이유가 없다.
  const holding = new Set(set.member_ids);
  const rest = people.filter((person) => !holding.has(person.id));
  const busy = grant.isPending || revoke.isPending;

  return (
    <>
      {/* 가진 사람이 여럿이면 줄이 넘친다. 줄바꿈이 되는 .fields 를 쓴다. */}
      <div className="fields">
        {set.member_ids.length === 0 ? (
          <span className="span">아직 이 권한을 가진 사람이 없습니다</span>
        ) : (
          set.member_ids.map((memberId) => {
            const person = people.find((one) => one.id === memberId);
            return (
              <button
                key={memberId}
                className="btn"
                type="button"
                disabled={busy}
                // 명단에서 못 찾는 사람은 어느 팀에도 속하지 않은 사람이다. 이름을
                // 지어내지 않고 그렇다고 말한다.
                aria-label={`${person?.name ?? "팀에 속하지 않은 사람"} 에게서 ${set.name} 떼기`}
                onClick={() => revoke.mutate(memberId)}
              >
                {person === undefined
                  ? "팀에 속하지 않은 사람 ✕"
                  : `${person.name} (${person.where}) ✕`}
              </button>
            );
          })
        )}
      </div>

      <div className="fields">
        <Cell label="사람에게 붙이기" wide htmlFor={`grant-${set.id}`}>
          <select
            id={`grant-${set.id}`}
            value={chosen ?? ""}
            onChange={(event) =>
              setChosen(event.target.value === "" ? null : Number(event.target.value))
            }
          >
            <option value="">고르세요</option>
            {rest.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} — {person.where}
              </option>
            ))}
          </select>
        </Cell>
        <div className="acts">
          <button
            className="btn go"
            type="button"
            disabled={chosen === null || busy}
            onClick={() => {
              if (chosen !== null) grant.mutate(chosen);
            }}
          >
            {grant.isPending ? "붙이는 중…" : "붙이기"}
          </button>
        </div>
      </div>
    </>
  );
}
