// 게시판 화면입니다. 글 목록과 상세를 한 카드 안에서 전환합니다. 공지사항과 팀 게시판이 함께 사용합니다.
// 작성 form 은 자기 주소를 가진 화면(routes/PostWrite)이 맡고, 첨부·댓글·조치 부품은 Post*.tsx 가 각각 담당합니다.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { Link } from "react-router-dom";

import { reason } from "../lib/api";
import type { Attachment, Post, PostComment } from "../lib/contract";
import { loadState, stateText } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import { clampPage, pageCount, pageSlice } from "../lib/paging";
import { boardActions, boardListKey, getJSON, stampLabel } from "../lib/pipeline";
import { Card } from "./AppShell";
import { useFitCount } from "./hooks";
import { PencilIcon } from "./icons";
import { Pager } from "./Pager";
import { AttachmentList } from "./PostAttachments";
import { BlindPost, EditPost, RemovePost } from "./PostActions";
import { CommentForm, CommentRow } from "./PostComments";
import { RichTextView } from "./RichText";




/** focus(키보드 입력을 받는 요소 상태)를 관리합니다: 목록에서 상세 글로 이동할 때 제목으로,
 *  목록으로 돌아올 때 눌렀던 글 버튼으로 옮깁니다. */
function useDetailFocus(): {
  openId: number | null;
  open: (id: number) => void;
  back: () => void;
  register: (id: number) => (el: HTMLButtonElement | null) => void;
  heading: RefObject<HTMLHeadingElement | null>;
} {
  const [openId, setOpenId] = useState<number | null>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const backTo = useRef<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (openId === null) {
      if (backTo.current === null) return;
      buttons.current.get(backTo.current)?.focus();
      backTo.current = null;
    } else {
      heading.current?.focus();
    }
  }, [openId]);

  return {
    openId,
    open: (id) => setOpenId(id),
    back: () => {
      backTo.current = openId;
      setOpenId(null);
    },
    register: (id) => (el) => {
      if (el === null) buttons.current.delete(id);
      else buttons.current.set(id, el);
    },
    heading,
  };
}

/** 글 목록을 렌더합니다. 비어 있거나 로딩 중이어도 컨테이너는 유지합니다.
 *  컨테이너 높이를 측정해 한 page(페이지)에 표시할 글 개수를 계산하므로,
 *  컨테이너가 사라지면 측정할 수 없습니다. */
function PostList(props: {
  posts: Post[];
  state: LoadState;
  emptyText: string;
  onOpen: (id: number) => void;
  buttonRef: (id: number) => (el: HTMLButtonElement | null) => void;
  boxRef: RefObject<HTMLUListElement | null>;
}) {
  const { posts, state, emptyText, onOpen, buttonRef, boxRef } = props;
  return (
    <ul className="rows" ref={boxRef}>
      {state.kind !== "ready" || posts.length === 0 ? (
        <li className="empty">{stateText(state, emptyText)}</li>
      ) : (
        posts.map((post) => (
          <li key={post.id}>
            <button className="postrow" ref={buttonRef(post.id)} onClick={() => onOpen(post.id)}>
              <b>{post.title}</b>
              <span className="meta">{post.author} · {stampLabel(post.created_at)}</span>
            </button>
            <span className="cnt">댓글 {post.comment_count}</span>
          </li>
        ))
      )}
    </ul>
  );
}

