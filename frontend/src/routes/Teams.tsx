import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import type { FormEvent } from "react";

import { AppShell, Card, Panel, ProfileMenu } from "../components/AppShell";
import { useMe, useToast } from "../components/hooks";
import {
  checkJoinPosition,
  checkTeamName,
  getJSON,
  joinPolicyLabel,
  joinResultMessage,
  joinStand,
} from "../lib/pipeline";
import type { JoinStand } from "../lib/pipeline";
import type {
  JoinPolicy,
  JoinRequest,
  Member,
  Membership,
  Position,
  Team,
} from "../lib/contract";
import { can, roleLabel } from "../lib/account";
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
      <span className="cnt">{team.member_count}명 · {joinPolicyLabel(team.join_policy)}</span>
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

/** 팀 만들기 서식. team_manage 를 가진 사람에게만 그린다. 감추는 것은 없는 단추를
 *  보여주지 않는 것일 뿐, 진짜 판정은 서버가 한다. */
function CreateTeamForm(props: {
  taken: string[];
  onCreated: () => void;
}) {
  const { taken, onCreated } = props;
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);

  const send = useMutation({
    mutationFn: () =>
      getJSON<{ team: Team }>("/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      setName("");
      setTouched(false);
      onCreated();
    },
  });

  const why = checkTeamName(name, taken);
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

/** 명단 아래의 참가·나가기. 소속이면 나가기 단추만, 승인을 기다리는 중이면 그 표시와
 *  신청을 거두는 자리, 둘 다 아니면 포지션을 골라 참가하는 서식을 보여준다. */
function JoinLeave(props: {
  teamId: number;
  stand: JoinStand;
  memberId: number | null;
  /** 신청을 거두는 통로가 join_approve 를 요구해, 그 항목이 없으면 거두는 자리가 없다. */
  canWithdraw: boolean;
  onChanged: () => void;
  say: (message: string) => void;
}) {
  const { teamId, stand, memberId, canWithdraw, onChanged, say } = props;
  const positions = useQuery({
    queryKey: ["positions"],
    queryFn: () => getJSON<{ positions: Position[] }>("/positions"),
    enabled: stand === "join",
  });
  const [positionId, setPositionId] = useState<number | null>(null);

  const leave = useMutation({
    mutationFn: () =>
      getJSON<null>(`/teams/${teamId}/members/${memberId}`, { method: "DELETE" }),
    onSuccess: onChanged,
  });

  // 신청을 거두는 통로는 남의 신청을 거절하는 통로와 같다 — 지우는 대상이 나 자신일 뿐이다.
  const cancel = useMutation({
    mutationFn: () =>
      getJSON<null>(`/teams/${teamId}/join-requests/${memberId}`, { method: "DELETE" }),
    onSuccess: onChanged,
  });

  const join = useMutation({
    mutationFn: () =>
      getJSON<{ membership: Membership }>(`/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position_id: positionId }),
      }),
    onSuccess: ({ membership }) => {
      // 자동 승인인지 직접 승인인지는 팀 설정이 정하고 그 결과가 status 로 온다. 화면은
      // 그 값 하나만 보고 알린다 — 소속인지 기다리는 중인지는 다시 받아온 /me 가 정한다.
      setPositionId(null);
      say(joinResultMessage(membership.status));
      onChanged();
    },
  });

  // 내 계정을 못 찾으면(로그인 전, 또는 명단에 없는 사람) 참가·나가기를 보여줄 수 없다.
  if (memberId === null) return null;

  if (stand === "member") {
    return (
      <div className="joinrow">
        <button className="btn" onClick={() => leave.mutate()} disabled={leave.isPending}>
          {leave.isPending ? "나가는 중…" : "이 팀에서 나가기"}
        </button>
        {leave.error ? <p className="why" role="alert">{reason(leave.error)}</p> : null}
      </div>
    );
  }

  if (stand === "pending") {
    return (
      <div className="joinrow">
        <span className="mine">승인 대기 중</span>
        {!canWithdraw ? null : (
          <button className="btn" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            {cancel.isPending ? "거두는 중…" : "신청 거두기"}
          </button>
        )}
        {cancel.error ? <p className="why" role="alert">{reason(cancel.error)}</p> : null}
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

/** 이 팀이 참가를 받는 방식을 바꾸는 자리. team_manage 를 가진 사람에게만 그린다.
 *  지금 어느 쪽인지는 팀 목록 응답의 join_policy 가 정한다 — 화면이 고른 값을 따로
 *  들지 않아, 저장이 끝나 팀 목록을 다시 받으면 그 값이 그대로 보인다. */
function JoinPolicyPicker(props: {
  team: Team;
  onChanged: () => void;
  say: (message: string) => void;
}) {
  const { team, onChanged, say } = props;

  const save = useMutation({
    // 이름은 안 바뀌어도 함께 보낸다 — 서버의 팀 고치기 통로가 이름을 늘 요구한다.
    mutationFn: (next: JoinPolicy) =>
      getJSON<{ team: Team }>(`/teams/${team.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: team.name, join_policy: next }),
      }),
    onSuccess: ({ team: saved }) => {
      say(`${saved.name} 팀의 참가 승인 방식을 ${joinPolicyLabel(saved.join_policy)}으로 바꿨습니다.`);
      onChanged();
    },
  });

  return (
    <div className="joinrow">
      <label htmlFor="join-policy">
        참가 승인 방식 바꾸기
        <select
          id="join-policy"
          value={team.join_policy}
          disabled={save.isPending}
          onChange={(event) => save.mutate(event.target.value === "approval" ? "approval" : "auto")}
        >
          <option value="auto">자동 승인</option>
          <option value="approval">직접 승인</option>
        </select>
      </label>
      {save.error ? <p className="why" role="alert">{reason(save.error)}</p> : null}
    </div>
  );
}

