import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

import { Link } from "react-router-dom";

import { RichText, RichTextView } from "./RichText";
import { apiUrl, reason } from "../lib/api";
import { formError, loadState, stateText } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import { say } from "../lib/toast";
import { clampPage, pageCount, pageSlice } from "../lib/paging";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_HINT,
  BLINDED_KEY,
  boardActions,
  boardListKey,
  checkAttachments,
  checkComment,
  checkPost,
  fileSizeLabel,
  getJSON,
  sendFile,
  stampLabel,
} from "../lib/pipeline";
import { Card } from "./AppShell";
import { Pager } from "./Pager";
import { useFitCount } from "./hooks";
import { Modal } from "./Modal";
import { EyeOffIcon, PencilIcon, TrashIcon } from "./icons";
import { askDelete } from "../lib/confirm";
import type { Attachment, Post, PostComment } from "../lib/contract";




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

/** 글 하나를 쓰는 form 입니다. 목록 화면이 아니라 작성 페이지(routes/PostWrite)가 사용합니다.
 *  목록 아래에 이어붙이지 않습니다 — 목록과 작성은 하는 일이 다르고, 붙이면 작성 화면을 주소로
 *  가리킬 수 없습니다. */
export function WriteForm(props: {
  /** 초안을 만드는 주소입니다. 이 화면이 열릴 때 한 번 호출해 글 번호를 받습니다. */
  draftPath: string;
  /** 현재 사용자의 id. 미인증(로그인 전)이면 null이므로 글을 작성할 수 없습니다. */
  authorId: number | null;
  queryKey: unknown[];
  /** 글 작성을 완료했을 때 호출합니다. 작성 페이지는 목록으로 돌아갑니다. */
  onDone: () => void;
  /** 쓰지 않고 나갈 때 호출합니다. */
  onCancel: () => void;
}) {
  const { draftPath, authorId, queryKey, onDone, onCancel } = props;
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  // 파일 업로드 진행 상황을 표시합니다. 비어 있으면 업로드 중이 아닙니다.
  const [stage, setStage] = useState("");
  // 이 화면이 열릴 때 만든 초안의 글 번호입니다. null 이면 아직 받지 못한 상태입니다.
  // 첨부는 이 번호로 올립니다 — 글이 있어야 올릴 수 있습니다.
  const [draftId, setDraftId] = useState<number | null>(null);
  // 발행을 마쳤는지입니다. 마쳤으면 이 화면을 떠날 때 초안을 삭제하지 않습니다.
  const published = useRef(false);
  const [touched, setTouched] = useState(false);
  // 선택한 파일은 브라우저가 관리하므로 코드에서 값을 설정할 수 없습니다.
  // 업로드 완료 후 입력 칸을 초기화하려면 DOM 요소에 직접 접근해야 합니다.
  const picker = useRef<HTMLInputElement>(null);

  const uploadAll = async (postId: number): Promise<void> => {
    // 선택한 순서대로 하나씩 업로드합니다. 한 번에 모두 보내면 개별 진행 상황을
    // 사용자에게 표시할 수 없습니다.
    for (const [index, file] of files.entries()) {
      const nth = files.length === 1 ? "" : ` (${index + 1}/${files.length})`;
      setStage(`${file.name} 업로드 중${nth} 0%`);
      try {
        await sendFile(`/posts/${postId}/attachments`, file, (percent) => {
          setStage(`${file.name} 업로드 중${nth} ${percent}%`);
        });
      } catch (error) {
        // 이미 업로드된 파일은 글에 붙어 있습니다. 실패한 파일만 남겨두어,
        // 재시도 시 같은 파일을 두 번 업로드하지 않게 합니다.
        setFiles(files.slice(index));
        throw new Error(
          `글은 업로드 되었지만 "${file.name}" 을 업로드하지 못했어요 — ${reason(error)}`,
        );
      }
    }
  };

  // 화면이 열리면 빈 글을 먼저 만듭니다. 그래야 쓰는 중에 첨부를 올릴 수 있습니다.
  // 떠날 때 발행하지 않았으면 그 빈 글을 삭제합니다. 탭을 닫거나 연결이 끊겨 이 요청이 가지 못하면
  // 하루 뒤 서버가 삭제합니다(jobs/auto_assign.py 의 sweep_stale_drafts).
  const starting = useRef(false);
  useEffect(() => {
    if (starting.current) return;
    starting.current = true;
    let made: number | null = null;
    void getJSON<{ post: Post }>(draftPath, { method: "POST" })
      .then(({ post }) => { made = post.id; setDraftId(post.id); })
      .catch((error: unknown) => say(reason(error)));
    return () => {
      if (made !== null && !published.current) {
        void getJSON(`/posts/${made}`, { method: "DELETE" }).catch(() => undefined);
      }
    };
  }, [draftPath]);

  const send = useMutation({
    mutationFn: async () => {
      if (draftId === null) throw new Error("글을 준비하는 중이에요. 잠시 후 다시 눌러주세요.");
      // 첨부를 먼저 올리고 발행합니다. 순서를 뒤집으면 첨부가 실패했을 때 첨부 없는 글이 공개됩니다.
      await uploadAll(draftId);
      await getJSON(`/posts/${draftId}/publish`, {
        // author_id 는 보내지 않습니다. 서버가 요청의 인증 cookie(브라우저가 저장해 요청마다 함께 보내는 값)로 작성자를 결정합니다.
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      published.current = true;
    },
    onSuccess: () => {
      const said = files.length === 0 ? "글을 업로드 했어요." : "글과 첨부파일을 업로드 했어요.";
      say(said);
      onDone();
    },
    onSettled: () => {
      // 첨부 업로드나 발행 중 어디서 실패해도 목록을 다시 조회합니다.
      setStage("");
      void client.invalidateQueries({ queryKey });
    },
  });

  const postWhy = checkPost({ title, body });
  const why = postWhy !== "" ? postWhy : checkAttachments(files);
  const bad = formError(touched, why, send.error);

  return (
    <form
      className="addrow"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (why === "") send.mutate();
      }}
    >
      <div className="fields">
        <label className="wide" htmlFor="postTitle">
          제목
          <input
            id="postTitle"
            value={title}
            // 업로드 중 또는 글은 생성되었으나 attachment 업로드에서 실패했을 때 비활성화합니다.
            // 이미 제출된 값이므로 이 form 에서 수정해도 반영되지 않습니다.
            disabled={send.isPending}
            aria-invalid={bad !== ""}
            aria-describedby={bad === "" ? undefined : "postWhy"}
            onChange={(event) => { setTouched(true); setTitle(event.target.value); }}
          />
        </label>
        <label className="wide" htmlFor="postBody">
          내용
          <RichText
            id="postBody"
            label="내용"
            postId={draftId}
            value={body}
            disabled={send.isPending}
            invalid={bad !== ""}
            describedBy={bad === "" ? undefined : "postWhy"}
            onChange={(next) => { setTouched(true); setBody(next); }}
          />
        </label>
        <label className="wide" htmlFor="postFiles">
          첨부파일 <span className="meta">{ATTACHMENT_HINT}</span>
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
        <div className="comments">
          <p className="cap2">첨부파일 {files.length}개</p>
          <ul>
            {files.map((file) => (
              <AttachmentRow key={file.name} name={file.name} size={file.size} />
            ))}
          </ul>
        </div>
      )}
      <div className="acts">
        <button className="btn" type="button" onClick={onCancel}>취소</button>
        <button className="btn go" type="submit"
          disabled={send.isPending || authorId === null || draftId === null}>
          {send.isPending ? "업로드 중…" : "글쓰기"}
        </button>
      </div>
      {stage === "" ? null : <p className="note" role="status">{stage}</p>}
      {bad === "" ? null : <p className="why" id="postWhy" role="alert">{bad}</p>}
    </form>
  );
}

