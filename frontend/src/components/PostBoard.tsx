import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { apiUrl } from "../lib/api";
import {
  ATTACHMENT_ACCEPT,
  attachmentHint,
  checkAttachments,
  checkComment,
  checkPost,
  fileSizeLabel,
  getJSON,
  postWhen,
  sendFile,
} from "../lib/pipeline";
import { Card } from "./AppShell";
import type { Attachment, Post, PostComment } from "../lib/contract";



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
  const [files, setFiles] = useState<File[]>([]);
  // 올리는 동안 얼마나 갔는지 보여주는 한 줄. 비어 있으면 올리는 중이 아니다.
  const [stage, setStage] = useState("");
  // 글은 만들어졌는데 첨부에서 걸렸을 때 그 글 번호. null 이면 아직 만든 글이 없다.
  const [postedId, setPostedId] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  // 고른 파일은 브라우저가 들고 있어 값을 대신 넣어 줄 수 없다. 다 올린 뒤 비우려면
  // 그 칸을 직접 잡아야 한다.
  const picker = useRef<HTMLInputElement>(null);

  const uploadAll = async (postId: number): Promise<void> => {
    // 고른 순서대로 하나씩 올린다. 한 번에 몰아 보내면 어느 것이 얼마나 갔는지
    // 사람에게 보여줄 수 없다.
    for (const [index, file] of files.entries()) {
      const nth = files.length === 1 ? "" : ` (${index + 1}/${files.length})`;
      setStage(`${file.name} 올리는 중${nth} 0%`);
      try {
        await sendFile(`/posts/${postId}/attachments`, file, (percent) => {
          setStage(`${file.name} 올리는 중${nth} ${percent}%`);
        });
      } catch (error) {
        // 여기까지 올라간 것은 이미 글에 붙었다. 못 올린 것만 남겨, 다시 누를 때
        // 같은 파일을 두 번 올리지 않게 한다.
        setFiles(files.slice(index));
        throw new Error(
          `글은 올렸습니다. "${file.name}" 을 올리지 못했습니다 — ${reason(error)}`,
        );
      }
    }
  };

  const send = useMutation({
    mutationFn: async () => {
      // 글이 먼저다 — 첨부는 붙을 글 번호를 받아야 올릴 수 있다. 앞서 만들어 둔 글이
      // 있으면(첨부에서만 걸린 경우) 다시 만들지 않는다. 그러지 않으면 다시 누를 때
      // 같은 글이 하나 더 생긴다.
      let postId = postedId;
      if (postId === null) {
        const { post } = await getJSON<{ post: Post }>(writePath, {
          // author_id 는 안 보낸다 — 서버가 요청에 실린 토큰으로 글쓴이를 정한다.
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body }),
        });
        postId = post.id;
        setPostedId(postId);
      }
      await uploadAll(postId);
    },
    onSuccess: () => {
      const said = files.length === 0 ? "글을 올렸습니다." : "글과 첨부파일을 올렸습니다.";
      setTitle("");
      setBody("");
      setFiles([]);
      setPostedId(null);
      if (picker.current !== null) picker.current.value = "";
      setTouched(false);
      onSay(said);
    },
    onSettled: () => {
      // 첨부를 올리다 걸려도 글은 이미 만들어졌다 — 성패와 무관하게 목록을 다시 받는다.
      setStage("");
      void client.invalidateQueries({ queryKey });
    },
  });

  const postWhy = checkPost({ title, body });
  const why = postWhy !== "" ? postWhy : checkAttachments(files);
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
            // 올리는 중에는 잠근다 — 이미 보낸 값이라 여기서 고쳐도 반영되지 않는다.
            // 글만 만들어진 채 첨부에서 걸렸을 때도 마찬가지다.
            disabled={send.isPending || postedId !== null}
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
            disabled={send.isPending || postedId !== null}
            aria-invalid={bad !== ""}
            aria-describedby={bad === "" ? undefined : "postWhy"}
            onChange={(event) => { setTouched(true); setBody(event.target.value); }}
          />
        </label>
        <label className="wide" htmlFor="postFiles">
          첨부파일 <span className="meta">{attachmentHint()}</span>
          <input
            id="postFiles"
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            ref={picker}
            disabled={send.isPending}
            aria-invalid={bad !== ""}
            aria-describedby={bad === "" ? undefined : "postWhy"}
            onChange={(event) => {
              setTouched(true);
              setFiles([...(event.target.files ?? [])]);
            }}
          />
        </label>
      </div>
      {files.length === 0 ? null : (
        <p className="note">
          {files.map((file) => `${file.name} ${fileSizeLabel(file.size)}`).join(", ")}
        </p>
      )}
      <div className="acts">
        <button className="btn go" type="submit" disabled={send.isPending || authorId === null}>
          {send.isPending ? "올리는 중…" : postedId === null ? "글쓰기" : "남은 첨부 다시 올리기"}
        </button>
      </div>
      {stage === "" ? null : <p className="note" role="status">{stage}</p>}
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

