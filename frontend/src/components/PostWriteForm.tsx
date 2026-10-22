// 게시판 글을 새로 쓰는 form 입니다. 작성 페이지(routes/PostWrite)만 사용합니다.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { reason } from "../lib/api";
import { formError } from "../lib/loading";
import { AttachmentFailed, checkAttachments, checkPost, createDraft, deletePost, publishWithAttachments } from "../lib/pipeline";
import { say } from "./toast";
import { Button, FilePicker, FormFoot } from "./controls";
import { AttachmentRow } from "./PostAttachments";
import { RichText } from "./RichText";
import { ATTACHMENT_ACCEPT, ATTACHMENT_HINT } from "../lib/boards";

/** 화면이 열리면 빈 글(초안)을 만들고 그 번호를 draftId 로 반환합니다. 받기 전에는 null 입니다. 첨부는 이 번호로 올립니다.
 *  markPublished 를 부르지 않고 화면을 떠나면 초안을 삭제합니다. 탭을 닫거나 연결이 끊겨 삭제 요청이 가지 못하면
 *  하루 뒤 서버가 삭제합니다(jobs/auto_assign.py 의 sweep_stale_drafts). */
function useDraft(draftPath: string): { draftId: number | null; markPublished: () => void } {
  const [draftId, setDraftId] = useState<number | null>(null);
  const published = useRef(false);
  useEffect(() => {
    let made: number | null = null;
    // 응답이 오기 전에 화면을 떠났으면 true 입니다. 그때 도착한 초안은 바로 삭제합니다.
    // StrictMode 개발 실행은 effect 를 2번 실행하므로 초안 2개 중 첫 번째가 이 경로로 삭제됩니다.
    let left = false;
    // 떠난 뒤의 초안 삭제 실패는 알리지 않습니다(.catch(() => undefined)). 사용자는 이미 다른 화면에 있고,
    // 남은 초안은 하루 뒤 서버의 sweep_stale_drafts 가 삭제합니다.
    void createDraft(draftPath)
      .then((post) => {
        if (left) { void deletePost(post.id).catch(() => undefined); return; }
        made = post.id;
        setDraftId(post.id);
      })
      .catch((error: unknown) => { if (!left) say(reason(error)); });
    return () => {
      left = true;
      if (made !== null && !published.current) void deletePost(made).catch(() => undefined);
    };
  }, [draftPath]);
  return { draftId, markPublished: () => { published.current = true; } };
}

/** 첨부를 차례로 올린 뒤 초안을 발행합니다. stage 는 "a.pdf 업로드 중 (1/2) 40%" 같은 진행 문구이고, 비어 있으면 업로드 중이 아닙니다.
 *  성공하든 실패하든 queryKey 의 목록을 다시 조회합니다. */
function usePublish(args: {
  draftId: number | null;
  markPublished: () => void;
  title: string;
  body: string;
  files: File[];
  setFiles: (next: File[]) => void;
  queryKey: unknown[];
  onDone: () => void;
}): { send: UseMutationResult<void, Error, void>; stage: string } {
  const { draftId, markPublished, title, body, files, setFiles, queryKey, onDone } = args;
  const client = useQueryClient();
  const [stage, setStage] = useState("");
  const showProgress = (index: number, percent: number): void => {
    const nth = files.length === 1 ? "" : ` (${index + 1}/${files.length})`;
    setStage(`${files[index].name} 업로드 중${nth} ${percent}%`);
  };
  const send = useMutation({
    mutationFn: async () => {
      if (draftId === null) throw new Error("글을 준비하는 중이에요. 잠시 후 다시 눌러주세요.");
      try {
        await publishWithAttachments(draftId, files, { title, body }, showProgress);
      } catch (error) {
        // 앞의 첨부는 이미 초안에 붙어 있으므로 실패한 파일부터 남깁니다. 다시 누르면 같은 파일을 두 번 올리지 않습니다.
        // 업로드 중에는 파일 입력칸이 disabled 라 files 는 이 렌더 시점의 값과 같습니다.
        if (error instanceof AttachmentFailed) setFiles(files.slice(error.index));
        throw error;
      }
      markPublished();
    },
    onSuccess: () => {
      say(files.length === 0 ? "글을 업로드했어요." : "글과 첨부파일을 업로드했어요.");
      onDone();
    },
    onSettled: () => {
      setStage("");
      void client.invalidateQueries({ queryKey });
    },
  });
  return { send, stage };
}

