import { useQueries } from "@tanstack/react-query";

import { getJSON, reason } from "../lib/api";
import { cohortLabel } from "../lib/roster";
import { useMe } from "../components/queries";
import { LOADING_TEXT } from "../lib/loading";
import "../styles/profile.css";
import type { Account, Member } from "../lib/contract";
import { ProfileCard } from "./ProfileCards";



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
    if (query.isPending) return { teamName: teamName(id), text: LOADING_TEXT };
    if (query.isError) return { teamName: teamName(id), text: reason(query.error) };
    const mine = me === null ? undefined : query.data.members.find((member) => member.id === me.id);
    return { teamName: teamName(id), text: cohortText(mine) };
  });
}

/** 프로필을 표시하고 수정합니다. 카드 하나가 평소에는 값을 표시하고, 오른쪽 위 편집을 누르면 입력칸으로 전환합니다.
 *  테마는 상단바의 버튼이 전환합니다. 2026-09-23 에 설정 화면의 계정 탭을 이 화면으로 옮겼습니다. */
export function Profile() {
  const { me, teamIds, teams } = useMe();
  const affiliations = useMyAffiliations(me, teamIds, teams);
  if (me === null) return <div className="main"><div className="empty">{LOADING_TEXT}</div></div>;

  const rows = [
    { label: "아이디", text: me.login_id ?? "" },
    { label: "이메일", text: me.email },
    { label: "기수", text: cohortLabel(me.cohort) },
    ...affiliations.map((row) => ({ label: row.teamName, text: row.text })),
  ];
  return <div className="main"><ProfileCard me={me} rows={rows} /></div>;
}