/** 글에 붙은 파일 목록. 이름을 누르면 받고, 글쓴이 자신에게만 지우는 자리가 보인다. */
function AttachmentList(props: {
  postId: number;
  attachments: Attachment[];
  canRemove: boolean;
  onSay: (message: string) => void;
}) {
  const { postId, attachments, canRemove, onSay } = props;
  const client = useQueryClient();

  const remove = useMutation({
    mutationFn: (attachmentId: number) =>
      getJSON(`/attachments/${attachmentId}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["board", "post", postId] });
      onSay("첨부파일을 지웠습니다.");
    },
  });

  if (attachments.length === 0) return null;

  return (
    <div className="comments">
      <p className="cap2">첨부파일 {attachments.length}개</p>
      <ul>
        {attachments.map((file) => (
          <li key={file.id} className="comment">
            {/* download 를 붙이면 브라우저가 화면에 펼치지 않고 받는다. */}
            <a href={apiUrl(`/attachments/${file.id}`)} download={file.name}>{file.name}</a>
            {" "}
            <span className="meta">{fileSizeLabel(file.size)}</span>
            {!canRemove ? null : (
              <>
                {" "}
                <button
                  className="btn"
                  type="button"
                  // 줄마다 "지우기" 가 같은 글자라, 화면을 읽어 주는 도구에는 어느
                  // 파일의 것인지 이름을 붙여 알린다.
                  aria-label={`${file.name} 지우기`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(file.id)}
                >
                  지우기
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {remove.error ? <p className="why" role="alert">{reason(remove.error)}</p> : null}
    </div>
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
    // 첨부는 글을 열 때 함께 온다 — 목록을 따로 부르지 않는다.
    // 서버 쪽 정본은 backend/src/backend/api/schemas.py 의 PostDetailOut 이다.
    queryFn: () =>
      getJSON<{ post: Post; comments: PostComment[]; attachments: Attachment[] }>(
        `/posts/${postId}`,
      ),
  });

  if (detail.isPending) return <div className="empty">불러오는 중…</div>;
  if (detail.isError) return <div className="empty">{reason(detail.error)}</div>;

  const { post, comments, attachments } = detail.data;

  return (
    <div className="thread">
      <button className="back" onClick={onBack}>‹ 목록으로</button>
      <h2 tabIndex={-1} ref={heading}>{post.title}</h2>
      <p className="meta">{post.author} · {postWhen(post.created_at)}</p>
      <p className="threadbody">{post.body}</p>

      <AttachmentList
        postId={post.id}
        attachments={attachments}
        canRemove={authorId !== null && post.author_id === authorId}
        onSay={onSay}
      />

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
  /** 글쓰기 서식을 그릴지. 공지는 notice_write 를 가진 사람만이고, 팀 게시판은 소속이면 쓴다. */
  canWrite: boolean;
  writeNote: string;
  emptyText: string;
  onSay: (message: string) => void;
}) {
  const { title, hint, listPath, writePath, authorId, canWrite, writeNote, emptyText, onSay } = props;
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
          {!canWrite ? null : (
            <WriteForm
              writePath={writePath}
              authorId={authorId}
              writeNote={writeNote}
              queryKey={queryKey}
              onSay={onSay}
            />
          )}
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