/** 승인을 기다리는 신청 목록. join_approve 를 가진 사람에게만 그린다. */
function JoinRequests(props: { teamId: number; onChanged: () => void }) {
  const { teamId, onChanged } = props;
  const requests = useQuery({
    queryKey: ["join-requests", teamId],
    queryFn: () => getJSON<{ join_requests: JoinRequest[] }>(`/teams/${teamId}/join-requests`),
  });

  // ponytail: 하나를 처리하는 동안 목록 전체의 단추가 잠긴다. 한 팀에 걸린 신청이
  // 몇 개 안 되는 동안은 이 편이 겹쳐 누르는 것을 막아 준다. 신청이 길어지면
  // 처리 중인 사람만 잠그도록 바꾼다.
  const decide = useMutation({
    mutationFn: (choice: { memberId: number; approve: boolean }) =>
      choice.approve
        ? getJSON<null>(`/teams/${teamId}/join-requests/${choice.memberId}/approve`, {
            method: "POST",
          })
        : getJSON<null>(`/teams/${teamId}/join-requests/${choice.memberId}`, {
            method: "DELETE",
          }),
    onSuccess: onChanged,
  });

  if (requests.isPending) return <div className="empty">불러오는 중…</div>;
  if (requests.isError) return <div className="empty">{reason(requests.error)}</div>;
  if (requests.data.join_requests.length === 0) {
    return <div className="empty">기다리는 신청이 없습니다</div>;
  }

  return (
    <div className="plist">
      {requests.data.join_requests.map((request) => (
        <div className="prow" key={request.member_id}>
          <span className="pic" aria-hidden="true">{request.member_name.slice(0, 2)}</span>
          <span className="nm">{request.member_name}</span>
          <span className="ps">{request.position}</span>
          <button
            className="btn go"
            type="button"
            disabled={decide.isPending}
            aria-label={`${request.member_name} 참가 승인`}
            onClick={() => decide.mutate({ memberId: request.member_id, approve: true })}
          >
            승인
          </button>
          <button
            className="btn"
            type="button"
            disabled={decide.isPending}
            aria-label={`${request.member_name} 참가 거절`}
            onClick={() => decide.mutate({ memberId: request.member_id, approve: false })}
          >
            거절
          </button>
        </div>
      ))}
      {decide.error ? <p className="why" role="alert">{reason(decide.error)}</p> : null}
    </div>
  );
}

/** 팀 찾기 — 팀 목록과 인원 수, 고르면 오른쪽에 그 팀 명단(이름·포지션)이 뜬다.
 *  팀 만들기는 왼쪽 카드 아래, 참가·나가기는 오른쪽 명단 아래에 둔다. */
export function Teams() {
  const { me, teamIds, pendingTeamIds } = useMe();
  const mine = teamIds;
  const client = useQueryClient();
  const { message, say } = useToast();
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

  // 팀 목록·내 소속·명단·신청 목록이 한꺼번에 바뀌는 일이라 다섯 캐시를 같이 지운다. 팀
  // 하나만 지우면 왼쪽 인원 수나 "내 팀" 배지, 승인 대기 표시가 낡은 값으로 남는다.
  function refresh(): void {
    void client.invalidateQueries({ queryKey: ["me"] });
    void client.invalidateQueries({ queryKey: ["teams"] });
    void client.invalidateQueries({ queryKey: ["team-members"] });
    void client.invalidateQueries({ queryKey: ["members"] });
    void client.invalidateQueries({ queryKey: ["join-requests"] });
  }

  return (
    <AppShell
      page="teams"
      current="find-team"
      toast={message}
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
          {!can(me, "team_manage") ? null : (
            <CreateTeamForm taken={list.map((team) => team.name)} onCreated={refresh} />
          )}
        </Card>
      </div>

      <div className="rail">
        <Panel
          title={current ? current.name : "명단"}
          hint={current ? `${current.member_count}명` : undefined}
        >
          <Roster teamId={current?.id ?? null} />
          {current === null ? null : (
            // key 에 팀 번호를 준다. 이것이 없으면 다른 팀을 골라도 같은 자리의 컴포넌트가
            // 그대로 남아, 고르던 포지션·실패 문구·처리 중이던 요청이 새 팀으로 넘어온다.
            // Fragment 는 화면에 아무것도 더하지 않으면서 key 만 받는다.
            <Fragment key={current.id}>
              <JoinLeave
                teamId={current.id}
                stand={joinStand(mine.includes(current.id), pendingTeamIds.includes(current.id))}
                memberId={me?.id ?? null}
                canWithdraw={can(me, "join_approve")}
                onChanged={refresh}
                say={say}
              />
              {!can(me, "team_manage") ? null : (
                <JoinPolicyPicker team={current} onChanged={refresh} say={say} />
              )}
            </Fragment>
          )}
        </Panel>
        {current === null || !can(me, "join_approve") ? null : (
          <Panel title="참가 신청" hint={current.name}>
            <JoinRequests key={current.id} teamId={current.id} onChanged={refresh} />
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
