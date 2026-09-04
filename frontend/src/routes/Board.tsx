import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AppShell, ProfileMenu, Tabs } from "../components/AppShell";
import { PostBoard } from "../components/PostBoard";
import { getJSON } from "../lib/api";
import { useMe } from "../components/hooks";
import { useToast } from "../components/hooks";
import "../styles/board.css";
import type { Team } from "../lib/contract";
import { roleLabel } from "../lib/account";

type MyTeam = Team & { colorKey: string };

function reason(error: unknown): string {
  return error instanceof Error ? error.message : "불러오지 못했습니다";
}

/** 내가 속한 팀만 고르고, 전체 목록 안에서의 자리로 색을 매긴다(스케줄러와 같은 규칙). */
function myTeams(teams: Team[], mine: number[]): MyTeam[] {
  return teams
    .map((team, index) => ({ ...team, colorKey: `c${(index % 4) + 1}` }))
    .filter((team) => mine.includes(team.id));
}

/** 팀 게시판 — 내가 속한 팀의 글만 본다. 팀이 여럿이면 탭으로 고른다. */
export function Board() {
  const { message, say } = useToast();
  const { me, teamIds, teams: allTeams } = useMe();
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: () => getJSON<{ teams: Team[] }>("/teams"),
  });
  const mine = myTeams(allTeams, teamIds);
  const [teamId, setTeamId] = useState<string | null>(null);
  const current = mine.find((team) => String(team.id) === teamId) ?? mine[0];

  return (
    <AppShell
      page="board"
      current="board"
      toast={message}
      profile={
        <ProfileMenu
          name={me?.name ?? ""}
          sub={me ? `${roleLabel(me.role)} · 2026년 입부` : ""}
          teams={mine}
        />
      }
    >
      {teams.isPending ? (
        <div className="main"><div className="empty">불러오는 중…</div></div>
      ) : teams.isError ? (
        <div className="main"><div className="empty">{reason(teams.error)}</div></div>
      ) : mine.length === 0 ? (
        <div className="main"><div className="empty">소속된 팀이 없습니다</div></div>
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
              hint="이 팀 소속만 볼 수 있습니다"
              listPath={`/teams/${current.id}/posts`}
              writePath={`/teams/${current.id}/posts`}
              authorId={me?.id ?? null}
              writeNote={`${current.name} 소속만 쓸 수 있습니다.`}
              emptyText="아직 등록된 글이 없습니다"
              onSay={say}
            />
          </div>
        </>
      )}
    </AppShell>
  );
}
