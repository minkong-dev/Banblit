import { AppShell } from "../components/AppShell";
import { PostBoard } from "../components/PostBoard";
import { useMe } from "../components/hooks";

import "../styles/board.css";
import { can } from "../lib/account";

/** 공지사항 — 전체 공개 글 목록과 상세. 팀 게시판과 같은 틀(board.css·PostBoard)을 쓴다. */
export function Notices() {
  const { me } = useMe();

  return (
    <AppShell
      page="board"
      current="notice"
    >
      <div className="main">
        <PostBoard
          title="공지사항"
          hint="전체 공개"
          listPath="/notices"
          writePath="/notices"
          authorId={me?.id ?? null}
          canWrite={can(me, "notice_write")}
          writeNote="공지 작성 권한이 있는 사람만 작성이 가능해요."
          emptyText="아직 등록된 공지가 없어요."
        />
      </div>
    </AppShell>
  );
}
