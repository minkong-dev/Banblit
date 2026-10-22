import { useNavigate, useParams } from "react-router-dom";

import { Empty } from "../components/controls";
import { Tabs } from "../components/Layout";
import { Card } from "../components/Layout";
import { PostDetail, PostListPanel, usePostBoard } from "../components/PostBoard";
import { can } from "../lib/account";
import { loadState } from "../lib/loading";
import { readableBoards } from "../lib/boards";
import { teamPostsPath, useMe, useMyTeams, useTeams } from "../components/queries";

import "../styles/board.css";

/** 팀 게시판입니다. 내가 속한 팀의 글을 보며, board_read_all 이 있으면 모든 팀의 글을 봅니다. 팀이 2개 이상이면
 *  탭(화면 안에서 구역을 변경하는 선택 항목)으로 선택합니다. 선택한 팀은 주소의 :teamId 가 정합니다(/board/:teamId). 없으면 첫 팀입니다. */
export function Board() {
  const { me } = useMe();
  const teams = useTeams();
  const mine = useMyTeams();
  const navigate = useNavigate();
  const { teamId } = useParams();
  const boards = readableBoards(mine, teams.data?.teams ?? [], can(me, "board_read_all"));
  const current = boards.find((team) => String(team.id) === teamId) ?? boards[0];
  const state = loadState(teams);

  return (
    <>
      {state.kind !== "ready" || boards.length === 0 ? (
        <div className="main"><Empty as="div" state={state} text="소속된 팀이 존재하지 않아요" /></div>
      ) : (
        <>
          {boards.length > 1 ? (
            <Tabs
              label="팀"
              items={boards.map((team) => ({ key: String(team.id), text: team.name }))}
              selected={String(current.id)}
              onSelect={(key) => void navigate(`/board/${key}`)}
            />
          ) : null}
          {/* key 는 팀을 변경할 때 page 번호와 포커스 상태를 초기화합니다. */}
          <TeamBoard key={current.id} teamId={current.id} teamName={current.name} member={current.member} meId={me?.id ?? null} canModerate={can(me, "board_moderate")} />
        </>
      )}
    </>
  );
}

/** 팀 1개의 게시판입니다. 주소에 글 번호가 있으면 그 글의 상세를, 없으면 팀 글 목록을 표시합니다. member 가 false 이면 글과 댓글을 작성할 수 없습니다. */
function TeamBoard({ teamId, teamName, member, meId, canModerate }: { teamId: number; teamName: string; member: boolean; meId: number | null; canModerate: boolean }) {
  const listPath = teamPostsPath(teamId);
  const { focus, listKey, backToList } = usePostBoard(`/board/${teamId}`, listPath);
  return (
    <div className="main">
      <Card>
        {focus.openId === null ? (
          <PostListPanel
            title={teamName}
            hint="해당 팀에 소속된 멤버와 전체 팀 게시판 조회 권한이 있는 멤버만 볼 수 있어요"
            listPath={listPath}
            newPath={`/board/${teamId}/new`}
            canWrite={member}
            emptyText="아직 등록된 글이 존재하지 않아요"
            onOpen={focus.open}
            buttonRef={focus.register}
          />
        ) : (
          <PostDetail postId={focus.openId} authorId={meId} canModerate={canModerate} canComment={member} listKey={listKey} heading={focus.openFocus} onBack={backToList} />
        )}
      </Card>
    </div>
  );
}

/** 공지사항입니다. 주소에 글 번호가 있으면 그 글의 상세를, 없으면 전체 공개 글 목록을 표시합니다. */
export function Notices() {
  const { me } = useMe();
  const { focus, listKey, backToList } = usePostBoard("/notices", "/notices");

  return (
    <div className="main">
      <Card>
        {focus.openId === null ? (
          <PostListPanel
            title="공지사항"
            hint="전체 공개"
            listPath="/notices"
            newPath="/notices/new"
            canWrite={can(me, "notice_write")}
            emptyText="아직 등록된 공지가 존재하지 않아요."
            onOpen={focus.open}
            buttonRef={focus.register}
          />
        ) : (
          <PostDetail
            postId={focus.openId}
            authorId={me?.id ?? null}
            canModerate={can(me, "board_moderate")}
            listKey={listKey}
            heading={focus.openFocus}
            onBack={backToList}
          />
        )}
      </Card>
    </div>
  );
}
