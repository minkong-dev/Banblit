import { Card } from "../components/Layout";
import { PostDetail, PostListPanel, usePostBoard } from "../components/PostBoard";
import { useMe } from "../components/queries";
import { can } from "../lib/account";

import "../styles/board.css";

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
            emptyText="아직 등록된 공지가 없어요."
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
