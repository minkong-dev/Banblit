// 설정 화면의 서식 부품. 합주실·기간·권한 세 구역이 같은 것을 쓴다.
// 값을 들지 않고, 서버도 부르지 않는다 — 무엇을 저장할지는 부르는 구역이 정한다.

import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

export function reason(error: unknown): string {
  // error 를 받아 화면에 띄울 한 줄을 돌려준다.
  return error instanceof Error ? error.message : "저장하지 못했습니다";
}

/** 고치기/취소로 줄이 통째로 갈릴 때 초점이 사라지지 않게, 눌렀던 단추를 기억해 둔다. */
export function useRowFocus(): {
  editing: number | null;
  open: (id: number) => void;
  close: () => void;
  register: (id: number) => (el: HTMLButtonElement | null) => void;
} {
  const [editing, setEditing] = useState<number | null>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  // 되돌아갈 곳은 화면에 그려지는 값이 아니므로 state 로 들지 않는다. state 로 들면
  // 초점을 옮긴 뒤 그것을 비우려고 다시 그리게 된다.
  const back = useRef<number | null>(null);

  // 단추는 편집을 떠나며 다시 그려진다. 그려진 뒤에 초점을 옮겨야 잡힌다.
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

/** 고치기로 들어온 서식의 첫 칸에 초점을 옮긴다. autoFocus 는 이 화면에서 걸리지
 *  않아 직접 옮긴다. 추가 서식(editing 이 아닌 것)에는 걸지 않는다 — 화면을 열자마자
 *  아래쪽 서식으로 끌려가면 안 된다. */
export function useFirstField<T extends HTMLElement>(editing: boolean): RefObject<T | null> {
  const first = useRef<T>(null);
  useEffect(() => {
    if (editing) first.current?.focus();
  }, [editing]);
  return first;
}

/** 서식 한 벌의 상태. 사람이 손대기 전에는 빨간 사유를 띄우지 않으려고 touched 를 함께 든다. */
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

/** 서식 한 칸. 계정 화면의 Field 는 그쪽 CSS 에 묶여 있어 여기서는 쓰지 않는다. */
export function Cell(props: { label: string; htmlFor: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={props.wide ? "wide" : undefined} htmlFor={props.htmlFor}>
      {props.label}
      {props.children}
    </label>
  );
}

export function CardState({ state, empty }: { state: string; empty: string }) {
  // 비어 있는 것과 고장 난 것을 구분해서 말한다.
  if (state === "loading") return <div className="empty">불러오는 중…</div>;
  return <div className="empty">{state === "" ? empty : state}</div>;
}

/** 목록 한 줄 — 보고 있는 상태. 고치는 중이면 카드가 서식을 대신 그린다.
 *  onEdit 이 없으면 값만 보여준다 — 고칠 항목이 없는 사람에게 그리는 줄이다. */
export function Row(props: {
  title: string;
  when: ReactNode;
  span: string;
  editLabel?: string;
  buttonRef?: (el: HTMLButtonElement | null) => void;
  onEdit?: () => void;
  /** 고치기 옆에 더 붙일 단추. 권한 묶음의 지우기가 이 자리를 쓴다. */
  extra?: ReactNode;
}) {
  const { title, when, span, editLabel, buttonRef, onEdit, extra } = props;
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
          <button className="btn" ref={buttonRef} aria-label={editLabel} onClick={onEdit}>
            고치기
          </button>
          {extra}
        </div>
      )}
    </li>
  );
}

/** 서식 꼬리 — 취소·저장 단추와 사유. 세 서식이 같은 것을 쓴다. */
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
      {/* role="alert" 이라야 화면을 보지 않는 사람에게도 사유가 전해진다. */}
      {bad === "" ? null : <p className="why" id={whyId} role="alert">{bad}</p>}
    </>
  );
}
