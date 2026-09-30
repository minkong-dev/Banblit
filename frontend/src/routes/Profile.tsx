import { useQueries } from "@tanstack/react-query";

import { reason } from "../lib/api";
import { loadTeamMembers } from "../lib/pipeline";
import { cohortLabel } from "../lib/roster";
import { useMe } from "../components/queries";
import { LOADING_TEXT, stateText } from "../lib/loading";
import "../styles/profile.css";
import type { Account, Member } from "../lib/contract";
import { ProfileCard } from "./ProfileCards";

/** 프로필 카드가 소속 팀 줄에 표시하는 값입니다. teamName 은 팀 이름, text 는 그 팀에서의 기수입니다. */
type Affiliation = { teamName: string; text: string };

/** 소속 팀마다 내가 맡은 포지션을 한 줄로 반환합니다. 실패한 팀은 사유를 그 줄에 남깁니다. */
function useMyAffiliations(
  me: Account | null,
  teamIds: number[],
  teams: { id: number; name: string }[],
): Affiliation[] {
  const teamName = (id: number): string =>
    teams.find((team) => team.id === id)?.name ?? "이름 없는 팀";

  const memberQueries = useQueries({
    queries: teamIds.map((id) => ({
      queryKey: ["members", id],
      queryFn: () => loadTeamMembers(id),
    })),
  });

  /** 명단에서 찾은 나입니다. 기수를 표시합니다. 찾지 못했거나 기수가 없을 경우 그 사유를 표시합니다. */
  function cohortText(mine: Member | undefined): string {
    if (mine === undefined) return "멤버 리스트에서 찾지 못했어요";
    return cohortLabel(mine.cohort);
  }

  return memberQueries.map((query, index) => {
    const id = teamIds[index] ?? 0;
    if (query.isPending) return { teamName: teamName(id), text: LOADING_TEXT };
    if (query.isError) return { teamName: teamName(id), text: reason(query.error) };
    const mine = me === null ? undefined : query.data.find((member) => member.id === me.id);
    return { teamName: teamName(id), text: cohortText(mine) };
  });
}

/** 프로필을 표시하고 수정합니다. 카드 하나가 평소에는 값을 표시하고, 오른쪽 위 편집을 누르면 입력칸으로 전환합니다.
 *  테마는 상단바의 버튼이 전환합니다. */
export function Profile() {
  const { me, meState, teamIds, teams } = useMe();
  const affiliations = useMyAffiliations(me, teamIds, teams);
  // meState 로 구분하지 않으면 조회가 실패해도 "불러오는 중…" 이 그대로 남아 사용자가
  // 기다리기만 합니다. 세 번째 인자는 stateText 의 ready 분기용이며 실제로는 도달하지 않습니다.
  if (me === null) {
    return <div className="main"><div className="empty">{stateText(meState, "로그인이 필요해요.")}</div></div>;
  }

  const rows = [
    { label: "아이디", text: me.login_id ?? "" },
    { label: "이메일", text: me.email },
    { label: "기수", text: cohortLabel(me.cohort) },
    ...affiliations.map((row) => ({ label: row.teamName, text: row.text })),
  ];
  return <div className="main"><ProfileCard me={me} rows={rows} /></div>;
}
