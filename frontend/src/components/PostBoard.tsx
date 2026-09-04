import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { getJSON } from "../lib/api";
import { checkComment, checkPost, postWhen } from "../lib/pipeline";
import { Card } from "./AppShell";
import type { Post, PostComment } from "../lib/contract";



function reason(error: unknown): string {
  return error instanceof Error ? error.message : "불러오지 못했습니다";
}

/** 목록 → 상세로 넘어갈 때 초점을 그 글의 제목으로, 되돌아올 때는 눌렀던 줄로 되돌린다. */
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

function PostList(props: {
  posts: Post[];
  state: string;
  emptyText: string;
  onOpen: (id: number) => void;
  buttonRef: (id: number) => (el: HTMLButtonElement | null) => void;
}) {
  const { posts, state, emptyText, onOpen, buttonRef } = props;
  if (state !== "" || posts.length === 0) {
    return <div className="empty">{state === "loading" ? "불러오는 중…" : state || emptyText}</div>;
  }
  return (
    <ul className="rows">
      {posts.map((post) => (
        <li key={post.id}>
          <button className="postrow" ref={buttonRef(post.id)} onClick={() => onOpen(post.id)}>
            <b>{post.title}</b>
            <span className="meta">{post.author} · {postWhen(post.created_at)}</span>
          </button>
          <span className="cnt">댓글 {post.comment_count}</span>
        </li>
      ))}
    </ul>
  );
}

function WriteForm(props: {
  writePath: string;
  /** 아직 누구인지 모르면 null — 그때는 글을 쓸 수 없다. */
  authorId: number | null;
  writeNote: string;
  queryKey: unknown[];
  onSay: (message: string) => void;
}) {
  const { writePath, authorId, writeNote, queryKey, onSay } = props;
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [touched, setTouched] = useState(false);

  const send = useMutation({
    mutationFn: () =>
      getJSON<{ post: Post }>(writePath, {
        // author_id 는 안 보낸다 — 서버가 요청에 실린 토큰으로 글쓴이를 정한다.
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      setTouched(false);
      void client.invalidateQueries({ queryKey });
      onSay("글을 올렸습니다.");
    },
  });

  const why = checkPost({ title, body });
  const bad = touched && why !== "" ? why : send.error ? reason(send.error) : "";

  return (
    <form
      className="addrow"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (why === "") send.mutate();
      }}
    >
      <p className="note">{writeNote}</p>
      <div className="fields">
        <label className="wide" htmlFor="postTitle">
          제목
          <input
            id="postTitle"
            value={title}
            aria-invalid={bad !== ""}
            aria-describedby={bad === "" ? undefined : "postWhy"}
            onChange={(event) => { setTouched(true); setTitle(event.target.value); }}
          />
        </label>
        <label className="wide" htmlFor="postBody">
          내용
          <textarea
            id="postBody"
            value={body}
            aria-invalid={bad !== ""}
            aria-describedby={bad === "" ? undefined : "postWhy"}
            onChange={(event) => { setTouched(true); setBody(event.target.value); }}
          />
        </label>
      </div>
      <div className="acts">
        <button className="btn go" type="submit" disabled={send.isPending || authorId === null}>
          {send.isPending ? "올리는 중…" : "글쓰기"}
        </button>
      </div>
      {bad === "" ? null : <p className="why" id="postWhy" role="alert">{bad}</p>}
    </form>
  );
}

