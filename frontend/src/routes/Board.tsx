import { useNavigate, useParams } from "react-router-dom";

import { Empty } from "../components/controls";
import { Tabs } from "../components/Layout";
import { Card } from "../components/Layout";
import { PostDetail, PostListPanel, usePostBoard } from "../components/PostBoard";
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
          {/* key 는 팀을 바꿀 때 쪽 번호와 초점 상태를 새로 시작합니다. */}
          <TeamBoard key={current.id} teamId={current.id} teamName={current.name} meId={me?.id ?? null} canModerate={can(me, "board_moderate")} />
        </>
      )}
    </>
  );
}

/** 팀 1개의 게시판입니다. 주소에 글 번호가 있으면 그 글의 상세를, 없으면 팀 글 목록을 표시합니다. 팀 소속 멤버는 모두 글을 씁니다. */
function TeamBoard({ teamId, teamName, meId, canModerate }: { teamId: number; teamName: string; meId: number | null; canModerate: boolean }) {
  const listPath = `/teams/${teamId}/posts`;
  const { focus, listKey, backToList } = usePostBoard(`/board/${teamId}`, listPath);
  return (
    <div className="main">
      <Card>
        {focus.openId === null ? (
          <PostListPanel
            title={teamName}
            hint="해당 팀에 소속된 멤버만 볼 수 있어요"
            listPath={listPath}
            newPath={`/board/${teamId}/new`}
            canWrite
            emptyText="아직 등록된 글이 없어요"
            onOpen={focus.open}
            buttonRef={focus.register}
          />
        ) : (
          <PostDetail postId={focus.openId} authorId={meId} canModerate={canModerate} listKey={listKey} heading={focus.openFocus} onBack={backToList} />
        )}
      </Card>
    </div>
  );
}