function CommentForm(props: { postId: number; authorId: number | null }) {
  const { postId, authorId } = props;
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
      say("댓글을 올렸습니다.");
    },
  });

  const why = checkComment(body);
  const bad = formError(touched, why, send.error);

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
      <RichText
        id="commentBody"
        label="댓글 쓰기"
        postId={postId}
        value={body}
        invalid={bad !== ""}
        describedBy={bad === "" ? undefined : "commentWhy"}
        onChange={(next) => { setTouched(true); setBody(next); }}
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

/** 글에 붙은 파일들을 나열합니다. 이름을 누르면 다운로드하고, 글을 삭제할 권한이 있는 사용자에게만
 *  "삭제" 버튼이 표시됩니다. attachment 는 작성자 정보를 따로 저장하지 않으므로,
 *  글의 작성자를 기준으로 판정합니다(서버도 같습니다). */
/** 첨부파일 목록의 한 줄입니다. 등록 전(선택한 파일)과 등록 후(저장된 파일)가 같은 모양을 씁니다.
 *  href 가 있으면 이름이 다운로드 링크가 됩니다. 등록 전에는 받을 주소가 없어 넘기지 않습니다. */
function AttachmentRow({ name, size, href, action }: {
  name: string;
  size: number;
  href?: string;
  action?: ReactNode;
}) {
  return (
    <li className="comment">
      {href === undefined ? <span>{name}</span> : <a href={href} download={name}>{name}</a>}
      {" "}
      <span className="meta">{fileSizeLabel(size)}</span>
      {action === undefined ? null : <>{" "}{action}</>}
    </li>
  );
}

