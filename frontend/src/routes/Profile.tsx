import { useQueries } from "@tanstack/react-query";

import { AppShell, Card } from "../components/AppShell";
import { getJSON, reason } from "../lib/api";
import { cohortLabel } from "../lib/roster";
import { useMe } from "../components/queries";
import "../styles/profile.css";
import type { Account, Member } from "../lib/contract";
import { roleLabel } from "../lib/account";



/** 소속 팀마다 내가 맡은 포지션을 한 줄로 반환합니다. 실패한 팀은 사유를 그 줄에 남깁니다. */
function useMyAffiliations(me: Account | null, teamIds: number[], teams: { id: number; name: string }[]) {
  const teamName = (id: number): string =>
    teams.find((team) => team.id === id)?.name ?? "이름 없는 팀";

  const memberQueries = useQueries({
    queries: teamIds.map((id) => ({
      queryKey: ["members", id],
      queryFn: () => getJSON<{ members: Member[] }>(`/teams/${id}/members`),
    })),
  });

  /** 명단에서 찾은 나입니다. 기수를 표시합니다. 찾지 못했거나 기수가 없을 경우 그 사유를 표시합니다. */
  function cohortText(mine: Member | undefined): string {
    if (mine === undefined) return "멤버 리스트에서 찾지 못했어요";
    return cohortLabel(mine.cohort);
  }

  return memberQueries.map((query, index) => {
    const id = teamIds[index] ?? 0;
    if (query.isPending) return { teamName: teamName(id), text: "불러오는 중…" };
    if (query.isError) return { teamName: teamName(id), text: reason(query.error) };
    const mine = me === null ? undefined : query.data.members.find((member) => member.id === me.id);
    return { teamName: teamName(id), text: cohortText(mine) };
  });
}

/** 프로필을 표시합니다. 내 이름과 소속 팀별 포지션을 표시합니다. 수정하는 endpoint(API의 요청 주소 단위)는 미구현입니다. */
export function Profile() {
  const { me, teamIds, teams } = useMe();
  const affiliations = useMyAffiliations(me, teamIds, teams);
  const name = me?.name ?? "";

  return (
    <AppShell
      page="profile"
    >
      <div className="main">
        <Card>
          <div className="prohead">
            <span className="big" aria-hidden="true">{name.slice(0, 2)}</span>
            <div>
              <h1>{name}</h1>
              <span className="role">{roleLabel(me)}</span>
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
              정보 수정은 설정 탭에서 진행해주세요.
            </p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
