// 게시판 부품입니다. 글 목록 패널과 글 상세를 공지사항(routes/Notices)과 팀 게시판(routes/Board)이 함께 씁니다. 둘 중 무엇을 표시할지는 routes 가 결정합니다.
// 작성 form 은 자기 주소를 가진 화면(routes/PostWrite)이 맡고, 첨부, 댓글, 조치 부품은 Post*.tsx 가 각각 담당합니다.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type { Post } from "../lib/contract";
import { loadState } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import { clampPage, pageCount, pageSlice } from "../lib/paging";
import { BackButton, Button, EditButton, Empty, Pager } from "./controls";
import { SectionHead } from "./Layout";
import { idParam, useReturnFocus } from "./hooks";
import { AttachmentList } from "./PostAttachments";
import { BlindPost, EditPost, RemovePost } from "./PostActions";
import { CommentForm, CommentRow } from "./PostComments";
import { RichTextView } from "./RichText";
import { boardActions } from "../lib/boards";
import { loadPost, loadPosts } from "../lib/pipeline";
import { stampLabel } from "../lib/calendar";
import { boardListKey, postKey } from "./queries";

/** 글 목록을 렌더합니다. 비어 있거나 로딩 중이어도 컨테이너는 유지합니다.
 *  컨테이너 높이를 측정해 한 page(페이지)에 표시할 글 개수를 계산하므로,
 *  컨테이너가 사라지면 측정할 수 없습니다. */
function PostList(props: {
  posts: Post[];
  state: LoadState;
  emptyText: string;
  onOpen: (id: number) => void;
  buttonRef: (id: number) => (el: HTMLButtonElement | null) => void;
}) {
  const { posts, state, emptyText, onOpen, buttonRef } = props;
  return (
    <ul className="rows">
      {state.kind !== "ready" || posts.length === 0 ? (
        <Empty as="li" state={state} text={emptyText} />
      ) : (
        posts.map((post) => (
          <li key={post.id}>
            <button className="postrow" ref={buttonRef(post.id)} onClick={() => onOpen(post.id)}>
              <b>{post.title}</b>
              <span className="meta">{post.author} {stampLabel(post.created_at)}</span>
            </button>
            <span className="cnt">댓글 {post.comment_count}</span>
          </li>
        ))
      )}
    </ul>
  );
}

