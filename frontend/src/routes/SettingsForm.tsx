// 설정 화면의 form 부품입니다. 합주실·기간 두 구역이 같은 부품을 사용합니다.
// 값을 보유하지 않으며, 서버도 호출하지 않습니다. 무엇을 저장할지는 호출하는 컴포넌트가 정합니다.

import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

import { stateText } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import { PencilIcon } from "../components/icons";


/** 수정/취소로 행이 재생성될 때 초점이 유지되도록, 편집 시작 전 눌린 버튼을 기억합니다. */
export function useRowFocus(): {
  editing: number | null;
  open: (id: number) => void;
  close: () => void;
  register: (id: number) => (el: HTMLButtonElement | null) => void;
} {
  const [editing, setEditing] = useState<number | null>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  // 돌아갈 버튼 ID를 state가 아닌 ref로 보유합니다. state로 보유하면 초점 이동 후 값을 비우는 과정에서 불필요한 재생성이 발생합니다.
  const back = useRef<number | null>(null);

  // 편집 모드를 벗어나면 버튼이 재생성됩니다. 재생성 후 초점을 옮겨야 작동합니다.
  useEffect(() => {
    if (editing !== null || back.current === null) return;
    buttons.current.get(back.current)?.focus();
    back.current = null;
  }, [editing]);

  return {
    editing,
    open: (id) => setEditing(id),
    close: () => {
      back.current = editing;
      setEditing(null);
    },
    register: (id) => (el) => {
      if (el === null) buttons.current.delete(id);
      else buttons.current.set(id, el);
    },
  };
}

/** 편집 모드에 진입한 form 의 첫 입력칸으로 초점을 이동합니다. autoFocus 속성이 이 화면에서 동작하지 않아 직접 이동합니다.
 *  추가 form(editing 이 false 인 경우)에는 적용하지 않습니다. 화면이 열린 직후 아래쪽 form 으로 초점이 이동하면 안 됩니다. */
export function useFirstField<T extends HTMLElement>(editing: boolean): RefObject<T | null> {
  const first = useRef<T>(null);
  useEffect(() => {
    if (editing) first.current?.focus();
  }, [editing]);
  return first;
}

/** form 하나의 상태입니다. 사용자가 입력하기 전에는 오류 메시지를 표시하지 않으려고 touched 를 함께 보유합니다. */
export function useForm<T>(start: T): [T, (next: T) => void, boolean, () => void] {
  const [value, write] = useState(start);
  const [touched, setTouched] = useState(false);
  const set = (next: T): void => {
    setTouched(true);
    write(next);
  };
  const reset = (): void => {
    setTouched(false);
    write(start);
  };
  return [value, set, touched, reset];
}

/** form 입력칸입니다. 계정 화면의 Field 는 그 화면의 CSS 에 종속되어 있어 이 화면에서는 사용하지 않습니다. */
export function Cell(props: { label: string; htmlFor: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={props.wide ? "wide" : undefined} htmlFor={props.htmlFor}>
      {props.label}
      {props.children}
    </label>
  );
}

export function CardState({ state, empty }: { state: LoadState; empty: string }) {
  return <div className="empty">{stateText(state, empty)}</div>;
}

/** 목록의 한 행입니다. 보기 모드에서는 데이터를 표시하고, 편집 모드이면 form 이 대신 표시됩니다.
 *  오른쪽 끝에 연필 아이콘(수정)이 표시되며, onEdit 이 없으면 데이터만 표시합니다. 수정 권한이 없는 사용자에게 이 경우로 렌더링됩니다.
 *  모든 행의 외형이 같으므로 aria-label 이 무엇을 나타내는지 설명합니다. */
export function Row(props: {
  title: string;
  when: ReactNode;
  span: string;
  editLabel?: string;
  buttonRef?: (el: HTMLButtonElement | null) => void;
  onEdit?: () => void;
}) {
  const { title, when, span, editLabel, buttonRef, onEdit } = props;
  return (
    <li>
      <div>
        <div className="nm">{title}</div>
        <div className="when">
          {when}
          <span className="span">{span}</span>
        </div>
      </div>
      {onEdit === undefined ? null : (
        <div className="acts">
          <button className="ic" ref={buttonRef} aria-label={editLabel} onClick={onEdit}>
            <PencilIcon />
          </button>
        </div>
      )}
    </li>
  );
}

/** form 아래 줄입니다. 취소·저장 버튼과 오류 메시지를 표시합니다. form 3개가 같은 부품을 사용합니다. */
export function FormTail(props: {
  submit: string;
  pending: boolean;
  blocked: boolean;
  bad: string;
  whyId: string;
  onCancel?: () => void;
}) {
  const { submit, pending, blocked, bad, whyId, onCancel } = props;
  return (
    <>
      <div className="acts">
        {onCancel === undefined ? null : (
          <button className="btn" type="button" onClick={onCancel}>취소</button>
        )}
        <button className="btn go" type="submit" disabled={blocked || pending}>
          {pending ? "저장하는 중…" : submit}
        </button>
      </div>
      {/* role="alert"를 지정해야 스크린 리더 사용자에게도 오류가 전달됩니다. */}
      {bad === "" ? null : <p className="why" id={whyId} role="alert">{bad}</p>}
    </>
  );
}
