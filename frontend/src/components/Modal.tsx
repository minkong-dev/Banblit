// 팀 생성, 합주실 관리, 집중 합주기간 설정, permission set(권한 집합) 편집이 모두 같은 layout 으로 표시됩니다.
// 제목 줄, 내용, 아래쪽 버튼 줄 순서입니다. 각 화면마다 <dialog> 를 따로 정의하면 한쪽만 수정되어
// 일관성이 깨지므로, 이 파일에서 공통 modal(화면 위에 뜨는 대화 상자)을 관리합니다.
//
// 브라우저 <dialog> 를 showModal() 로 엽니다. backdrop(배경 어두움), focus(키보드 입력을 받는
// 요소 상태) 관리, Esc 닫기는 모두 브라우저가 자동으로 처리하므로 따로 구현하지 않습니다.

import { useEffect, useId, useRef } from "react";
import { CloseIcon } from "./icons";

export function Modal(props: {
  title: string;
  /** 제목 아래 설명 한 줄입니다. 없으면 렌더하지 않습니다. */
  hint?: string;
  /** 아래 버튼 줄. 없으면 줄 전체를 렌더하지 않습니다(읽기 전용 modal 이 그렇습니다). */
  foot?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // MemberSearch modal 이 Modal 위에 stacked(중첩)됩니다. titleId 가 같으면 두 modal 이
  // 서로의 aria-labelledby 를 잘못 참조합니다.
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

/** 이름(왼쪽)과 숫자·버튼(오른쪽)를 한 줄에 표시합니다. 예: `드럼   − 1 +`. */
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
