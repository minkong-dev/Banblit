// 설정 화면의 권한 구역. 권한을 만들고·수정하고·삭제하고, 사람에게 주고 뺀다.
// permission_manage 나 permission_grant 를 가진 사람에게만 그려진다(부르는 자리는
// Settings.tsx 가 가린다). 만들고 고치는 것과 사람에게 주는 것은 항목이 갈린다.

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useMe } from "../components/hooks";
import { PERMISSION_ITEMS, permissionLabels, permissionSetNameMessage } from "../lib/account";
import { getJSON, peopleOf } from "../lib/pipeline";
import type { Person } from "../lib/pipeline";
import type { Member, Permission, PermissionSet } from "../lib/contract";
import { Card } from "../components/AppShell";
import { Modal } from "../components/Modal";
import { PlusIcon, TrashIcon } from "../components/icons";
import { MemberSearch } from "../components/MemberSearch";
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
  const [making, setMaking] = useState(false);
  const [granting, setGranting] = useState<PermissionSet | null>(null);

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
                before={
                  <button
                    className="ic"
                    aria-label={`${set.name} 멤버 추가`}
                    onClick={() => setGranting(set)}
                  >
                    <PlusIcon />
                  </button>
                }
                extra={<DeleteButton set={set} onDone={saved} />}
              />
            ),
          )}
        </ul>
      )}

      <div className="listfoot">
        <button className="new" onClick={() => setMaking(true)}>+ 새 권한</button>
      </div>

      {granting === null ? null : (
        <GrantModal
          set={list.find((one) => one.id === granting.id) ?? granting}
          people={people}
          onClose={() => setGranting(null)}
          onDone={saved}
        />
      )}

      {!making ? null : (
        <Modal title="새 권한" hint="켜고 싶은 것만 켜서 권한을 만듭니다"
          onClose={() => setMaking(false)}>
          <SetForm
            start={BLANK_SET}
            taken={list.map((set) => set.name)}
            path="/permission-sets"
            method="POST"
            submit="권한 추가"
            onCancel={() => setMaking(false)}
            onDone={() => { setMaking(false); saved("권한을 만들었습니다"); }}
          />
        </Modal>
      )}
    </Card>
  );
}

/** 권한을 사람에게 주고 뺀다. 지금 가진 사람이 먼저 서고, 그 아래에서 이름으로 찾아 더한다. */
function GrantModal(props: {
  set: PermissionSet;
  people: Person[];
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const { set, people, onClose, onDone } = props;
  const client = useQueryClient();

  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: SETS_KEY });
    void client.invalidateQueries({ queryKey: ["me"] });
  };

  const grant = useMutation({
    mutationFn: (memberId: number) =>
      getJSON<null>(`/members/${memberId}/permission-sets/${set.id}`, { method: "POST" }),
    onSuccess: () => { refresh(); onDone("권한을 주었습니다"); },
    onError: (error) => onDone(reason(error)),
  });

  const revoke = useMutation({
    mutationFn: (memberId: number) =>
      getJSON<null>(`/members/${memberId}/permission-sets/${set.id}`, { method: "DELETE" }),
    onSuccess: () => { refresh(); onDone("권한을 뺐습니다"); },
    onError: (error) => onDone(reason(error)),
  });

  const busy = grant.isPending || revoke.isPending;

  return (
    <Modal title={set.name} hint="이 권한을 가진 사람" onClose={onClose}>
      <ul className="lineup">
        {set.member_ids.length === 0 ? (
          <li className="empty">아직 이 권한을 가진 사람이 없습니다</li>
        ) : (
          set.member_ids.map((memberId) => {
            // 명단에서 못 찾는 사람은 어느 팀에도 속하지 않은 사람이다. 이름을
            // 지어내지 않고 그렇다고 말한다.
            const person = people.find((one) => one.id === memberId);
            return (
              <li className="seat" key={memberId}>
                <span className="who">{person?.name ?? "팀에 속하지 않은 사람"}</span>
                <span className="acts">
                  <button
                    className="ic danger"
                    disabled={busy}
                    aria-label={`${person?.name ?? "이 사람"} 에게서 권한 빼기`}
                    onClick={() => revoke.mutate(memberId)}
                  >
                    <TrashIcon />
                  </button>
                </span>
              </li>
            );
          })
        )}
      </ul>

      <p className="cap2">멤버 추가</p>
      <MemberSearch
        exclude={set.member_ids}
        onPick={(member) => grant.mutate(member.id)}
      />
    </Modal>
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
      className="ic danger"
      disabled={send.isPending}
      aria-label={`${set.name} 삭제`}
      onClick={() => {
        const holders = set.member_ids.length;
        const warn = holders === 0 ? "" : ` 이 권한을 가진 ${holders}명이 그것을 잃습니다.`;
        if (window.confirm(`${set.name} 권한을 삭제합니다.${warn} 삭제할까요?`)) send.mutate();
      }}
    >
      <TrashIcon />
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
