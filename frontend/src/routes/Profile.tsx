import { useQueries } from "@tanstack/react-query";

import { AppShell, Card, ProfileMenu } from "../components/AppShell";
import { getJSON } from "../lib/api";
import { useMe } from "../components/hooks";
import { useMyTeams } from "../components/hooks";
import "../styles/profile.css";
import type { Account, Member } from "../lib/contract";
import { roleLabel } from "../lib/account";


function reason(error: unknown): string {
  return error instanceof Error ? error.message : "불러오지 못했습니다";
}

/** 소속 팀마다 내가 맡은 포지션을 한 줄로 낸다. 실패한 팀은 사유를 그 줄에 남긴다. */
function useMyAffiliations(me: Account | null, teamIds: number[], teams: { id: number; name: string }[]) {
  const teamName = (id: number): string =>
    teams.find((team) => team.id === id)?.name ?? "이름 없는 팀";

  const memberQueries = useQueries({
    queries: teamIds.map((id) => ({
      queryKey: ["members", id],
      queryFn: () => getJSON<{ members: Member[] }>(`/teams/${id}/members`),
    })),
  });

  return memberQueries.map((query, index) => {
    const id = teamIds[index] ?? 0;
    if (query.isPending) return { teamName: teamName(id), text: "불러오는 중…" };
    if (query.isError) return { teamName: teamName(id), text: reason(query.error) };
    const mine = me === null ? undefined : query.data.members.find((member) => member.id === me.id);
    return { teamName: teamName(id), text: mine ? mine.positions.join(" · ") : "명단에서 찾지 못했습니다" };
  });
}

/** 프로필 설정 — 내 이름과 소속 팀별 포지션을 보여준다. 고치는 통로가 아직 없다. */
export function Profile() {
  const { me, teamIds, teams } = useMe();
  const affiliations = useMyAffiliations(me, teamIds, teams);
  const myTeams = useMyTeams();
  const name = me?.name ?? "";

  return (
    <AppShell
      page="profile"
      profile={<ProfileMenu name={name} sub={me ? `${roleLabel(me.role)} · 2026년 입부` : ""} teams={myTeams} />}
    >
      <div className="main">
        <Card>
          <div className="prohead">
            <span className="big" aria-hidden="true">{name.slice(0, 2)}</span>
            <div>
              <h1>{name}</h1>
              <span className="role">{me ? roleLabel(me.role) : ""}</span>
            </div>
          </div>
          <div className="read">
            <dl>
              <dt>이름</dt>
              <dd>{name}</dd>
              {affiliations.map((row) => (
                <div className="afrow" key={row.teamName}>
                  <dt>{row.teamName}</dt>
                  <dd>{row.text}</dd>
                </div>
              ))}
            </dl>
            <p className="note">
              정보를 고치는 통로가 아직 없어 보여주기만 합니다.
            </p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
