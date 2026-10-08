// 다른 멤버의 예약·불가능 일정을 반려할 때 사유를 받는 modal 입니다. 관리자 메뉴의 예약 구역과 불가능 일정
// 구역이 같은 modal 을 씁니다. 입력한 사유는 그 멤버에게 알림으로 갑니다(lib/notifications.ts 가 문장을 만듭니다).

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
  const [text, setText] = useState("");
  const fieldId = useId();
  const trimmed = text.trim();
  const label = REJECT_TARGET_LABEL[target];

  const reject = useMutation({
    mutationFn: () => onReject(trimmed),
    onSuccess: onDone,
  });

  return (
    <Modal
      title={`${label} 반려`}
      hint={`${owner}님의 ${label}을 반려할게요.`}
      onClose={onClose}
      foot={
        <FormFoot
          onCancel={onClose}
          onSubmit={() => { if (trimmed !== "") reject.mutate(); }}
          pending={reject.isPending}
          submitLabel="반려하기"
          pendingLabel="반려하는 중…"
        />
      }
    >
      <p className="rejectsubject">{subject}</p>
      <div className="fields reject">
        <label htmlFor={fieldId}>
          반려 사유
          <textarea
            id={fieldId}
            value={text}
            maxLength={REJECT_REASON_MAX_LENGTH}
            placeholder="반려사유를 작성해주세요."
            aria-invalid={reject.isError}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <span className="count" aria-live="polite">{text.length}/{REJECT_REASON_MAX_LENGTH}</span>
      </div>
      <Why text={firstWhy([reject.error])} />
    </Modal>
  );
}
