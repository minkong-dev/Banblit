// 게시판 글 하나에 가하는 조치입니다 — 블라인드, 삭제, 수정. 글 상세(PostBoard)의 오른쪽 버튼 줄이 사용합니다.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { reason } from "../lib/api";
import type { Post } from "../lib/contract";
import { BLINDED_KEY, checkPost, getJSON } from "../lib/pipeline";
import { say } from "../lib/toast";
import { EyeOffIcon, TrashIcon } from "./icons";
import { Modal } from "./Modal";
import { RichText } from "./RichText";

/** board_moderate 권한자에게만 표시되는 블라인드 버튼입니다. 글을 삭제하지 않고 목록·상세에서 가립니다.
 *  가린 글은 작성자 본인에게도 보이지 않고, 설정 화면의 블라인드 탭에서만 보이며 거기서 되돌립니다. */
export function BlindPost(props: {
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
export function RemovePost(props: {
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
export function EditPost(props: {
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
