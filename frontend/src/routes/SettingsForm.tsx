// 설정 화면의 form 부품입니다. 합주실·기간 두 구역이 같은 부품을 사용합니다.
// 값을 보유하지 않으며, 서버도 호출하지 않습니다. 무엇을 저장할지는 호출하는 컴포넌트가 결정합니다.

import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

import { DeleteButton, EditButton } from "../components/controls";

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

/** 목록의 한 행입니다. 보기 모드에서는 데이터를 표시하고, 편집 모드이면 form 이 대신 표시됩니다.
 *  오른쪽 끝에 연필 아이콘(수정)과 휴지통 아이콘(삭제)이 표시됩니다. onEdit·onDelete 중 없는 쪽의 아이콘은 표시하지 않고,
 *  둘 다 없으면 데이터만 표시합니다. 권한이 없는 사용자에게 이 경우로 렌더링됩니다.
 *  모든 행의 외형이 같으므로 aria-label 이 무엇을 나타내는지 설명합니다. */
export function Row(props: {
  title: string;
  when: ReactNode;
  span: string;
  editLabel?: string;
  buttonRef?: (el: HTMLButtonElement | null) => void;
  onEdit?: () => void;
  deleteLabel?: string;
  onDelete?: () => void;
}) {
  const { title, when, span, editLabel, buttonRef, onEdit, deleteLabel, onDelete } = props;
  return (
    <li>
      <div>
        <div className="nm">{title}</div>
        <div className="when">
          {when}
          <span className="span">{span}</span>
        </div>
      </div>
      {onEdit === undefined && onDelete === undefined ? null : (
        <div className="acts">
          {onEdit === undefined ? null : <EditButton ref={buttonRef} label={editLabel ?? ""} onClick={onEdit} />}
          {onDelete === undefined ? null : <DeleteButton label={deleteLabel ?? ""} onClick={onDelete} />}
        </div>
      )}
    </li>
  );
}