export function PostDetail(props: {
  postId: number;
  /** 현재 사용자의 id. 미인증(로그인 전)이면 null이므로 글과 댓글을 작성할 수 없습니다. */
  authorId: number | null;
  /** board_moderate 권한 여부. 다른 사용자의 글·댓글·attachment 에도 삭제 버튼이 표시됩니다. */
  canModerate: boolean;
  /** false 이면 댓글 입력칸을 표시하지 않습니다. 기본값은 true 입니다. */
  canComment?: boolean;
  /** 글 삭제 후 갱신해야 하는 목록의 queryKey 입니다. */
  listKey: readonly unknown[];
  heading: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
}) {
  const { postId, authorId, canModerate, canComment = true, listKey, heading, onBack } = props;
  const [editing, setEditing] = useState(false);
  const detail = useQuery({
    queryKey: postKey(postId),
    // attachment 들은 글 상세 조회 response(응답)에 포함되므로 따로 요청하지 않습니다.
    // 서버 정의는 `backend/src/backend/api/schemas.py` 의 `PostDetailOut` 를 참조합니다.
    queryFn: () => loadPost(postId),
  });
  // 제목은 상세를 받은 뒤에 그려지므로, 받은 시점에 제목으로 초점을 옮깁니다. 다시 조회해도 isSuccess 가 그대로라 초점을 빼앗지 않습니다.
  const loaded = detail.isSuccess;
  useEffect(() => {
    if (loaded) heading.current?.focus();
  }, [loaded, heading]);

  // isSuccess 로 분기해야 TypeScript 가 아래에서 detail.data 를 undefined 없이 좁혀줍니다.
  // loadState(detail).kind === "ready" 는 같은 조건이지만 별개 값이라 좁히지 못합니다.
  if (!detail.isSuccess) return <Empty as="div" state={loadState(detail)} text="" />;

  const { post, comments, attachments } = detail.data;
  const { canEdit, canDelete } = boardActions(post.author_id, authorId, canModerate);

  return (
    <div className="thread">
      <div className="threadtop">
        <BackButton label="목록으로" onClick={onBack} />
        {!canEdit && !canDelete && !canModerate ? null : (
          <span className="acts">
            {!canEdit ? null : <EditButton label="글 수정" onClick={() => setEditing(true)} />}
            {!canModerate ? null : <BlindPost postId={post.id} listKey={listKey} onDone={onBack} />}
            {!canDelete ? null : <RemovePost postId={post.id} listKey={listKey} onDone={onBack} />}
          </span>
        )}
      </div>
      <h2 tabIndex={-1} ref={heading}>{post.title}</h2>
      <p className="meta">{post.author} {stampLabel(post.created_at)}</p>
      <div className="threadbody"><RichTextView html={post.body} /></div>

      <AttachmentList
        postId={post.id}
        attachments={attachments}
        canRemove={canDelete}
      />

      <div className="comments">
        <p className="cap2">댓글 {comments.length}개</p>
        {comments.length === 0 ? (
          <Empty text="아직 댓글이 없어요" />
        ) : (
          <ul>
            {comments.map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                {...boardActions(comment.author_id, authorId, canModerate)}
                postId={post.id}
              />
            ))}
          </ul>
        )}
      </div>

      {canComment ? <CommentForm postId={post.id} authorId={authorId} /> : null}

      {!editing ? null : (
        <EditPost post={post} listKey={listKey} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

/** 게시판 화면의 열린 글과 초점 되돌리기입니다. 열린 글은 주소의 :postId 가 정합니다(/notices/:postId, /board/:teamId/:postId).
 *  글을 열면 기록을 추가하고 닫으면 replace 로 대체합니다. 닫은 뒤 뒤로 가기가 닫은 글을 다시 열지 않습니다.
 *  backToList 는 목록을 다시 조회하고 그 글의 목록 버튼으로 초점을 되돌립니다. 댓글 수가 바뀌었을 수 있기 때문입니다. */
export function usePostBoard(basePath: string, listPath: string) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { postId } = useParams();
  const listKey = boardListKey(listPath);
  const focus = useReturnFocus<HTMLHeadingElement>({
    openId: idParam(postId),
    setOpenId: (id) => void (id === null ? navigate(basePath, { replace: true }) : navigate(`${basePath}/${id}`)),
  });
  const backToList = (): void => {
    void client.invalidateQueries({ queryKey: listKey });
    focus.close();
  };
  return { focus, listKey, backToList };
}

/** 게시판 글 목록 패널입니다. 쪽 넘김과 글쓰기 버튼을 함께 표시합니다. 공지사항과 팀 게시판이 listPath, newPath 만 달리 씁니다. */
export function PostListPanel(props: {
  title: string;
  hint: string;
  listPath: string;
  /** 글쓰기 버튼이 여는 작성 페이지의 주소입니다. */
  newPath: string;
  /** 글쓰기 버튼을 표시할지 여부입니다. 공지사항은 notice_write 권한자, 팀 게시판은 팀 소속 멤버입니다. */
  canWrite: boolean;
  emptyText: string;
  onOpen: (id: number) => void;
  buttonRef: (id: number) => (el: HTMLButtonElement | null) => void;
}) {
  const { title, hint, listPath, newPath, canWrite, emptyText, onOpen, buttonRef } = props;
  const [page, setPage] = useState(1);
  const posts = useQuery({ queryKey: boardListKey(listPath), queryFn: async () => ({ posts: await loadPosts(listPath) }) });
  const list = posts.data?.posts ?? [];
  const state = loadState(posts);
  // 글이 삭제되어 현재 page 가 범위를 벗어날 수 있어 렌더마다 유효한 page 로 제한합니다. 한 쪽에 PER_PAGE(10)개입니다(lib/paging).
  const pages = pageCount(list.length);
  const shownPage = clampPage(page, pages);

  return (
    <>
      <SectionHead title={title} desc={hint} />
      <PostList posts={pageSlice(list, shownPage)} state={state} emptyText={emptyText} onOpen={onOpen} buttonRef={buttonRef} />
      {/* 쪽 넘김과 글쓰기 버튼이 한 줄입니다. 쪽이 1개여도 쪽 넘김을 그려, 글 수가 바뀔 때 글쓰기 버튼이 움직이지 않습니다. */}
      <div className="listfoot">
        {state.kind !== "ready" || list.length === 0 ? null : <Pager page={shownPage} pages={pages} onPage={setPage} />}
        {/* 작성은 이 목록이 아니라 자기 주소를 가진 화면이 맡습니다(routes/PostWrite). */}
        {!canWrite ? null : <Button kind="go" to={newPath}>글쓰기</Button>}
      </div>
    </>
  );
}
