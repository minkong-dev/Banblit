import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { apiUrl } from "../lib/api";
import { clampPage, pageCount, pageSlice, pageWindow } from "../lib/paging";
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
import { useFitCount } from "./hooks";
import { Modal } from "./Modal";
import { PencilIcon, TrashIcon } from "./icons";
import { askDelete } from "../lib/confirm";
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

/** 글 목록. 비었거나 불러오는 중이어도 상자는 그대로 둔다 — 상자 높이를 재서
 *  한 쪽에 몇 줄을 둘지 정하므로, 상자가 사라지면 잴 것이 없어진다. */
function PostList(props: {
  posts: Post[];
  state: string;
  emptyText: string;
  onOpen: (id: number) => void;
  buttonRef: (id: number) => (el: HTMLButtonElement | null) => void;
  boxRef: RefObject<HTMLUListElement | null>;
}) {
  const { posts, state, emptyText, onOpen, buttonRef, boxRef } = props;
  return (
    <ul className="rows" ref={boxRef}>
      {state !== "" || posts.length === 0 ? (
        <li className="empty">{state === "loading" ? "불러오는 중…" : state || emptyText}</li>
      ) : (
        posts.map((post) => (
          <li key={post.id}>
            <button className="postrow" ref={buttonRef(post.id)} onClick={() => onOpen(post.id)}>
              <b>{post.title}</b>
              <span className="meta">{post.author} · {postWhen(post.created_at)}</span>
            </button>
            <span className="cnt">댓글 {post.comment_count}</span>
          </li>
        ))
      )}
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
  /** 다 쓰고 나면 서식을 접는다 — 목록으로 돌아가는 것이 다음에 할 일이다. */
  onDone: () => void;
}) {
  const { writePath, authorId, writeNote, queryKey, onSay, onDone } = props;
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
      onDone();
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
                  // 줄마다 "삭제" 가 같은 글자라, 화면을 읽어 주는 도구에는 어느
                  // 파일의 것인지 이름을 붙여 알린다.
                  aria-label={`${file.name} 삭제`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(file.id)}
                >
                  삭제
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

/** 글을 지우는 단추. 글쓴이 자신에게만 보이고, 서버도 글쓴이만 통과시킨다.
 *  지우면 붙어 있던 첨부파일도 디스크에서 함께 사라진다 — 무를 수 없어 한 번 되묻는다. */
function RemovePost(props: {
  postId: number;
  listKey: readonly unknown[];
  onDone: () => void;
  onSay: (message: string) => void;
}) {
  const { postId, listKey, onDone, onSay } = props;
  const client = useQueryClient();

  const remove = useMutation({
    mutationFn: () => getJSON(`/posts/${postId}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: listKey });
      onSay("글을 삭제했습니다.");
      // 지운 글의 상세를 계속 열어 둘 수 없으므로 목록으로 돌아간다.
      onDone();
    },
  });

  return (
    <>
      <button
        className="ic danger"
        type="button"
        aria-label="글 삭제"
        disabled={remove.isPending}
        onClick={() => {
          if (window.confirm("이 글과 붙어 있는 첨부파일을 함께 지웁니다. 삭제할까요?")) {
            remove.mutate();
          }
        }}
      >
        <TrashIcon />
      </button>
      {remove.error ? <p className="why" role="alert">{reason(remove.error)}</p> : null}
    </>
  );
}

/** 글 수정 — 쓸 때와 같은 두 칸을 값이 담긴 채로 다시 연다. */
function EditPost(props: {
  post: Post;
  listKey: readonly unknown[];
  onClose: () => void;
  onSay: (message: string) => void;
}) {
  const { post, listKey, onClose, onSay } = props;
  const client = useQueryClient();
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [bad, setBad] = useState("");

  const send = useMutation({
    mutationFn: () =>
      getJSON<{ post: Post }>(`/posts/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: listKey });
      void client.invalidateQueries({ queryKey: ["board", "post", post.id] });
      onClose();
      onSay("글을 고쳤습니다.");
    },
    onError: (error) => setBad(reason(error)),
  });

  return (
    <Modal title="글 수정" onClose={onClose}
      foot={
        <>
          <button className="ghost" onClick={onClose}>취소</button>
          <button className="primary" disabled={send.isPending}
            onClick={() => {
              const why = checkPost({ title, body });
              setBad(why);
              if (why === "") send.mutate();
            }}
          >
            {send.isPending ? "저장하는 중…" : "저장"}
          </button>
        </>
      }
    >
      <div className="fields">
        <label className="wide" htmlFor="editTitle">
          제목
          <input id="editTitle" autoFocus value={title}
            onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="wide" htmlFor="editBody">
          내용
          <textarea id="editBody" value={body}
            onChange={(event) => setBody(event.target.value)} />
        </label>
      </div>
      {bad === "" ? null : <p className="why" role="alert">{bad}</p>}
    </Modal>
  );
}