function AttachmentList(props: {
  postId: number;
  attachments: Attachment[];
  canRemove: boolean;
}) {
  const { postId, attachments, canRemove } = props;
  const client = useQueryClient();

  const remove = useMutation({
    mutationFn: (attachmentId: number) =>
      getJSON(`/attachments/${attachmentId}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["board", "post", postId] });
      say("첨부파일을 삭제했어요.");
    },
  });

  if (attachments.length === 0) return null;

  return (
    <div className="comments">
      <p className="cap2">첨부파일 {attachments.length}개</p>
      <ul>
        {attachments.map((file) => (
          <AttachmentRow
            key={file.id}
            name={file.name}
            size={file.size}
            // download attribute(속성)를 붙이면 브라우저가 파일을 inline(화면에 표시)하지 않고 다운로드합니다.
            // 이 주소는 받을 권한이 있는 사람에게만 표시합니다.
            href={apiUrl(`/attachments/${file.id}`)}
            action={!canRemove ? undefined : (
              <button
                className="btn"
                type="button"
                // 각 줄의 버튼 텍스트가 모두 "삭제"로 같으므로, 스크린 리더 사용자를 위해
                // aria-label 에 파일명을 붙여 어느 파일의 삭제 버튼인지 명확하게 합니다.
                aria-label={`${file.name} 삭제`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(file.id)}
              >
                삭제
              </button>
            )}
          />
        ))}
      </ul>
      {remove.error ? <p className="why" role="alert">{reason(remove.error)}</p> : null}
    </div>
  );
}

/** board_moderate 권한자에게만 표시되는 블라인드 버튼입니다. 글을 삭제하지 않고 목록·상세에서 가립니다.
 *  가린 글은 작성자 본인에게도 보이지 않고, 설정 화면의 블라인드 탭에서만 보이며 거기서 되돌립니다. */
function BlindPost(props: {
  postId: number;
  listKey: readonly unknown[];
  onDone: () => void;
}) {
  const { postId, listKey, onDone } = props;
  const client = useQueryClient();

  const blind = useMutation({
    mutationFn: () => getJSON(`/posts/${postId}/blind`, { method: "PUT" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: listKey });
      void client.invalidateQueries({ queryKey: BLINDED_KEY });
      say("글을 블라인드했어요.");
      // 가린 글의 상세 화면은 더 이상 조회되지 않으므로 목록으로 돌아갑니다.
      onDone();
    },
  });

  return (
    <>
      <button
        className="ic"
        type="button"
        aria-label="글 블라인드"
        disabled={blind.isPending}
        onClick={() => {
          if (window.confirm("해당 글을 가릴까요? 작성자 본인도 볼 수 없게 되고, 설정의 블라인드 탭에서 되돌릴 수 있어요.")) {
            blind.mutate();
          }
        }}
      >
        <EyeOffIcon />
      </button>
      {blind.error ? <p className="why" role="alert">{reason(blind.error)}</p> : null}
    </>
  );
}

/** 글 작성자에게만 표시되는 삭제 버튼입니다. 서버도 작성자만 삭제를 허용합니다.
 *  삭제하면 붙어 있던 attachment 들도 서버 디스크에서 함께 제거됩니다.
 *  취소할 수 없으므로 확인 dialog 를 한 번 표시합니다. */
function RemovePost(props: {
  postId: number;
  listKey: readonly unknown[];
  onDone: () => void;
}) {
  const { postId, listKey, onDone } = props;
  const client = useQueryClient();

  const remove = useMutation({
    mutationFn: () => getJSON(`/posts/${postId}`, { method: "DELETE" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: listKey });
      say("글을 삭제했어요.");
      // 삭제한 글의 상세 화면을 계속 표시할 수 없으므로 목록으로 돌아갑니다.
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
          if (window.confirm("해당 글과 첨부된 파일을 모두 삭제할까요?")) {
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

/** 글 제목과 본문 칸을 현재 값으로 채운 상태로 열어 수정하게 합니다. */
function EditPost(props: {
  post: Post;
  listKey: readonly unknown[];
  onClose: () => void;
}) {
  const { post, listKey, onClose } = props;
  const client = useQueryClient();
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [bad, setBad] = useState("");

  const send = useMutation({
    mutationFn: () =>
      getJSON<{ post: Post }>(`/posts/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: title.trim(), body }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: listKey });
      void client.invalidateQueries({ queryKey: ["board", "post", post.id] });
      onClose();
      say("글을 수정했어요.");
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
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- 글 수정 모달이 열릴 때 제목 입력칸으로 초점을 이동합니다. WAI-ARIA dialog 패턴이 규정하는 동작입니다. */}
          <input id="editTitle" autoFocus value={title}
            onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="wide" htmlFor="editBody">
          내용
          <RichText id="editBody" label="내용" postId={post.id} value={body} onChange={setBody} />
        </label>
      </div>
      {bad === "" ? null : <p className="why" role="alert">{bad}</p>}
    </Modal>
  );
}

