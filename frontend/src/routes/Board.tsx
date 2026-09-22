import { useState } from "react";

import { Tabs } from "../components/AppShell";
import { PostBoard } from "../components/PostBoard";
import { can } from "../lib/account";
import { reason } from "../lib/api";
import { LOADING_TEXT } from "../lib/loading";
import { useMe, useMyTeams, useTeams } from "../components/queries";

import "../styles/board.css";

/** 팀 게시판입니다. 내가 속한 팀의 글만 보며, 팀이 2개 이상이면 탭(화면 안에서 구역을 변경하는 선택 항목)으로 선택합니다. */
export function Board() {
  const { me } = useMe();
  const teams = useTeams();
  const mine = useMyTeams();
  const [teamId, setTeamId] = useState<string | null>(null);
  const current = mine.find((team) => String(team.id) === teamId) ?? mine[0];

  return (
    <>
      {teams.isPending ? (
        <div className="main"><div className="empty">{LOADING_TEXT}</div></div>
      ) : teams.isError ? (
        <div className="main"><div className="empty">{reason(teams.error)}</div></div>
      ) : mine.length === 0 ? (
        <div className="main"><div className="empty">소속된 팀이 없어요</div></div>
      ) : (
        <>
          {mine.length > 1 ? (
            <Tabs
              label="내 팀"
              items={mine.map((team) => ({ key: String(team.id), text: team.name }))}
              selected={String(current.id)}
              onSelect={setTeamId}
            />
          ) : null}
          <div className="main">
            <PostBoard
              key={current.id}
              title={current.name}
              hint="해당 팀에 소속된 멤버만 볼 수 있어요"
              listPath={`/teams/${current.id}/posts`}
              newPath={`/board/${current.id}/new`}
              authorId={me?.id ?? null}
              canWrite
              canModerate={can(me, "board_moderate")}
              emptyText="아직 등록된 글이 없어요"
            />
          </div>
        </>
      )}
    </>
  );
}
