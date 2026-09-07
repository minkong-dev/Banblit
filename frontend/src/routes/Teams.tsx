import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AppShell, Card, ProfileMenu } from "../components/AppShell";
import { useMe, useMyTeams, useToast } from "../components/hooks";
import { getJSON } from "../lib/api";
import { can, roleLabel } from "../lib/account";
import { checkSlotCounts, checkTeamName, memberLabel, slotName } from "../lib/pipeline";
import { INSTRUMENTS } from "../lib/contract";
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

/** 팀 목록의 한 줄. 자리가 몇 개 찼는지를 이름 옆에 함께 둔다. */
function TeamRow(props: { team: Team; selected: boolean; mine: boolean; onOpen: () => void }) {
  const { team, selected, mine, onOpen } = props;
  return (
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
  );
}

/** 자리에 앉힐 사람을 이름으로 찾는 자리. 빈 검색어에는 아무것도 나오지 않는다 —
 *  명단을 통째로 내주는 통로가 아니기 때문이다. */
function MemberSearch(props: { onPick: (member: Member) => void; onClose: () => void }) {
  const { onPick, onClose } = props;
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
    <div className="seek" role="dialog" aria-label="사람 찾기">
      <div className="seekhead">
        <input
          autoFocus
          type="search"
          value={text}
          aria-label="찾을 이름"
          placeholder="이름"
          onChange={(event) => setText(event.target.value)}
        />
        <button className="btn" onClick={onClose}>닫기</button>
      </div>
      {body}
    </div>
  );
}

/** 고른 팀의 자리표. 빈 자리도 함께 보인다 — 채워야 할 곳을 보여주는 것이 이 화면의 일이다. */
function Lineup(props: { teamId: number; canEdit: boolean; onSay: (message: string) => void }) {
  const { teamId, canEdit, onSay } = props;
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
          {!canEdit ? null : (
            <span className="acts">
              <button
                className="ic"
                aria-label={`${label} 자리에 앉힐 사람 찾기`}
                onClick={() => setSeeking(seeking === slot.id ? null : slot.id)}
              >
                🔍
              </button>
              {slot.member_id === null ? null : (
                <button
                  className="btn"
                  disabled={clear.isPending}
                  onClick={() => clear.mutate(slot.id)}
                >
                  비우기
                </button>
              )}
            </span>
          )}
          {seeking !== slot.id ? null : (
            <MemberSearch
              onClose={() => setSeeking(null)}
              onPick={(member) => sit.mutate({ slotId: slot.id, memberId: member.id })}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/** 팀 만들기 — 이름을 적고 악기마다 몇 자리인지 +/- 로 정한다. 자리는 팀과 함께 생긴다. */
function CreateTeam(props: { taken: string[]; onSay: (message: string) => void }) {
  const { taken, onSay } = props;
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [counts, setCounts] = useState<Counts>(NO_SLOTS);
  const [bad, setBad] = useState("");

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  const create = useMutation({
    mutationFn: () =>
      getJSON<{ team: Team }>("/teams", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), slots: counts }),
      }),
    onSuccess: (body) => {
      setName("");
      setCounts(NO_SLOTS);
      setBad("");
      onSay(`${body.team.name} 팀을 만들었어요.`);
      void client.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (error) => setBad(reason(error)),
  });

  const bump = (instrument: Instrument, step: number): void =>
    setCounts((now) => ({
      ...now,
      [instrument]: Math.max(0, (now[instrument] ?? 0) + step),
    }));

  return (
    <form
      className="addrow"
      onSubmit={(event) => {
        event.preventDefault();
        const why = checkTeamName(name, taken) || checkSlotCounts(counts);
        setBad(why);
        if (why === "") create.mutate();
      }}
    >
      <p className="note">악기마다 몇 명이 들어가는지 정하면 그만큼 자리가 생깁니다.</p>
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

      <ul className="counter">
        {INSTRUMENTS.map((instrument) => (
          <li key={instrument}>
            <span className="part">{instrument}</span>
            <button
              type="button"
              aria-label={`${instrument} 한 자리 줄이기`}
              disabled={counts[instrument] === 0}
              onClick={() => bump(instrument, -1)}
            >
              −
            </button>
            <b aria-live="polite">{counts[instrument]}</b>
            <button
              type="button"
              aria-label={`${instrument} 한 자리 늘리기`}
              onClick={() => bump(instrument, 1)}
            >
              +
            </button>
          </li>
        ))}
      </ul>

      <div className="acts">
        <span className="note">자리 {total}개</span>
        <button className="btn go" type="submit" disabled={create.isPending}>
          {create.isPending ? "만드는 중…" : "팀 만들기"}
        </button>
      </div>
      {bad === "" ? null : <p className="why" role="alert">{bad}</p>}
    </form>
  );
}

export function Teams() {
  const { message, say } = useToast();
  const { me, teamIds } = useMe();
  const myTeams = useMyTeams();
  const [openId, setOpenId] = useState<number | null>(null);

  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: () => getJSON<{ teams: Team[] }>("/teams"),
  });
  const list = teams.data?.teams ?? [];
  const shown = openId ?? list[0]?.id ?? null;
  const canEdit = can(me, "team_manage");

  let panel;
  if (teams.isPending) {
    panel = <div className="empty">불러오는 중…</div>;
  } else if (teams.isError) {
    panel = <div className="empty">{reason(teams.error)}</div>;
  } else if (list.length === 0) {
    panel = <div className="empty">아직 팀이 없습니다.</div>;
  } else {
    panel = (
      <ul className="rows">
        {list.map((team) => (
          <li key={team.id}>
            <TeamRow
              team={team}
              selected={team.id === shown}
              mine={teamIds.includes(team.id)}
              onOpen={() => setOpenId(team.id)}
            />
          </li>
        ))}
      </ul>
    );
  }

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
            <span>자리마다 누가 앉아 있는지 보여줍니다</span>
          </div>
          {panel}
        </Card>

        {!canEdit ? null : (
          <Card>
            <div className="sethead">
              <b>새 팀</b>
              <span>이름과 악기 구성을 정합니다</span>
            </div>
            <CreateTeam taken={list.map((team) => team.name)} onSay={say} />
          </Card>
        )}
      </div>

      <div className="rail">
        <section className="panel">
          <div className="ph">
            {list.find((team) => team.id === shown)?.name ?? "자리"}
          </div>
          {shown === null ? (
            <div className="empty">팀을 고르면 자리가 보입니다.</div>
          ) : (
            <Lineup teamId={shown} canEdit={canEdit} onSay={say} />
          )}
        </section>
      </div>
    </AppShell>
  );
}
