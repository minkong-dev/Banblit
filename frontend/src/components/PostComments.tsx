// 게시판 글에 달리는 댓글 부품입니다. 댓글 작성 form 과 댓글 한 줄을 담습니다. 글 상세(PostBoard)가 사용합니다.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { reason } from "../lib/api";
import { askDelete } from "../lib/confirm";
import type { PostComment } from "../lib/contract";
import { formError } from "../lib/loading";
import { checkComment, getJSON, stampLabel } from "../lib/pipeline";
import { say } from "../lib/toast";
import { PencilIcon, TrashIcon } from "./icons";
import { Modal } from "./Modal";
import { RichText, RichTextView } from "./RichText";

/** 댓글을 새로 다는 form 입니다. 로그인하지 않았으면(authorId 가 null) 버튼이 비활성화됩니다. */
export function CommentForm(props: { postId: number; authorId: number | null }) {
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

/** 댓글 하나를 렌더합니다. 수정 권한이 있으면 수정 버튼이, 삭제 권한이 있으면 삭제 버튼이
 *  오른쪽 끝에 표시됩니다(`lib/pipeline` 의 `boardActions` 참조). */
export function CommentRow(props: {
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