/** 첨부 선택 구역입니다. 브라우저가 그리는 파일 입력칸은 모양을 정할 수 없어 감추고(tabIndex -1), 같은 동작의 버튼이 click() 으로 엽니다.
 *  label 로 감싸지 않습니다. 감싸면 안내 문구를 눌러도 파일 선택 대화상자가 열립니다. 이름은 aria-labelledby 로 연결해 화면 읽기에는 그대로 전달합니다. */
function AttachmentPicker({ count, disabled, bad, onFiles }: {
  /** 선택한 파일 수입니다. */
  count: number;
  disabled: boolean;
  /** form 하단 오류 문구입니다. 비어 있지 않으면 입력칸을 오류로 표시합니다. */
  bad: string;
  onFiles: (picked: File[]) => void;
}) {
  // 선택한 파일은 브라우저가 관리하므로 코드에서 값을 설정할 수 없습니다. 파일 선택 버튼이 이 입력칸을 click() 으로 엽니다.
  const picker = useRef<HTMLInputElement>(null);
  return (
    <div className="wide">
      <span id="postFilesLabel">첨부파일</span> <span className="meta">{ATTACHMENT_HINT}</span>
      <div className="filepick">
        <Button kind="ghost" disabled={disabled} onClick={() => picker.current?.click()}>
          파일 선택
        </Button>
        <span className="meta">
          {count === 0 ? "선택한 파일 없음" : `${count}개 선택함`}
        </span>
      </div>
      <FilePicker
        id="postFiles"
        aria-labelledby="postFilesLabel"
        multiple
        tabIndex={-1}
        accept={ATTACHMENT_ACCEPT}
        ref={picker}
        disabled={disabled}
        aria-invalid={bad !== ""}
        aria-describedby={bad === "" ? undefined : "postWhy"}
        onFiles={onFiles}
      />
    </div>
  );
}

/** 글 하나를 쓰는 form 입니다. 작성 페이지(routes/PostWrite)가 사용합니다. */
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
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [touched, setTouched] = useState(false);
  const { draftId, markPublished } = useDraft(draftPath);
  const { send, stage } = usePublish({ draftId, markPublished, title, body, files, setFiles, queryKey, onDone });

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
            // 업로드 중(send.isPending)에만 비활성화합니다. 첨부 업로드가 실패하면 isPending 이 false 로 돌아와 다시 수정할 수 있고,
            // 다시 제출하면 수정한 제목과 본문으로 발행합니다(publishWithAttachments 가 발행 직전에 전달).
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
        <AttachmentPicker count={files.length} disabled={send.isPending} bad={bad}
          onFiles={(picked) => { setTouched(true); setFiles(picked); }} />
      </div>
      {files.length === 0 ? null : (
        <div className="comments">
          <p className="cap2">첨부파일 {files.length}개</p>
          <ul>
            {files.map((file, index) => (
              // 같은 이름의 파일을 2개 선택할 수 있어 이름만으로는 key 가 겹칩니다. 순서를 함께 붙입니다.
              <AttachmentRow key={`${index}-${file.name}`} name={file.name} size={file.size} />
            ))}
          </ul>
        </div>
      )}
      {stage === "" ? null : <p className="note" role="status">{stage}</p>}
      <FormFoot
        submitLabel="글쓰기"
        pendingLabel="업로드 중…"
        pending={send.isPending}
        blocked={authorId === null || draftId === null}
        onCancel={onCancel}
        bad={bad}
        whyId="postWhy"
      />
    </form>
  );
}
