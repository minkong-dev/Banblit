// 게시판 글에 붙은 첨부파일 부품입니다. 작성 form(PostWriteForm)과 글 상세(PostBoard)가 사용합니다.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { apiUrl, reason } from "../lib/api";
import type { Attachment } from "../lib/contract";
import { fileSizeLabel, getJSON } from "../lib/pipeline";
import { say } from "../lib/toast";

/** 첨부파일 목록의 한 줄입니다. 등록 전(선택한 파일)과 등록 후(저장된 파일)가 같은 모양을 씁니다.
 *  href 가 있으면 이름이 다운로드 링크가 됩니다. 등록 전에는 받을 주소가 없어 넘기지 않습니다. */
export function AttachmentRow({ name, size, href, action }: {
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

/** 글에 붙은 파일들을 나열합니다. 이름을 누르면 다운로드하고, 글을 삭제할 권한이 있는 사용자에게만
 *  "삭제" 버튼이 표시됩니다. attachment 는 작성자 정보를 따로 저장하지 않으므로,
 *  글의 작성자를 기준으로 판정합니다(서버도 같습니다). */
export function AttachmentList(props: {
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
