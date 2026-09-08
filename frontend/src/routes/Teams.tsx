import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AppShell, Card, ProfileMenu } from "../components/AppShell";
import { Modal, Stepper } from "../components/Modal";
import { PencilIcon, SearchIcon, TrashIcon } from "../components/icons";
import { useFitCount, useMe, useMyTeams, useToast } from "../components/hooks";
import { clampPage, pageCount, pageSlice, pageWindow } from "../lib/paging";
import { askDelete } from "../lib/confirm";
import { getJSON } from "../lib/api";
import { can, roleLabel } from "../lib/account";
import { checkSlotCounts, checkTeamName, memberLabel, slotName } from "../lib/pipeline";
import { INSTRUMENTS } from "../lib/contract";
import { MAX_SLOTS_PER_TEAM } from "../lib/roster";
import type { Instrument, Member, Team, TeamSlot } from "../lib/contract";
import "../styles/teams.css";

function reason(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 났습니다.";
}

type Counts = Record<string, number>;

const NO_SLOTS: Counts = Object.fromEntries(INSTRUMENTS.map((name) => [name, 0]));

/** 자리를 악기별로 묶어 이름을 붙인다. 같은 악기가 하나뿐이면 번호를 떼고 "드럼" 으로 둔다. */
function labelled(slots: TeamSlot[]): { slot: TeamSlot; label: string }[] {
  const perInstrument = new Map<Instrument, number>();
  for (const slot of slots) {
    perInstrument.set(slot.instrument, (perInstrument.get(slot.instrument) ?? 0) + 1);
  }
  return slots.map((slot) => ({
    slot,
    label: slotName(slot.instrument, slot.ordinal, perInstrument.get(slot.instrument) ?? 1),
  }));
}

/** 팀 목록의 한 줄. 줄을 누르면 자리표가 열리고, 오른쪽 끝의 연필·쓰레기통은
 *  팀을 다룰 수 있는 사람에게만 보인다. */
