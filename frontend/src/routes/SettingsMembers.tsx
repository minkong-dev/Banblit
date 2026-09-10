// 설정 화면의 멤버 구역. 카드 두 장이 세로로 선다.
//
// 위 — 권한 묶음. 정사각형 카드가 가로로 늘어서고, 한 화면에 다 안 들어가면 ‹ › 로 넘긴다.
// 아래 — 가입한 모든 사람. 권한으로 걸러 보고, 아래로 내리면 이어 받는다.

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { Card } from "../components/AppShell";
import { Modal } from "../components/Modal";
import { MemberSearch } from "../components/MemberSearch";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { getJSON, reason } from "../lib/api";
import { say } from "../lib/toast";
import { PERMISSION_ITEMS } from "../lib/account";
import { askDelete } from "../lib/confirm";
import type { MemberRow, Permission, PermissionSet } from "../lib/contract";

const SETS_KEY = ["permission-sets"];
const MEMBERS_KEY = ["member-roster"];
/** 한 번에 받아 오는 사람 수. 아래로 내리면 이만큼씩 이어 받는다. */
const PAGE = 50;


type Draft = { name: string; description: string; permissions: Permission[] };

const BLANK: Draft = { name: "", description: "", permissions: [] };

/** 권한 하나를 만들거나 고치는 모달. 설명은 반드시 적는다 — 항목 목록만으로는
 *  "왜 이 묶음이 있는가" 가 남지 않는다. */
function SetForm(props: {
  start: Draft;
  taken: string[];
  path: string;
  method: "POST" | "PATCH";
  title: string;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const { start, taken, path, method, title, onClose, onDone } = props;
  const client = useQueryClient();
  const [form, setForm] = useState(start);
  const [bad, setBad] = useState("");

  const send = useMutation({
    mutationFn: () =>
      getJSON<{ permission_set: PermissionSet }>(path, {
        method,
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: SETS_KEY });
      void client.invalidateQueries({ queryKey: MEMBERS_KEY });
      void client.invalidateQueries({ queryKey: ["me"] });
      onDone(method === "POST" ? "권한을 생성했어요." : "권한을 저장했어요.");
    },
    onError: (error) => setBad(reason(error)),
  });

  const toggle = (key: Permission, on: boolean): void =>
    setForm({
      ...form,
      permissions: on
        ? [...form.permissions, key]
        : form.permissions.filter((one) => one !== key),
    });

  return (
    <Modal title={title} hint="부여할 권한을 설정해 커스텀 권한을 만들 수 있어요." onClose={onClose}
      foot={
        <>
          <button className="ghost" onClick={onClose}>취소</button>
          <button
            className="primary"
            disabled={send.isPending}
            onClick={() => {
              const clash = taken.some((other) => other.trim() === form.name.trim());
              const why =
                form.name.trim() === ""
                  ? "권한 이름을 입력해 주세요."
                  : clash
                    ? "이미 같은 이름을 가진 권한이 있어요."
                    : form.description.trim() === ""
                      ? "이 권한에 대한 설명을 작성해주세요."
                      : "";
              setBad(why);
              if (why === "") send.mutate();
            }}
          >
            {send.isPending ? "저장하는 중…" : "저장"}
          </button>
        </>
      }
    >
      <div className="fields">
        <label className="wide" htmlFor="setName">
          권한 이름
          <input
            id="setName"
            autoFocus
            value={form.name}
            placeholder="권한 이름"
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label className="wide" htmlFor="setNote">
          설명
          <input
            id="setNote"
            value={form.description}
            placeholder="권한 설명"
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </label>
      </div>

      <ul className="switches">
        {PERMISSION_ITEMS.map((item) => (
          <li key={item.key}>
            <label htmlFor={`sw-${item.key}`}>
              <b>{item.label}</b>
              <small>{item.note}</small>
            </label>
            <input
              className="sw"
              id={`sw-${item.key}`}
              type="checkbox"
              role="switch"
              checked={form.permissions.includes(item.key)}
              onChange={(event) => toggle(item.key, event.target.checked)}
            />
          </li>
        ))}
      </ul>
      {bad === "" ? null : <p className="why" role="alert">{bad}</p>}
    </Modal>
  );
}