function PostDetail(props: {
  postId: number;
  /** 현재 사용자의 id. 미인증(로그인 전)이면 null이므로 글과 댓글을 작성할 수 없습니다. */
  authorId: number | null;
  /** board_moderate 권한 여부. 다른 사용자의 글·댓글·attachment 에도 삭제 버튼이 표시됩니다. */
  canModerate: boolean;
  /** 글 삭제 후 갱신해야 하는 목록의 queryKey 입니다. */
  listKey: readonly unknown[];
  heading: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
}) {
  const { postId, authorId, canModerate, listKey, heading, onBack } = props;
  const [editing, setEditing] = useState(false);
  const detail = useQuery({
    queryKey: ["board", "post", postId],
    // attachment 들은 글 상세 조회 response(응답)에 포함되므로 따로 요청하지 않습니다.
    // 서버 정의는 `backend/src/backend/api/schemas.py` 의 `PostDetailOut` 를 참조합니다.
    queryFn: () =>
      getJSON<{ post: Post; comments: PostComment[]; attachments: Attachment[] }>(
        `/posts/${postId}`,
      ),
  });

  if (detail.isPending) return <div className="empty">불러오는 중…</div>;
  if (detail.isError) return <div className="empty">{reason(detail.error)}</div>;

  const { post, comments, attachments } = detail.data;
  const { canEdit, canDelete } = boardActions(post.author_id, authorId, canModerate);

  return (
    <div className="thread">
      <div className="threadtop">
        <button className="back" onClick={onBack}>‹ 목록으로</button>
        {!canEdit && !canDelete && !canModerate ? null : (
          <span className="acts">
            {!canEdit ? null : (
              <button className="ic" aria-label="글 수정" onClick={() => setEditing(true)}>
                <PencilIcon />
              </button>
            )}
            {!canModerate ? null : <BlindPost postId={post.id} listKey={listKey} onDone={onBack} />}
            {!canDelete ? null : <RemovePost postId={post.id} listKey={listKey} onDone={onBack} />}
          </span>
        )}
      </div>
      <h2 tabIndex={-1} ref={heading}>{post.title}</h2>
      <p className="meta">{post.author} · {stampLabel(post.created_at)}</p>
      <div className="threadbody"><RichTextView html={post.body} /></div>

      <AttachmentList
        postId={post.id}
        attachments={attachments}
        canRemove={canDelete}
      />

      <div className="comments">
        <p className="cap2">댓글 {comments.length}개</p>
        {comments.length === 0 ? (
          <p className="empty">아직 댓글이 없습니다</p>
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

      <CommentForm postId={post.id} authorId={authorId} />

      {!editing ? null : (
        <EditPost post={post} listKey={listKey} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

/** 글 목록, 상세 보기, 작성 폼, 댓글 작성을 통합한 게시판 컴포넌트입니다.
 *  공지사항 화면과 팀별 게시판이 이 컴포넌트를 재사용하며, listPath 와 writePath 만 달라집니다. */
export function PostBoard(props: {
  title: string;
  hint: string;
  listPath: string;
  /** 글쓰기 버튼이 여는 작성 페이지의 주소입니다. */
  newPath: string;
  /** 현재 사용자의 id. 미인증(로그인 전)이면 null이므로 글과 댓글을 작성할 수 없습니다. */
  authorId: number | null;
  /** 글쓰기 버튼을 표시할지 여부입니다. 공지사항은 notice_write 권한이 있는 사람만,
   *  팀 게시판은 팀에 소속한 사람만 글을 작성할 수 있습니다. */
  canWrite: boolean;
  /** board_moderate 권한 여부. 다른 사용자의 글·댓글·attachment 에도 삭제 버튼이 표시됩니다. */
  canModerate: boolean;
  emptyText: string;
}) {
  const { title, hint, listPath, newPath, authorId, canWrite, canModerate, emptyText } = props;
  const queryKey = boardListKey(listPath);
  const focus = useDetailFocus();
  const client = useQueryClient();
  const [page, setPage] = useState(1);

  const posts = useQuery({
    queryKey,
    queryFn: () => getJSON<{ posts: Post[] }>(listPath),
  });
  const list = posts.data?.posts ?? [];
  const state = loadState(posts);
  // 컨테이너 높이에 따라 한 page(페이지)에 표시할 글 개수를 계산합니다.
  // 수직 스크롤 없이 pagination(페이지네이션) 버튼으로 이동합니다.
  const [box, perPage] = useFitCount(76);
  // 글이 삭제되어 현재 page 가 범위를 벗어날 수 있으므로,
  // render 마다 유효한 page 로 clamp(제한)합니다.
  const pages = pageCount(list.length, perPage);
  const shownPage = clampPage(page, pages);
  const shown = pageSlice(list, shownPage, perPage);

  // 목록으로 돌아올 때 query 를 invalidate(갱신 대기 상태로 표시)합니다.
  // 댓글을 추가하고 돌아오면 목록의 댓글 개수도 최신 상태로 반영되어야 합니다.
  const backToList = (): void => {
    void client.invalidateQueries({ queryKey });
    focus.back();
  };

  return (
    <Card>
      {focus.openId === null ? (
        <>
          <div className="sethead">
            <b>{title}</b>
            <span>{hint}</span>
          </div>
          <PostList
            posts={shown}
            state={state}
            emptyText={emptyText}
            onOpen={focus.open}
            buttonRef={focus.register}
            boxRef={box}
          />

          {/* Pagination 과 글쓰기 버튼이 한 줄에 함께 표시됩니다. 페이지가 하나뿐이어도
              pagination 을 렌더합니다. 그렇지 않으면 글이 추가·삭제될 때마다
              글쓰기 버튼이 위아래로 움직여 UX 가 불안정합니다. */}
          <div className="listfoot">
            {state.kind !== "ready" || list.length === 0 ? null : (
              <Pager page={shownPage} pages={pages} onPage={setPage} />
            )}

            {/* 작성은 이 목록이 아니라 자기 주소를 가진 화면이 맡습니다(routes/PostWrite). */}
            {!canWrite ? null : (
              <Link className="new" to={newPath}>글쓰기</Link>
            )}
          </div>
        </>
      ) : (
        <PostDetail
          postId={focus.openId}
          authorId={authorId}
          canModerate={canModerate}
          listKey={queryKey}
          heading={focus.heading}
          onBack={backToList}
        />
      )}
    </Card>
  );
}
