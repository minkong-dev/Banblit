import { useState } from "react";

import { AppShell, Tabs } from "../components/AppShell";
import { PostBoard } from "../components/PostBoard";
import { reason } from "../lib/api";
import { useMe, useMyTeams, useTeams } from "../components/hooks";

import "../styles/board.css";

/** 팀 게시판 — 내가 속한 팀의 글만 본다. 팀이 여럿이면 탭으로 고른다. */
export function Board() {
  const { me } = useMe();
  const teams = useTeams();
  const mine = useMyTeams();
  const [teamId, setTeamId] = useState<string | null>(null);
  const current = mine.find((team) => String(team.id) === teamId) ?? mine[0];

  return (
    <AppShell
      page="board"
      current="board"
    >
      {teams.isPending ? (
        <div className="main"><div className="empty">불러오는 중…</div></div>
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
              writePath={`/teams/${current.id}/posts`}
              authorId={me?.id ?? null}
              canWrite
              writeNote={`${current.name} 팀에 소속된 멤버만 쓸 수 있어요.`}
              emptyText="아직 등록된 글이 없어요"
            />
          </div>
        </>
      )}
    </AppShell>
  );
}