/** 댓글 한 줄. 자기 댓글이면 오른쪽 끝에 연필과 쓰레기통이 선다. */
function CommentRow(props: {
  comment: PostComment;
  mine: boolean;
  postId: number;
  onSay: (message: string) => void;
}) {
  const { comment, mine, postId, onSay } = props;
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const [bad, setBad] = useState("");

  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: ["board", "post", postId] });
  };

  const save = useMutation({
    mutationFn: () =>
      getJSON<{ comment: PostComment }>(`/comments/${comment.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body: body.trim() }),
      }),
    onSuccess: () => { setEditing(false); refresh(); onSay("댓글을 고쳤습니다."); },
    onError: (error) => setBad(reason(error)),
  });

  const remove = useMutation({
    mutationFn: () => getJSON<null>(`/comments/${comment.id}`, { method: "DELETE" }),
    onSuccess: () => { refresh(); onSay("댓글을 삭제했습니다."); },
    onError: (error) => onSay(reason(error)),
  });

  return (
    <li className="comment">
      <span className="meta">{comment.author} · {postWhen(comment.created_at)}</span>
      <p>{comment.body}</p>
      {!mine ? null : (
        <span className="acts">
          <button className="ic" aria-label="댓글 수정"
            onClick={() => { setBody(comment.body); setBad(""); setEditing(true); }}>
            <PencilIcon />
          </button>
          <button className="ic danger" aria-label="댓글 삭제" disabled={remove.isPending}
            onClick={() => { if (askDelete("댓글")) remove.mutate(); }}>
            <TrashIcon />
          </button>
        </span>
      )}

      {!editing ? null : (
        <Modal title="댓글 수정" onClose={() => setEditing(false)}
          foot={
            <>
              <button className="ghost" onClick={() => setEditing(false)}>취소</button>
              <button className="primary" disabled={save.isPending}
                onClick={() => {
                  const why = checkComment(body);
                  setBad(why);
                  if (why === "") save.mutate();
                }}
              >
                {save.isPending ? "저장하는 중…" : "저장"}
              </button>
            </>
          }
        >
          <div className="fields">
            <label className="wide" htmlFor="editComment">
              댓글
              <textarea id="editComment" autoFocus value={body}
                onChange={(event) => setBody(event.target.value)} />
            </label>
          </div>
          {bad === "" ? null : <p className="why" role="alert">{bad}</p>}
        </Modal>
      )}
    </li>
  );
}

function PostDetail(props: {
  postId: number;
  /** 아직 누구인지 모르면 null — 그때는 글도 댓글도 쓸 수 없다. */
  authorId: number | null;
  /** 글을 지운 뒤 다시 받아야 하는 목록 */
  listKey: readonly unknown[];
  heading: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onSay: (message: string) => void;
}) {
  const { postId, authorId, listKey, heading, onBack, onSay } = props;
  const [editing, setEditing] = useState(false);
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
  const mine = authorId !== null && post.author_id === authorId;

  return (
    <div className="thread">
      <div className="threadtop">
        <button className="back" onClick={onBack}>‹ 목록으로</button>
        {!mine ? null : (
          <span className="acts">
            <button className="ic" aria-label="글 수정" onClick={() => setEditing(true)}>
              <PencilIcon />
            </button>
            <RemovePost postId={post.id} listKey={listKey} onDone={onBack} onSay={onSay} />
          </span>
        )}
      </div>
      <h2 tabIndex={-1} ref={heading}>{post.title}</h2>
      <p className="meta">{post.author} · {postWhen(post.created_at)}</p>
      <p className="threadbody">{post.body}</p>

      <AttachmentList
        postId={post.id}
        attachments={attachments}
        canRemove={mine}
        onSay={onSay}
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
                mine={authorId !== null && comment.author_id === authorId}
                postId={post.id}
                onSay={onSay}
              />
            ))}
          </ul>
        )}
      </div>

      <CommentForm postId={post.id} authorId={authorId} onSay={onSay} />

      {!editing ? null : (
        <EditPost post={post} listKey={listKey} onClose={() => setEditing(false)} onSay={onSay} />
      )}
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
  const [page, setPage] = useState(1);
  const [writing, setWriting] = useState(false);

  const posts = useQuery({
    queryKey,
    queryFn: () => getJSON<{ posts: Post[] }>(listPath),
  });
  const list = posts.data?.posts ?? [];
  const state = posts.isPending ? "loading" : posts.isError ? reason(posts.error) : "";
  // 한 쪽에 몇 줄을 둘지는 상자 높이가 정한다. 스크롤하지 않고 쪽으로 넘긴다.
  const [box, perPage] = useFitCount(76);
  // 글이 지워져 보던 쪽이 사라질 수 있어, 그릴 때마다 범위 안으로 당긴다.
  const pages = pageCount(list.length, perPage);
  const shownPage = clampPage(page, pages);
  const shown = pageSlice(list, shownPage, perPage);

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
            posts={shown}
            state={state}
            emptyText={emptyText}
            onOpen={focus.open}
            buttonRef={focus.register}
            boxRef={box}
          />

          {/* 쪽 넘기기와 글쓰기가 목록 아래 한 줄에 함께 선다. 쪽이 하나뿐이어도
              쪽 넘기기를 그린다 — 글이 늘고 줄 때마다 줄이 생겼다 없어지면 글쓰기
              단추가 위아래로 움직인다. */}
          {writing ? null : (
          <div className="listfoot">
          {state !== "" ? null : (
            <nav className="pager" aria-label="쪽 넘기기">
              <button
                aria-label="이전 쪽"
                disabled={shownPage === 1}
                onClick={() => setPage(shownPage - 1)}
              >
                ‹
              </button>
              {pageWindow(shownPage, pages).map((number) => (
                <button
                  key={number}
                  aria-label={`${number}쪽`}
                  aria-current={number === shownPage ? "page" : undefined}
                  onClick={() => setPage(number)}
                >
                  {number}
                </button>
              ))}
              <button
                aria-label="다음 쪽"
                disabled={shownPage === pages}
                onClick={() => setPage(shownPage + 1)}
              >
                ›
              </button>
            </nav>
          )}

          {!canWrite ? null : (
            <button className="new" onClick={() => setWriting(true)}>글쓰기</button>
          )}
          </div>
          )}

          {/* 글쓰기 서식은 단추를 눌렀을 때만 나온다. 늘 펼쳐 두면 목록보다 서식이
              더 길어져, 읽으러 온 사람이 매번 지나쳐야 한다. */}
          {!writing ? null : (
            <WriteForm
              writePath={writePath}
              authorId={authorId}
              writeNote={writeNote}
              queryKey={queryKey}
              onSay={onSay}
              onDone={() => setWriting(false)}
            />
          )}
        </>
      ) : (
        <PostDetail
          postId={focus.openId}
          authorId={authorId}
          listKey={queryKey}
          heading={focus.heading}
          onBack={backToList}
          onSay={onSay}
        />
      )}
    </Card>
  );
}
