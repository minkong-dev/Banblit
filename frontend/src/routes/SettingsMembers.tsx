// 설정 화면의 멤버 구역입니다. 카드 두 장이 수직으로 배치됩니다.
//
// 위쪽은 permission set(권한 집합)입니다. 정사각형 카드가 수평으로 배치되며, 한 화면에 모두 보이지 않으면 < > 버튼으로 넘깁니다.
// 아래쪽은 가입한 모든 멤버입니다. 아래로 스크롤하면 다음 page 를 불러옵니다.

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { Card } from "../components/AppShell";
import { Dropdown } from "../components/Dropdown";
import { Modal } from "../components/Modal";
import { MemberSearch } from "../components/MemberSearch";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  PersonIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { getJSON, reason } from "../lib/api";
import { say } from "../lib/toast";
import { cohortLabel } from "../lib/roster";
import { PERMISSION_ITEMS, can } from "../lib/account";
import { askDelete, askExpel } from "../lib/confirm";
import { useMe } from "../components/queries";
import { expelMember } from "../lib/pipeline";
import type { MemberRow, Permission, PermissionSet } from "../lib/contract";
import { SectionHead } from "./SettingsForm";

const SETS_KEY = ["permission-sets"];
const MEMBERS_KEY = ["member-roster"];
/** 한 번에 불러오는 멤버 수입니다. 아래로 스크롤하면 이 크기만큼씩 다음 페이지를 불러옵니다. */
const PAGE = 50;


type Draft = { name: string; description: string; permissions: Permission[] };

const BLANK: Draft = { name: "", description: "", permissions: [] };

/** permission set 을 생성하거나 수정하는 modal 입니다. 설명은 필수입니다. 항목 목록만으로는 "이 permission set 이 필요한 이유"가 명확하지 않습니다. */
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
            // eslint-disable-next-line jsx-a11y/no-autofocus -- 권한 편집 모달이 열릴 때 이름 입력칸으로 초점을 이동합니다. WAI-ARIA dialog 패턴이 규정하는 동작입니다.
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

/** 권한 카드의 두 창입니다. holders 는 권한을 가진 멤버 목록과 회수, add 는 멤버 검색과 부여입니다. */
type GrantMode = "holders" | "add";

/** 멤버에게 permission set 을 부여하거나 회수합니다. */
function GrantModal(props: {
  set: PermissionSet;
  mode: GrantMode;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const { set, mode, onClose, onDone } = props;
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

  if (mode === "add") {
    return (
      <Modal title={set.name} hint="권한을 부여할 멤버를 검색해요" onClose={onClose}>
        <MemberSearch
          exclude={set.members.map((person) => person.id)}
          onPick={(one) => grant.mutate(one.id)}
        />
      </Modal>
    );
  }

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
    </Modal>
  );
}