function CommentForm(props: { postId: number; authorId: number | null; onSay: (message: string) => void }) {
  const { postId, authorId, onSay } = props;
  const client = useQueryClient();
  const [body, setBody] = useState("");
  const [touched, setTouched] = useState(false);

  const send = useMutation({
    mutationFn: () =>
      getJSON<{ comment: PostComment }>(`/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setBody("");
      setTouched(false);
      void client.invalidateQueries({ queryKey: ["board", "post", postId] });
      onSay("댓글을 올렸습니다.");
    },
  });

  const why = checkComment(body);
  const bad = touched && why !== "" ? why : send.error ? reason(send.error) : "";

  return (
    <form
      className="commentform"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (why === "") send.mutate();
      }}
    >
      <label htmlFor="commentBody">댓글 쓰기</label>
      <textarea
        id="commentBody"
        value={body}
        aria-invalid={bad !== ""}
        aria-describedby={bad === "" ? undefined : "commentWhy"}
        onChange={(event) => { setTouched(true); setBody(event.target.value); }}
      />
      <div className="acts">
        <button className="btn go" type="submit" disabled={send.isPending || authorId === null}>
          {send.isPending ? "올리는 중…" : "댓글 달기"}
        </button>
      </div>
      {bad === "" ? null : <p className="why" id="commentWhy" role="alert">{bad}</p>}
    </form>
  );
}

function PostDetail(props: {
  postId: number;
  /** 아직 누구인지 모르면 null — 그때는 글도 댓글도 쓸 수 없다. */
  authorId: number | null;
  heading: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onSay: (message: string) => void;
}) {
  const { postId, authorId, heading, onBack, onSay } = props;
  const detail = useQuery({
    queryKey: ["board", "post", postId],
    queryFn: () => getJSON<{ post: Post; comments: PostComment[] }>(`/posts/${postId}`),
  });

  if (detail.isPending) return <div className="empty">불러오는 중…</div>;
  if (detail.isError) return <div className="empty">{reason(detail.error)}</div>;

  const { post, comments } = detail.data;

  return (
    <div className="thread">
      <button className="back" onClick={onBack}>‹ 목록으로</button>
      <h2 tabIndex={-1} ref={heading}>{post.title}</h2>
      <p className="meta">{post.author} · {postWhen(post.created_at)}</p>
      <p className="threadbody">{post.body}</p>

      <div className="comments">
        <p className="cap2">댓글 {comments.length}개</p>
        {comments.length === 0 ? (
          <p className="empty">아직 댓글이 없습니다</p>
        ) : (
          <ul>
            {comments.map((comment) => (
              <li key={comment.id} className="comment">
                <span className="meta">{comment.author} · {postWhen(comment.created_at)}</span>
                <p>{comment.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CommentForm postId={post.id} authorId={authorId} onSay={onSay} />
    </div>
  );
}

/** 글 목록 + 상세 + 글쓰기 + 댓글쓰기 한 벌. 공지사항과 팀 게시판이 이걸 그대로 쓰고
 *  주소(listPath·writePath)만 갈아 끼운다. */
export function PostBoard(props: {
  title: string;
  hint: string;
  listPath: string;
  writePath: string;
  /** 아직 누구인지 모르면 null — 그때는 글도 댓글도 쓸 수 없다. */
  authorId: number | null;
  writeNote: string;
  emptyText: string;
  onSay: (message: string) => void;
}) {
  const { title, hint, listPath, writePath, authorId, writeNote, emptyText, onSay } = props;
  const queryKey = ["board", listPath];
  const focus = useDetailFocus();
  const client = useQueryClient();

  const posts = useQuery({
    queryKey,
    queryFn: () => getJSON<{ posts: Post[] }>(listPath),
  });
  const list = posts.data?.posts ?? [];
  const state = posts.isPending ? "loading" : posts.isError ? reason(posts.error) : "";

  // 목록으로 돌아올 때 다시 불러온다 — 댓글을 달고 오면 댓글 수가 목록에도 반영돼야 한다.
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
            posts={list}
            state={state}
            emptyText={emptyText}
            onOpen={focus.open}
            buttonRef={focus.register}
          />
          <WriteForm
            writePath={writePath}
            authorId={authorId}
            writeNote={writeNote}
            queryKey={queryKey}
            onSay={onSay}
          />
        </>
      ) : (
        <PostDetail
          postId={focus.openId}
          authorId={authorId}
          heading={focus.heading}
          onBack={backToList}
          onSay={onSay}
        />
      )}
    </Card>
  );
}
