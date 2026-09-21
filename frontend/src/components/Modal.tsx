// 팀 생성, 합주실 관리, 집중 합주기간 설정, permission set(권한 집합) 편집이 모두 같은 layout 으로 표시됩니다.
// 제목 줄, 내용, 아래쪽 버튼 줄 순서입니다. 각 화면마다 <dialog> 를 따로 정의하면 한쪽만 수정되어
// 일관성이 깨지므로, 이 파일에서 공통 modal(화면 위에 뜨는 대화 상자)을 관리합니다.
//
// 브라우저 <dialog> 를 showModal() 로 엽니다. backdrop(배경 어두움), focus(키보드 입력을 받는
// 요소 상태) 관리, Esc 닫기는 모두 브라우저가 자동으로 처리하므로 따로 구현하지 않습니다.

import { useEffect, useId, useRef } from "react";
import { CloseIcon } from "./icons";

export function Modal({ title, hint, foot, panes, children, onClose }: {
  title: string;
  /** 제목 아래 설명 한 줄입니다. 없으면 렌더하지 않습니다. */
  hint?: string;
  /** 아래 버튼 줄. 없으면 줄 전체를 렌더하지 않습니다(읽기 전용 modal 이 그렇습니다). */
  foot?: React.ReactNode;
  /** true 면 dialog 는 투명한 grid 틀만 되고 제목 줄·본문·버튼 줄을 렌더하지 않습니다. children 이 카드(.pane)마다
   *  제목과 버튼을 직접 배치합니다(하루 dialog 의 3단). 배치는 shell.css 의 dialog.panes 가 결정합니다. */
  panes?: boolean;
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

  // 바깥(backdrop)을 누르면 닫습니다. <dialog> 는 backdrop 도 자기 영역이라, 누른 자리가 dialog
  // 자신이면 내용이 아닌 바깥입니다. 누른 위치와 뗀 위치를 모두 확인하는 이유는, 내용 안에서
  // 글자를 끌어 선택하다 바깥에서 손을 떼면 click 의 target 이 dialog 가 되어 닫히기 때문입니다.
  // JSX 속성이 아니라 ref 에 직접 등록합니다. <dialog> 는 상호작용 요소가 아니라서 속성으로 붙이면
  // jsx-a11y 가 거부하고, 키보드 사용자는 이 동작이 아니라 Esc 로 닫습니다(브라우저 기본 동작).
  useEffect(() => {
    const box = dialog.current;
    if (box === null) return;
    let downOnBackdrop = false;
    const onDown = (event: MouseEvent) => { downOnBackdrop = event.target === box; };
    const onClick = (event: MouseEvent) => {
      if (downOnBackdrop && event.target === box) box.close();
    };
    box.addEventListener("mousedown", onDown);
    box.addEventListener("click", onClick);
    return () => {
      box.removeEventListener("mousedown", onDown);
      box.removeEventListener("click", onClick);
    };
  }, []);

  if (panes) {
    return (
      <dialog
        ref={dialog}
        className="panes"
        aria-label={title}
        onClose={onClose}
      >
        {children}
      </dialog>
    );
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <div className="mhead">
        <div>
          <h2 id={titleId}>{title}</h2>
          {hint === undefined ? null : <p>{hint}</p>}
        </div>
        <button aria-label="닫기" onClick={() => dialog.current?.close()}>
          <CloseIcon />
        </button>
      </div>

      <div className="mbody">{children}</div>

      {foot === undefined ? null : <div className="mfoot">{foot}</div>}
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
