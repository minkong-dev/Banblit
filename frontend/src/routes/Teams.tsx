import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { FormEvent } from "react";

import { AppShell, Card, Panel, ProfileMenu } from "../components/AppShell";
import { useMe } from "../components/hooks";
import { checkJoinPosition, checkTeamName, getJSON } from "../lib/pipeline";
import type { Member, Membership, Position, Team } from "../lib/contract";
import { roleLabel } from "../lib/account";
import "../styles/teams.css";


function reason(error: unknown): string {
  return error instanceof Error ? error.message : "불러오지 못했습니다";
}

function TeamRow(props: { team: Team; selected: boolean; mine: boolean; onOpen: () => void }) {
  const { team, selected, mine, onOpen } = props;
  return (
    <li>
      <button className="teamrow2" aria-pressed={selected} onClick={onOpen}>
        <b>{team.name}</b>
        {mine ? <span className="mine">내 팀</span> : null}
      </button>
      <span className="cnt">{team.member_count}명</span>
    </li>
  );
}

function Roster(props: { teamId: number | null }) {
  const { teamId } = props;
  const members = useQuery({
    queryKey: ["team-members", teamId],
    queryFn: () => getJSON<{ members: Member[] }>(`/teams/${teamId}/members`),
    enabled: teamId !== null,
  });

  if (teamId === null) return <div className="empty">왼쪽에서 팀을 골라 주세요</div>;
  if (members.isPending) return <div className="empty">불러오는 중…</div>;
  if (members.isError) return <div className="empty">{reason(members.error)}</div>;

  return (
    <div className="plist">
      {members.data.members.map((member) => (
        <div className="prow" key={member.id}>
          <span className="pic" aria-hidden="true">{member.name.slice(0, 2)}</span>
          <span className="nm">{member.name}</span>
          <span className="ps">{member.positions.join(" · ")}</span>
        </div>
      ))}
    </div>
  );
}

/** 팀 만들기 서식. 헤드매니저 권한은 서버가 최종적으로 가린다 — 로그인 붙은 지금도
 *  이 화면은 역할을 미리 감추지 않고, 권한이 없으면 서버가 돌려준 사유를 그대로 보여준다. */
function CreateTeamForm(props: {
  taken: string[];
  requestedBy: number | null;
  onCreated: () => void;
}) {
  const { taken, requestedBy, onCreated } = props;
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);

  const send = useMutation({
    mutationFn: () =>
      getJSON<{ team: Team }>("/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, requested_by: requestedBy }),
      }),
    onSuccess: () => {
      setName("");
      setTouched(false);
      onCreated();
    },
  });

  const why =
    requestedBy === null
      ? "내 계정을 확인하지 못해 팀을 만들 수 없습니다"
      : checkTeamName(name, taken);
  const whyId = "team-create-why";
  const bad = touched && why !== "" ? why : send.error ? reason(send.error) : "";

  return (
    <form
      className="addrow"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        setTouched(true);
        if (why === "") send.mutate();
      }}
    >
      <div className="fields">
        <label className="wide" htmlFor="team-create-name">
          팀 이름
          <input
            id="team-create-name"
            value={name}
            aria-invalid={bad !== ""}
            aria-describedby={bad === "" ? undefined : whyId}
            placeholder="새벽 네시"
            onChange={(event) => {
              setTouched(true);
              setName(event.target.value);
            }}
          />
        </label>
        <button className="btn go" type="submit" disabled={why !== "" || send.isPending}>
          {send.isPending ? "만드는 중…" : "팀 만들기"}
        </button>
      </div>
      {bad === "" ? null : (
        <p className="why" id={whyId} role="alert">{bad}</p>
      )}
    </form>
  );
}

/** 명단 아래의 참가·나가기. 이미 소속이면 나가기 단추만, 아니면 포지션을 골라
 *  참가하는 서식을 보여준다. */