/** 권한을 사람에게 주고 뺀다. */
function GrantModal(props: {
  set: PermissionSet;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const { set, onClose, onDone } = props;
  const client = useQueryClient();

  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: SETS_KEY });
    void client.invalidateQueries({ queryKey: MEMBERS_KEY });
    void client.invalidateQueries({ queryKey: ["me"] });
  };

  const grant = useMutation({
    mutationFn: (memberId: number) =>
      getJSON<null>(`/members/${memberId}/permission-sets/${set.id}`, { method: "POST" }),
    onSuccess: () => { refresh(); onDone("권한을 부여했어요"); },
    onError: (error) => onDone(reason(error)),
  });

  const revoke = useMutation({
    mutationFn: (memberId: number) =>
      getJSON<null>(`/members/${memberId}/permission-sets/${set.id}`, { method: "DELETE" }),
    onSuccess: () => { refresh(); onDone("권한을 제거했어요"); },
    onError: (error) => onDone(reason(error)),
  });

  const busy = grant.isPending || revoke.isPending;

  return (
    <Modal title={set.name} hint="해당 권한을 가진 멤버" onClose={onClose}>
      <ul className="lineup">
        {set.members.length === 0 ? (
          <li className="empty">아직 해당 권한을 가진 멤버가 없어요</li>
        ) : (
          set.members.map((person) => (
            <li className="seat" key={person.id}>
              <span className="who">{person.name}</span>
              <span className="acts">
                <button
                  className="ic danger"
                  disabled={busy}
                  aria-label={`${person.name} 에게서 권한 제거하기`}
                  onClick={() => revoke.mutate(person.id)}
                >
                  <TrashIcon />
                </button>
              </span>
            </li>
          ))
        )}
      </ul>

      <p className="cap2">멤버 추가</p>
      <MemberSearch
        exclude={set.members.map((person) => person.id)}
        onPick={(one) => grant.mutate(one.id)}
      />
    </Modal>
  );
}