function TeamRow(props: {
  team: Team;
  selected: boolean;
  mine: boolean;
  onOpen: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const { team, selected, mine, onOpen, onRename, onDelete } = props;
  return (
    <div className="teamline">
      <button
        className={selected ? "teamrow2 on" : "teamrow2"}
        aria-current={selected ? "true" : undefined}
        onClick={onOpen}
      >
        <b>{team.name}</b>
        {mine ? <span className="mine">내 팀</span> : null}
        <span className="cnt">
          {team.filled_count}/{team.slot_count}
        </span>
      </button>
      {onRename === undefined ? null : (
        <span className="acts">
          <button className="ic" aria-label={`${team.name} 수정`} onClick={onRename}>
            <PencilIcon />
          </button>
          <button className="ic danger" aria-label={`${team.name} 삭제`} onClick={onDelete}>
            <TrashIcon />
          </button>
        </span>
      )}
    </div>
  );
}

/** 팀 이름 바꾸기. 자리 구성은 건드리지 않는다 — 서버가 이름만 받는다. */
function RenameTeam(props: {
  team: Team;
  taken: string[];
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const { team, taken, onDone, onClose } = props;
  const client = useQueryClient();
  const [name, setName] = useState(team.name);
  const [bad, setBad] = useState("");

  const send = useMutation({
    mutationFn: () =>
      getJSON<{ team: Team }>(`/teams/${team.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      }),
    onSuccess: (body) => {
      void client.invalidateQueries({ queryKey: ["teams"] });
      onDone(`${body.team.name} 으로 바꿨어요.`);
    },
    onError: (error) => setBad(reason(error)),
  });

  return (
    <Modal title="팀 수정" hint="이름을 바꿉니다" onClose={onClose}
      foot={
        <>
          <button className="ghost" onClick={onClose}>취소</button>
          <button
            className="primary"
            disabled={send.isPending}
            onClick={() => {
              const why = checkTeamName(name, taken);
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
        <label className="wide" htmlFor="teamRename">
          팀 이름
          <input
            id="teamRename"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      </div>
      {bad === "" ? null : <p className="why" role="alert">{bad}</p>}
    </Modal>
  );
}

/** 사람을 이름으로 찾는 알맹이. 빈 검색어에는 아무것도 나오지 않는다 —
 *  명단을 통째로 내주는 통로가 아니기 때문이다.
 *  껍데기는 Modal 이 맡는다. 팀 만들기와 자리표가 같은 것을 쓴다. */
function MemberSearch(props: { onPick: (member: Member) => void }) {
  const { onPick } = props;
  const [text, setText] = useState("");
  const query = text.trim();

  const found = useQuery({
    queryKey: ["member-search", query],
    queryFn: () =>
      getJSON<{ members: Member[] }>(`/members/search?q=${encodeURIComponent(query)}`),
    enabled: query !== "",
  });
  const members = found.data?.members ?? [];

  let body;
  if (query === "") {
    body = <p className="empty">이름을 입력하면 찾아 드려요.</p>;
  } else if (found.isPending) {
    body = <p className="empty">찾는 중…</p>;
  } else if (found.isError) {
    body = <p className="empty">{reason(found.error)}</p>;
  } else if (members.length === 0) {
    body = <p className="empty">그런 이름을 찾지 못했어요.</p>;
  } else {
    body = (
      <ul className="found">
        {members.map((member) => (
          <li key={member.id}>
            <button onClick={() => onPick(member)}>
              {memberLabel(member.name, member.cohort)}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="seek">
      <input
        autoFocus
        type="search"
        value={text}
        aria-label="찾을 이름"
        placeholder="이름"
        onChange={(event) => setText(event.target.value)}
      />
      {body}
    </div>
  );
}

/** 고른 팀의 자리표. 빈 자리도 함께 보인다 — 채워야 할 곳을 보여주는 것이 이 화면의 일이다. */
function Lineup(props: {
  teamId: number;
  /** 빈 자리에 사람을 넣을 수 있는가 */
  canAdd: boolean;
  /** 남이 앉은 자리를 비울 수 있는가 */
  canRemove: boolean;
  onSay: (message: string) => void;
}) {
  const { teamId, canAdd, canRemove, onSay } = props;
  const client = useQueryClient();
  const [seeking, setSeeking] = useState<number | null>(null);

  const slots = useQuery({
    queryKey: ["slots", teamId],
    queryFn: () => getJSON<{ slots: TeamSlot[] }>(`/teams/${teamId}/slots`),
  });

  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: ["slots", teamId] });
    void client.invalidateQueries({ queryKey: ["teams"] });
    void client.invalidateQueries({ queryKey: ["members", teamId] });
  };

  const sit = useMutation({
    mutationFn: (vars: { slotId: number; memberId: number }) =>
      getJSON(`/teams/${teamId}/slots/${vars.slotId}`, {
        method: "PUT",
        body: JSON.stringify({ member_id: vars.memberId }),
      }),
    onSuccess: () => {
      setSeeking(null);
      refresh();
    },
    onError: (error) => onSay(reason(error)),
  });

  const clear = useMutation({
    mutationFn: (slotId: number) =>
      getJSON(`/teams/${teamId}/slots/${slotId}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (error) => onSay(reason(error)),
  });

  if (slots.isPending) return <div className="empty">불러오는 중…</div>;
  if (slots.isError) return <div className="empty">{reason(slots.error)}</div>;

  return (
    <ul className="lineup">
      {labelled(slots.data.slots).map(({ slot, label }) => (
        <li className={slot.member_id === null ? "seat open" : "seat"} key={slot.id}>
          <span className="part">{label}</span>
          {slot.member_id === null ? (
            <span className="who none">비어 있음</span>
          ) : (
            <span className="who">{memberLabel(slot.member_name ?? "", slot.member_cohort)}</span>
          )}
          {!canAdd && !canRemove ? null : (
            <span className="acts">
              {!canAdd ? null : (
                <button
                  className="ic"
                  aria-label={`${label} 자리에 넣을 사람 찾기`}
                  onClick={() => setSeeking(slot.id)}
                >
                  <SearchIcon />
                </button>
              )}
              {slot.member_id === null || !canRemove ? null : (
                <button
                  className="btn"
                  disabled={clear.isPending}
                  onClick={() => clear.mutate(slot.id)}
                >
                  삭제
                </button>
              )}
            </span>
          )}
          {seeking !== slot.id ? null : (
            <Modal title="사람 찾기" hint={label} onClose={() => setSeeking(null)}>
              <MemberSearch
                onPick={(member) => sit.mutate({ slotId: slot.id, memberId: member.id })}
              />
            </Modal>
          )}
        </li>
      ))}
    </ul>
  );
}

/** 만들려는 자리 한 칸. 아직 저장 전이라 id 가 없고, 악기와 번호로만 가리킨다. */
type Draft = { instrument: Instrument; ordinal: number; label: string; member: Member | null };

/** 정한 수만큼 자리를 펼친다. 같은 악기가 하나뿐이면 번호를 떼고 "드럼" 으로 둔다. */
function spread(counts: Counts): Draft[] {
  return INSTRUMENTS.flatMap((instrument) => {
    const count = counts[instrument] ?? 0;
    return Array.from({ length: count }, (_unused, index) => ({
      instrument,
      ordinal: index + 1,
      label: slotName(instrument, index + 1, count),
      member: null,
    }));
  });
}

/** 팀 만들기. 두 단계다 — 먼저 악기마다 몇 자리인지 정하고, 그다음 자리마다 사람을 넣는다.
 *
 *  저장은 마지막 한 번에 일어난다. 서버는 팀과 자리를 함께 만들고(POST /teams) 사람은
 *  자리마다 따로 받으므로(PUT .../slots/{id}), 만든 뒤 자리 목록을 받아 악기·번호로
 *  짝을 지어 채운다. 자리 순서를 짐작하지 않는 것은 서버가 정렬을 바꿔도 어긋나지
 *  않게 하기 위해서다. */
function NewTeam(props: { taken: string[]; onDone: (message: string) => void; onClose: () => void }) {
  const { taken, onDone, onClose } = props;
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [counts, setCounts] = useState<Counts>(NO_SLOTS);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [seeking, setSeeking] = useState<number | null>(null);
  const [bad, setBad] = useState("");

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  const create = useMutation({
    mutationFn: async (seats: Draft[]) => {
      const made = await getJSON<{ team: Team }>("/teams", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), slots: counts }),
      });
      const teamId = made.team.id;
      const saved = await getJSON<{ slots: TeamSlot[] }>(`/teams/${teamId}/slots`);
      for (const seat of seats) {
        if (seat.member === null) continue;
        const slot = saved.slots.find(
          (row) => row.instrument === seat.instrument && row.ordinal === seat.ordinal,
        );
        if (slot === undefined) continue;
        await getJSON(`/teams/${teamId}/slots/${slot.id}`, {
          method: "PUT",
          body: JSON.stringify({ member_id: seat.member.id }),
        });
      }
      return made.team;
    },
    onSuccess: (team) => {
      void client.invalidateQueries({ queryKey: ["teams"] });
      onDone(`${team.name} 팀을 만들었어요.`);
    },
    onError: (error) => setBad(reason(error)),
  });

  // 1단계 — 악기마다 몇 자리인지 정한다.
  if (drafts === null) {
    return (
      <Modal title="새 팀" hint="악기마다 몇 명이 들어가는지 정합니다" onClose={onClose}
        foot={
          <>
            <button className="ghost" onClick={onClose}>취소</button>
            <button
              className="primary"
              onClick={() => {
                const why = checkTeamName(name, taken) || checkSlotCounts(counts);
                setBad(why);
                if (why === "") setDrafts(spread(counts));
              }}
            >
              구성 확정
            </button>
          </>
        }
      >
        <div className="fields">
          <label className="wide" htmlFor="teamName">
            팀 이름
            <input
              id="teamName"
              value={name}
              placeholder="곡 이름"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </div>

        {INSTRUMENTS.map((instrument) => (
          <Stepper
            key={instrument}
            label={instrument}
            value={counts[instrument] ?? 0}
            min={0}
            max={(counts[instrument] ?? 0) + Math.max(0, MAX_SLOTS_PER_TEAM - total)}
            onChange={(next) => setCounts((now) => ({ ...now, [instrument]: next }))}
          />
        ))}

        <p className="note">자리 {total}개</p>
        {bad === "" ? null : <p className="why" role="alert">{bad}</p>}
      </Modal>
    );
  }

  // 2단계 — 자리마다 사람을 넣는다. 비워 둔 자리는 그대로 빈 자리로 만들어진다.
  return (
    <Modal title={name.trim()} hint="돋보기를 눌러 자리에 넣을 사람을 찾습니다" onClose={onClose}
      foot={
        <>
          <button className="ghost" onClick={() => setDrafts(null)}>이전</button>
          <button
            className="primary"
            disabled={create.isPending}
            onClick={() => create.mutate(drafts)}
          >
            {create.isPending ? "만드는 중…" : "팀 생성"}
          </button>
        </>
      }
    >
      <ul className="lineup">
        {drafts.map((draft, index) => (
          <li className={draft.member === null ? "seat open" : "seat"} key={draft.label}>
            <span className="part">{draft.label}</span>
            {draft.member === null ? (
              <span className="who none">비어 있음</span>
            ) : (
              <span className="who">{memberLabel(draft.member.name, draft.member.cohort)}</span>
            )}
            <span className="acts">
              <button
                className="ic"
                aria-label={`${draft.label} 자리에 넣을 사람 찾기`}
                onClick={() => setSeeking(index)}
              >
                <SearchIcon />
              </button>
              {draft.member === null ? null : (
                <button
                  className="btn"
                  onClick={() =>
                    setDrafts((now) =>
                      (now ?? []).map((row, at) => (at === index ? { ...row, member: null } : row)),
                    )
                  }
                >
                  삭제
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {bad === "" ? null : <p className="why" role="alert">{bad}</p>}

      {seeking === null ? null : (
        <Modal title="사람 찾기" hint={drafts[seeking]?.label} onClose={() => setSeeking(null)}>
          <MemberSearch
            onPick={(member) => {
              setDrafts((now) =>
                (now ?? []).map((row, at) => (at === seeking ? { ...row, member } : row)),
              );
              setSeeking(null);
            }}
          />
        </Modal>
      )}
    </Modal>
  );
}

export function Teams() {
  const { message, say } = useToast();
  const { me, teamIds } = useMe();
  const myTeams = useMyTeams();
  const [openId, setOpenId] = useState<number | null>(null);
  const [making, setMaking] = useState(false);
  const [renaming, setRenaming] = useState<Team | null>(null);
  const [page, setPage] = useState(1);
  const client = useQueryClient();

  const drop = useMutation({
    mutationFn: (team: Team) => getJSON<null>(`/teams/${team.id}`, { method: "DELETE" }),
    onSuccess: (_body, team) => {
      // 지운 팀의 자리표가 열려 있으면 함께 닫는다.
      setOpenId((now) => (now === team.id ? null : now));
      void client.invalidateQueries({ queryKey: ["teams"] });
      say(`${team.name} 팀을 삭제했어요.`);
    },
    onError: (error) => say(reason(error)),
  });

  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: () => getJSON<{ teams: Team[] }>("/teams"),
  });
  const list = teams.data?.teams ?? [];
  const canCreate = can(me, "team_create");
  const canRename = can(me, "team_edit");
  const canDrop = can(me, "team_delete");
  const state = teams.isPending
    ? "불러오는 중…"
    : teams.isError
      ? reason(teams.error)
      : list.length === 0
        ? "아직 팀이 없습니다."
        : "";

  // 한 쪽에 몇 줄을 둘지는 상자 높이가 정한다. 목록은 스크롤하지 않고 쪽으로 넘긴다.
  const [box, perPage] = useFitCount(64);
  const pages = pageCount(list.length, perPage);
  const shownPage = clampPage(page, pages);
  const opened = list.find((team) => team.id === openId) ?? null;

  return (
    <AppShell
      page="teams"
      current="find-team"
      toast={message}
      profile={
        <ProfileMenu
          name={me?.name ?? ""}
          sub={me ? roleLabel(me.role) : ""}
          teams={myTeams}
        />
      }
    >
      <div className="main">
        <Card>
          <div className="sethead">
            <b>팀</b>
            <span>팀을 누르면 자리가 보입니다</span>
          </div>

          {/* 비었거나 불러오는 중이어도 상자는 그대로 둔다 — 상자 높이를 재서 한 쪽에
              몇 줄을 둘지 정하므로, 상자가 사라지면 잴 것이 없어진다. */}
          <ul className="rows" ref={box}>
            {state !== "" ? (
              <li className="empty">{state}</li>
            ) : (
              pageSlice(list, shownPage, perPage).map((team) => (
                <li key={team.id}>
                  <TeamRow
                    team={team}
                    selected={team.id === openId}
                    mine={teamIds.includes(team.id)}
                    onOpen={() => setOpenId(team.id)}
                    onRename={canRename ? () => setRenaming(team) : undefined}
                    onDelete={!canDrop ? undefined : () => { if (askDelete(team.name)) drop.mutate(team); }}
                  />
                </li>
              ))
            )}
          </ul>

          <div className="listfoot">
            {state !== "" ? null : (
              <nav className="pager" aria-label="쪽 넘기기">
                <button aria-label="이전 쪽" disabled={shownPage === 1}
                  onClick={() => setPage(shownPage - 1)}>‹</button>
                {pageWindow(shownPage, pages).map((number) => (
                  <button key={number} aria-label={`${number}쪽`}
                    aria-current={number === shownPage ? "page" : undefined}
                    onClick={() => setPage(number)}>{number}</button>
                ))}
                <button aria-label="다음 쪽" disabled={shownPage === pages}
                  onClick={() => setPage(shownPage + 1)}>›</button>
              </nav>
            )}
            {!canCreate ? null : (
              <button className="new" onClick={() => setMaking(true)}>+ 새 팀</button>
            )}
          </div>
        </Card>
      </div>

      {!making ? null : (
        <NewTeam
          taken={list.map((team) => team.name)}
          onClose={() => setMaking(false)}
          onDone={(text) => { setMaking(false); say(text); }}
        />
      )}

      {renaming === null ? null : (
        <RenameTeam
          team={renaming}
          taken={list.filter((team) => team.id !== renaming.id).map((team) => team.name)}
          onClose={() => setRenaming(null)}
          onDone={(text) => { setRenaming(null); say(text); }}
        />
      )}

      {opened === null ? null : (
        <Modal
          title={opened.name}
          hint={`자리 ${opened.slot_count}개 중 ${opened.filled_count}개 참`}
          onClose={() => setOpenId(null)}
        >
          <Lineup
            teamId={opened.id}
            canAdd={can(me, "member_add")}
            canRemove={can(me, "member_remove")}
            onSay={say}
          />
        </Modal>
      )}
    </AppShell>
  );
}