function JoinLeave(props: {
  teamId: number;
  isMember: boolean;
  memberId: number | null;
  onChanged: () => void;
}) {
  const { teamId, isMember, memberId, onChanged } = props;
  const positions = useQuery({
    queryKey: ["positions"],
    queryFn: () => getJSON<{ positions: Position[] }>("/positions"),
    enabled: !isMember,
  });
  const [positionId, setPositionId] = useState<number | null>(null);

  const leave = useMutation({
    mutationFn: () =>
      getJSON<null>(`/teams/${teamId}/members/${memberId}`, { method: "DELETE" }),
    onSuccess: onChanged,
  });

  const join = useMutation({
    mutationFn: () =>
      getJSON<{ membership: Membership }>(`/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: memberId, position_id: positionId }),
      }),
    onSuccess: () => {
      setPositionId(null);
      onChanged();
    },
  });

  // 내 계정을 못 찾으면(로그인 전, 또는 명단에 없는 사람) 참가·나가기를 보여줄 수 없다.
  if (memberId === null) return null;

  if (isMember) {
    return (
      <div className="joinrow">
        <button className="btn" onClick={() => leave.mutate()} disabled={leave.isPending}>
          {leave.isPending ? "나가는 중…" : "이 팀에서 나가기"}
        </button>
        {leave.error ? <p className="why" role="alert">{reason(leave.error)}</p> : null}
      </div>
    );
  }

  const positionList = positions.data?.positions ?? [];
  const why = checkJoinPosition(positionId);
  const bad = join.error ? reason(join.error) : "";

  return (
    <form
      className="joinrow"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (why === "") join.mutate();
      }}
    >
      <label htmlFor="join-position">
        맡을 포지션
        <select
          id="join-position"
          value={positionId ?? ""}
          onChange={(event) =>
            setPositionId(event.target.value === "" ? null : Number(event.target.value))
          }
        >
          <option value="">고르세요</option>
          {positionList.map((position) => (
            <option key={position.id} value={position.id}>{position.name}</option>
          ))}
        </select>
      </label>
      <button className="btn go" type="submit" disabled={why !== "" || join.isPending}>
        {join.isPending ? "참가하는 중…" : "이 팀에 참가"}
      </button>
      {bad === "" ? null : <p className="why" role="alert">{bad}</p>}
    </form>
  );
}

/** 팀 찾기 — 팀 목록과 인원 수, 고르면 오른쪽에 그 팀 명단(이름·포지션)이 뜬다.
 *  팀 만들기는 왼쪽 카드 아래, 참가·나가기는 오른쪽 명단 아래에 둔다. */
export function Teams() {
  const { me, teamIds } = useMe();
  const mine = teamIds;
  const client = useQueryClient();
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: () => getJSON<{ teams: Team[] }>("/teams"),
  });
  const list = teams.data?.teams ?? [];
  const [selected, setSelected] = useState<number | null>(null);
  const current = list.find((team) => team.id === selected) ?? null;

  const myTeams = list
    .map((team, index) => ({ ...team, colorKey: `c${(index % 4) + 1}` }))
    .filter((team) => mine.includes(team.id));

  // 팀 목록·소속·명단이 한꺼번에 바뀌는 일이라 세 캐시를 같이 지운다. 팀 하나만
  // 지우면 왼쪽 인원 수나 "내 팀" 배지가 낡은 값으로 남는다.
  function refresh(): void {
    void client.invalidateQueries({ queryKey: ["teams"] });
    void client.invalidateQueries({ queryKey: ["team-members"] });
    void client.invalidateQueries({ queryKey: ["members"] });
  }

  return (
    <AppShell
      page="teams"
      current="find-team"
      profile={
        <ProfileMenu
          name={me?.name ?? ""}
          sub={me ? `${roleLabel(me.role)} · 2026년 입부` : ""}
          teams={myTeams}
        />
      }
    >
      <div className="main">
        <Card>
          <div className="sethead">
            <b>팀 찾기</b>
            <span>팀을 누르면 오른쪽에 명단이 보입니다</span>
          </div>
          {teams.isPending ? (
            <div className="empty">불러오는 중…</div>
          ) : teams.isError ? (
            <div className="empty">{reason(teams.error)}</div>
          ) : list.length === 0 ? (
            <div className="empty">등록된 팀이 없습니다</div>
          ) : (
            <ul className="rows">
              {list.map((team) => (
                <TeamRow
                  key={team.id}
                  team={team}
                  selected={team.id === selected}
                  mine={mine.includes(team.id)}
                  onOpen={() => setSelected(team.id)}
                />
              ))}
            </ul>
          )}
          <CreateTeamForm
            taken={list.map((team) => team.name)}
            requestedBy={me?.id ?? null}
            onCreated={refresh}
          />
        </Card>
      </div>

      <div className="rail">
        <Panel
          title={current ? current.name : "명단"}
          hint={current ? `${current.member_count}명` : undefined}
        >
          <Roster teamId={current?.id ?? null} />
          {current === null ? null : (
            <JoinLeave
              teamId={current.id}
              isMember={mine.includes(current.id)}
              memberId={me?.id ?? null}
              onChanged={refresh}
            />
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
