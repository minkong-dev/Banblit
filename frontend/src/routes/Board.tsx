import { useNavigate, useParams } from "react-router-dom";

import { Empty } from "../components/controls";
import { Tabs } from "../components/Layout";
import { PostBoard } from "../components/PostBoard";
import { can } from "../lib/account";
import { loadState } from "../lib/loading";
import { useMe, useMyTeams, useTeams } from "../components/queries";

import "../styles/board.css";

/** 팀 게시판입니다. 내가 속한 팀의 글만 보며, 팀이 2개 이상이면 탭(화면 안에서 구역을 변경하는 선택 항목)으로 선택합니다.
 *  선택한 팀은 주소의 :teamId 가 정합니다(/board/:teamId). 없으면 첫 팀입니다. */
export function Board() {
  const { me } = useMe();
  const teams = useTeams();
  const mine = useMyTeams();
  const navigate = useNavigate();
  const { teamId } = useParams();
  const current = mine.find((team) => String(team.id) === teamId) ?? mine[0];
  const state = loadState(teams);

  return (
    <>
      {state.kind !== "ready" || mine.length === 0 ? (
        <div className="main"><Empty as="div" state={state} text="소속된 팀이 없어요" /></div>
      ) : (
        <>
          {mine.length > 1 ? (
            <Tabs
              label="내 팀"
              items={mine.map((team) => ({ key: String(team.id), text: team.name }))}
              selected={String(current.id)}
              onSelect={(key) => void navigate(`/board/${key}`)}
            />
          ) : null}
          <div className="main">
            <PostBoard
              key={current.id}
              title={current.name}
              hint="해당 팀에 소속된 멤버만 볼 수 있어요"
              listPath={`/teams/${current.id}/posts`}
              newPath={`/board/${current.id}/new`}
              basePath={`/board/${current.id}`}
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
