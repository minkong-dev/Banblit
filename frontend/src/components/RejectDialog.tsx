// 사유를 받는 modal 입니다. 다른 멤버의 예약·불가능 일정 반려(RejectDialog)와 기간의 확정 해제(ReasonDialog)가 씁니다.
// 입력한 사유는 알림으로 갑니다(lib/notifications.ts 가 문장을 만듭니다).

import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";

import { FormFoot, Why } from "./controls";
import { Modal } from "./Modal";
import { firstWhy } from "../lib/loading";
import { REJECT_REASON_MAX_LENGTH } from "../lib/contract";
import type { RejectTarget } from "../lib/contract";
import { REJECT_TARGET_LABEL } from "../lib/notifications";
import "../styles/reject.css";

/** target 은 반려할 대상의 종류, owner 는 알림을 받는 멤버의 이름, subject 는 반려할 대상 한 줄
 *  ("9월 14일 월요일 18:00–19:00 · 1번방")입니다. 제목과 안내 문구는 target 의 이름으로 만듭니다.
 *  onReject 가 끝나면 onDone 을, 실패하면 modal 안에 서버의 사유를 표시합니다. */
export function RejectDialog({ target, owner, subject, onReject, onDone, onClose }: {
  target: RejectTarget;
  owner: string;
  subject: string;
  onReject: (reason: string) => Promise<void>;
  onDone: () => void;
  onClose: () => void;
}) {
  const label = REJECT_TARGET_LABEL[target];
  return (
    <ReasonDialog
      title={`${label} 반려`}
      hint={`${owner}님의 ${label}을 반려할게요.`}
      subject={subject}
      action="반려"
      onSubmit={onReject}
      onDone={onDone}
      onClose={onClose}
    />
  );
}

/** 사유 1개를 받아 onSubmit 에 넘기는 modal 입니다. action 은 "반려", "해제" 처럼 동작 이름이고,
 *  입력칸 이름("<action> 사유")과 버튼 문구("<action>하기")를 만듭니다. 빈 사유는 보내지 않습니다. */
export function ReasonDialog({ title, hint, subject, action, onSubmit, onDone, onClose }: {
  title: string;
  hint: string;
  subject: string;
  action: string;
  onSubmit: (reason: string) => Promise<void>;
  onDone: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const fieldId = useId();
  const trimmed = text.trim();

  const send = useMutation({
    mutationFn: () => onSubmit(trimmed),
    onSuccess: onDone,
  });

  return (
    <Modal
      title={title}
      hint={hint}
      onClose={onClose}
      foot={
        <FormFoot
          onCancel={onClose}
          onSubmit={() => { if (trimmed !== "") send.mutate(); }}
          pending={send.isPending}
          submitLabel={`${action}하기`}
          pendingLabel={`${action}하는 중…`}
        />
      }
    >
      <p className="rejectsubject">{subject}</p>
      <div className="fields reject">
        <label htmlFor={fieldId}>
          {action} 사유
          <textarea
            id={fieldId}
            value={text}
            maxLength={REJECT_REASON_MAX_LENGTH}
            placeholder={`${action} 사유를 작성해주세요.`}
            aria-invalid={send.isError}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <span className="count" aria-live="polite">{text.length}/{REJECT_REASON_MAX_LENGTH}</span>
      </div>
      <Why text={firstWhy([send.error])} />
    </Modal>
  );
}
