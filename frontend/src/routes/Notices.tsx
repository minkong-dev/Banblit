import { PostBoard } from "../components/PostBoard";
import { useMe } from "../components/queries";

import "../styles/board.css";
import { can } from "../lib/account";

/** 공지사항입니다. 전체 공개 글 목록과 상세를 표시합니다. 팀 게시판과 같은 구조(board.css 와 PostBoard 컴포넌트)를 사용합니다. */
export function Notices() {
  const { me } = useMe();

  return (
    <>
      <div className="main">
        <PostBoard
          title="공지사항"
          hint="전체 공개"
          listPath="/notices"
          newPath="/notices/new"
          authorId={me?.id ?? null}
          canWrite={can(me, "notice_write")}
          canModerate={can(me, "board_moderate")}
          emptyText="아직 등록된 공지가 없어요."
        />
      </div>
    </>
  );
}
