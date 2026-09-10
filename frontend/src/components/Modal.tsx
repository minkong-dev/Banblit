// 팀·합주실·기간·권한이 전부 같은 모양으로 뜬다 — 제목 줄, 내용, 아래 단추 줄.
// 화면마다 <dialog> 를 다시 적으면 한쪽만 고쳐져 어긋나므로 여기 한 벌만 둔다.
//
// 브라우저의 <dialog> 를 showModal 로 연다. 뒤쪽을 가리는 것, 초점을 안으로 넣는 것,
// Esc 로 닫는 것이 전부 브라우저 몫이라 따로 만들지 않는다.

import { useEffect, useId, useRef } from "react";
import { CloseIcon } from "./icons";

export function Modal(props: {
  title: string;
  /** 제목 아래 한 줄. 없으면 그리지 않는다. */
  hint?: string;
  /** 아래 단추 줄. 없으면 줄 자체가 없다 — 보기만 하는 모달이 그렇다. */
  foot?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // 사람 찾기가 팀 만들기 위에 한 겹 더 뜬다. 제목 id 가 같으면 두 모달이 서로를 가리킨다.
  const titleId = useId();

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby={titleId} onClose={props.onClose}>
      <div className="mhead">
        <div>
          <h2 id={titleId}>{props.title}</h2>
          {props.hint === undefined ? null : <p>{props.hint}</p>}
        </div>
        <button aria-label="닫기" onClick={() => dialog.current?.close()}>
          <CloseIcon />
        </button>
      </div>

      <div className="mbody">{props.children}</div>

      {props.foot === undefined ? null : <div className="mfoot">{props.foot}</div>}
    </dialog>
  );
}

/** `드럼   − 1 +` 한 줄. 왼쪽에 이름, 오른쪽에 숫자와 단추. */
export function Stepper(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const { label, value, min, max, onChange } = props;
  return (
    <div className="stepper">
      <span>{label}</span>
      <div className="stepbox">
        <button
          type="button"
          aria-label={`${label} 인원 감소`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          −
        </button>
        <b aria-live="polite">{value}</b>
        <button
          type="button"
          aria-label={`${label} 인원 추가`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