/** 댓글 하나를 렌더합니다. 수정 권한이 있으면 수정 버튼이, 삭제 권한이 있으면 삭제 버튼이
 *  오른쪽 끝에 표시됩니다(`lib/pipeline` 의 `boardActions` 참조). */
function CommentRow(props: {
  comment: PostComment;
  canEdit: boolean;
  canDelete: boolean;
  postId: number;
}) {
  const { comment, canEdit, canDelete, postId } = props;
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
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => { setEditing(false); refresh(); say("댓글을 수정했어요."); },
    onError: (error) => setBad(reason(error)),
  });

  const remove = useMutation({
    mutationFn: () => getJSON<null>(`/comments/${comment.id}`, { method: "DELETE" }),
    onSuccess: () => { refresh(); say("댓글을 삭제했어요."); },
    onError: (error) => say(reason(error)),
  });

  return (
    <li className="comment">
      <span className="meta">{comment.author} · {stampLabel(comment.created_at)}</span>
      <RichTextView html={comment.body} />
      {!canEdit && !canDelete ? null : (
        <span className="acts">
          {!canEdit ? null : (
            <button className="ic" aria-label="댓글 수정"
              onClick={() => { setBody(comment.body); setBad(""); setEditing(true); }}>
              <PencilIcon />
            </button>
          )}
          {!canDelete ? null : (
            <button className="ic danger" aria-label="댓글 삭제" disabled={remove.isPending}
              onClick={() => { if (askDelete("댓글")) remove.mutate(); }}>
              <TrashIcon />
            </button>
          )}
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
              <RichText id="editComment" label="댓글" postId={comment.post_id ?? null} value={body} onChange={setBody} />
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