/** 권한 카드 한 장. 정사각형이고 이름·인원·설명이 들어간다. */
function SetTile(props: {
  set: PermissionSet;
  onGrant: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { set, onGrant, onEdit, onDelete } = props;
  return (
    <li className="tile">
      <div className="tilehead">
        <b>{set.name}</b>
        <span>{set.members.length}명</span>
      </div>
      <p className="tilenote">{set.description || "권한 설명을 작성해주세요"}</p>
      <div className="tileacts">
        <button className="ic" aria-label={`${set.name} 멤버 추가`} onClick={onGrant}>
          <PlusIcon />
        </button>
        <button className="ic" aria-label={`${set.name} 수정`} onClick={onEdit}>
          <PencilIcon />
        </button>
        <button className="ic danger" aria-label={`${set.name} 삭제`} onClick={onDelete}>
          <TrashIcon />
        </button>
      </div>
    </li>
  );
}

/** 권한 카드 줄. 가로로 늘어서고, 한 화면에 다 안 들어가면 ‹ › 로 넘긴다. */
function SetRail() {
  const client = useQueryClient();
  const track = useRef<HTMLUListElement | null>(null);
  const [making, setMaking] = useState(false);
  const [editing, setEditing] = useState<PermissionSet | null>(null);
  const [granting, setGranting] = useState<PermissionSet | null>(null);

  const sets = useQuery({
    queryKey: SETS_KEY,
    queryFn: () => getJSON<{ permission_sets: PermissionSet[] }>("/permission-sets"),
  });
  const list = sets.data?.permission_sets ?? [];

  const saved = (text: string): void => {
    void client.invalidateQueries({ queryKey: SETS_KEY });
    void client.invalidateQueries({ queryKey: MEMBERS_KEY });
    say(text);
  };

  const drop = useMutation({
    mutationFn: (set: PermissionSet) =>
      getJSON<null>(`/permission-sets/${set.id}`, { method: "DELETE" }),
    onSuccess: () => saved("권한을 삭제했습니다"),
    onError: (error) => say(reason(error)),
  });

  // 한 번에 카드 하나 폭만큼 민다. 창 폭이 바뀌어도 카드를 재서 쓴다.
  const slide = (way: 1 | -1): void => {
    const box = track.current;
    if (box === null) return;
    const step = box.querySelector("li")?.getBoundingClientRect().width ?? 240;
    box.scrollBy({ left: way * (step + 12), behavior: "smooth" });
  };

  return (
    <Card>
      <div className="sethead">
        <b>권한</b>
        <span>부여할 권한을 설정해 커스텀 권한을 만들 수 있어요</span>
        <span className="railnav">
          <button className="ic" aria-label="이전 권한" onClick={() => slide(-1)}>
            <ChevronLeftIcon />
          </button>
          <button className="ic" aria-label="다음 권한" onClick={() => slide(1)}>
            <ChevronRightIcon />
          </button>
        </span>
      </div>

      <ul className="tiles" ref={track}>
        {list.map((set) => (
          <SetTile
            key={set.id}
            set={set}
            onGrant={() => setGranting(set)}
            onEdit={() => setEditing(set)}
            onDelete={() => { if (askDelete(set.name)) drop.mutate(set); }}
          />
        ))}
        <li className="tile add">
          <button onClick={() => setMaking(true)}>+ 새 권한</button>
        </li>
      </ul>

      {!making ? null : (
        <SetForm
          start={BLANK}
          taken={list.map((set) => set.name)}
          path="/permission-sets"
          method="POST"
          title="새 권한"
          onClose={() => setMaking(false)}
          onDone={(text) => { setMaking(false); saved(text); }}
        />
      )}
      {editing === null ? null : (
        <SetForm
          start={{
            name: editing.name,
            description: editing.description,
            permissions: editing.permissions,
          }}
          taken={list.filter((one) => one.id !== editing.id).map((one) => one.name)}
          path={`/permission-sets/${editing.id}`}
          method="PATCH"
          title="권한 수정"
          onClose={() => setEditing(null)}
          onDone={(text) => { setEditing(null); saved(text); }}
        />
      )}
      {granting === null ? null : (
        <GrantModal
          set={list.find((one) => one.id === granting.id) ?? granting}
          onClose={() => setGranting(null)}
          onDone={saved}
        />
      )}
    </Card>
  );
}

/** 가입한 모든 사람. 아래로 내리면 이어 받는다. */
function MemberRoster(props: {
  rows: MemberRow[];
  done: boolean;
  onMore: () => unknown;
  sets: string[];
}) {
  const { rows, done, onMore, sets } = props;
  const [filter, setFilter] = useState("");
  const foot = useRef<HTMLDivElement | null>(null);

  // 목록 바닥이 화면에 들어오면 다음 쪽을 부른다. 스크롤 위치를 직접 재지 않는 것은,
  // 줄 높이나 카드 높이가 바뀌어도 이 방식은 그대로 맞기 때문이다.
  useEffect(() => {
    const mark = foot.current;
    if (mark === null || done) return;
    const watch = new IntersectionObserver((seen) => {
      if (seen.some((one) => one.isIntersecting)) onMore();
    });
    watch.observe(mark);
    return () => watch.disconnect();
  }, [done, onMore]);

  const shown =
    filter === "" ? rows : rows.filter((row) => row.permission_sets.includes(filter));

  return (
    <Card>
      <div className="sethead">
        <b>멤버</b>
        <span>가입한 멤버의 목록이에요</span>
        <select
          className="railfilter"
          aria-label="권한별 필터링"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="">전체</option>
          {sets.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div className="roster">
        <table>
          <thead>
            <tr>
              <th>이름</th>
              <th>학과</th>
              <th>학번</th>
              <th>기수</th>
              <th>권한</th>
              {/* 남는 가로를 먹는 빈 칸. 이것이 없으면 넓은 화면에서 앞의 칸들이
                  가로를 나눠 갖느라 값 사이가 크게 벌어진다. */}
              <th className="fill" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.department ?? "—"}</td>
                <td>{row.student_no ?? "—"}</td>
                <td>{row.cohort === null ? "—" : `${row.cohort}기`}</td>
                <td>{row.permission_sets.join(" · ") || "—"}</td>
                <td className="fill" />
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 ? <p className="empty">표시할 멤버가 없어요</p> : null}
        {/* 이 표시가 화면에 들어오면 다음 쪽을 부른다. */}
        <div ref={foot} className="rosterfoot">{done ? "" : "멤버를 불러오고 있어요…"}</div>
      </div>
    </Card>
  );
}

export function MemberCards() {
  // 쪽을 이어 붙이는 것은 TanStack 이 한다. 마지막 줄의 번호 다음부터 받는다 —
  // 보는 중에 사람이 늘거나 줄어도 이미 본 줄이 다시 나오거나 건너뛰지 않는다.
  const list = useInfiniteQuery({
    queryKey: MEMBERS_KEY,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) =>
      getJSON<{ members: MemberRow[] }>(
        `/members?limit=${PAGE}${pageParam === null ? "" : `&after=${pageParam}`}`,
      ),
    getNextPageParam: (last) =>
      last.members.length < PAGE ? undefined : (last.members.at(-1)?.id ?? undefined),
  });

  const rows = list.data?.pages.flatMap((page) => page.members) ?? [];
  const sets = [...new Set(rows.flatMap((row) => row.permission_sets))].sort();

  return (
    <>
      <SetRail />
      <MemberRoster
        rows={rows}
        done={!list.hasNextPage}
        sets={sets}
        onMore={list.fetchNextPage}
      />
    </>
  );
}