/** permission set 카드 한 장입니다. 정사각형 카드이며 이름, 멤버 수, 설명이 포함됩니다. */
function SetTile(props: {
  set: PermissionSet;
  onHolders: () => void;
  onGrant: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { set, onHolders, onGrant, onEdit, onDelete } = props;
  return (
    <li className="tile">
      <div className="tilehead">
        <b>{set.name}</b>
        <span>{set.members.length}명</span>
      </div>
      <p className="tilenote">{set.description || "권한 설명을 작성해주세요"}</p>
      <div className="tileacts">
        <button className="ic" aria-label={`${set.name} 권한을 가진 멤버 보기`} onClick={onHolders}>
          <PersonIcon />
        </button>
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

/** permission set 카드 행입니다. 카드가 수평으로 배치되며, 한 화면에 모두 보이지 않으면 < > 버튼으로 넘깁니다. */
function SetRail() {
  const client = useQueryClient();
  const track = useRef<HTMLUListElement | null>(null);
  const [making, setMaking] = useState(false);
  const [editing, setEditing] = useState<PermissionSet | null>(null);
  const [granting, setGranting] = useState<{ set: PermissionSet; mode: GrantMode } | null>(null);

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

  // 한 번에 카드 한 개 너비만큼 스크롤합니다. 창 너비가 변경되어도 카드를 다시 계산하여 사용합니다.
  const slide = (way: 1 | -1): void => {
    const box = track.current;
    if (box === null) return;
    const step = box.querySelector("li")?.getBoundingClientRect().width ?? 240;
    box.scrollBy({ left: way * (step + 12), behavior: "smooth" });
  };

  return (
    <Card>
      <SectionHead title="권한" desc="부여할 권한을 설정해 커스텀 권한을 만들 수 있어요">
        <span className="railnav">
          <button className="ic" aria-label="이전 권한" onClick={() => slide(-1)}>
            <ChevronLeftIcon />
          </button>
          <button className="ic" aria-label="다음 권한" onClick={() => slide(1)}>
            <ChevronRightIcon />
          </button>
        </span>
      </SectionHead>

      <ul className="tiles" ref={track}>
        {list.map((set) => (
          <SetTile
            key={set.id}
            set={set}
            onHolders={() => setGranting({ set, mode: "holders" })}
            onGrant={() => setGranting({ set, mode: "add" })}
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
          set={list.find((one) => one.id === granting.set.id) ?? granting.set}
          mode={granting.mode}
          onClose={() => setGranting(null)}
          onDone={saved}
        />
      )}
    </Card>
  );
}

/** 가입한 모든 멤버입니다. 아래로 스크롤하면 다음 페이지를 불러옵니다. */
function MemberRoster(props: {
  rows: MemberRow[];
  done: boolean;
  onMore: () => unknown;
  sets: string[];
  /** member_expel 권한이 있으면 각 행에 추방 버튼을 표시합니다. 로그인한 본인 행에는 표시하지 않습니다. */
  onExpel: ((row: MemberRow) => void) | null;
  meId: number | null;
}) {
  const { rows, done, onMore, sets, onExpel, meId } = props;
  const [filter, setFilter] = useState("");
  const foot = useRef<HTMLDivElement | null>(null);

  // 목록의 바닥이 화면에 들어오면 다음 페이지를 불러옵니다. 스크롤 위치를 직접 계산하지 않는 이유는, 행 높이나 카드 높이가 변해도 이 방식은 계속 작동하기 때문입니다.
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
      <SectionHead title="멤버" desc="가입한 멤버의 목록이에요">
        <Dropdown
          className="railfilter"
          ariaLabel="권한별 필터링"
          value={filter}
          choices={[{ value: "", label: "전체" }, ...sets.map((name) => ({ value: name, label: name }))]}
          onChange={setFilter}
        />
      </SectionHead>

      <div className="roster">
        <table>
          <thead>
            <tr>
              <th>이름</th>
              <th>학과</th>
              <th>학번</th>
              <th>기수</th>
              <th>권한</th>
              {/* 남는 가로 공간을 차지하는 빈 칸입니다. 이 요소가 없으면 넓은 화면에서 앞의 열들이 가로 공간을 나눠 가져 값 사이가 크게 벌어집니다. */}
              <th className="fill" aria-hidden="true" />
              {onExpel === null ? null : <th>추방</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.department ?? "—"}</td>
                <td>{row.student_no ?? "—"}</td>
                <td>{cohortLabel(row.cohort)}</td>
                <td>{row.permission_sets.join(" · ") || "—"}</td>
                <td className="fill" />
                {onExpel === null ? null : (
                  <td>
                    {/* 자기 계정은 탈퇴로만 삭제합니다. 서버도 자기 자신의 추방을 거부합니다. */}
                    {row.id === meId ? null : (
                      <button
                        className="ic danger"
                        aria-label={`${row.name} 추방`}
                        onClick={() => onExpel(row)}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 ? <p className="empty">표시할 멤버가 없어요</p> : null}
        {/* 이 요소가 화면에 들어오면 다음 페이지를 불러옵니다. */}
        <div ref={foot} className="rosterfoot">{done ? "" : "멤버를 불러오고 있어요…"}</div>
      </div>
    </Card>
  );
}

export function MemberCards() {
  // 페이지 연결은 TanStack Query(서버 데이터 동기화를 관리하는 라이브러리)가 처리합니다. 마지막 행의 ID 다음부터 불러옵니다.
  // 조회 중에 멤버가 추가되거나 삭제되어도 이미 본 행이 다시 나오거나 건너뛰지 않습니다.
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

  const { me } = useMe();
  const client = useQueryClient();
  // 추방은 계정 삭제입니다. 삭제가 끝나면 명단을 서버에서 다시 조회합니다.
  const expel = useMutation({
    mutationFn: (row: MemberRow) => expelMember(row.id),
    onSuccess: (_result, row) => {
      say(`${row.name} 님을 추방했어요.`);
      void client.invalidateQueries({ queryKey: MEMBERS_KEY });
      void client.invalidateQueries({ queryKey: SETS_KEY });
    },
    onError: (error) => say(reason(error, "추방하지 못했어요.")),
  });

  return (
    <>
      <SetRail />
      <MemberRoster
        rows={rows}
        done={!list.hasNextPage}
        sets={sets}
        onMore={list.fetchNextPage}
        meId={me?.id ?? null}
        onExpel={
          can(me, "member_expel")
            ? (row) => { if (!expel.isPending && askExpel(row.name)) expel.mutate(row); }
            : null
        }
      />
    </>
  );
}
