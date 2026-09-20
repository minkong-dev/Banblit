// 게시판 글을 새로 쓰는 form 입니다. 작성 페이지(routes/PostWrite)만 사용합니다.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { reason } from "../lib/api";
import type { Post } from "../lib/contract";
import { formError } from "../lib/loading";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_HINT,
  checkAttachments,
  checkPost,
  getJSON,
  sendFile,
} from "../lib/pipeline";
import { say } from "../lib/toast";
import { AttachmentRow } from "./PostAttachments";
import { RichText } from "./RichText";

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
