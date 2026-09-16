// 선택지 하나를 고르는 드롭다운입니다. 기본 select 를 대신해 화면마다 다르던 모양을 하나로 맞춥니다.
// 어느 선택지로 이동할지는 lib/dropdown.ts 가 계산하고, 이 파일은 열고 닫기·키 입력·그리기만 담당합니다.

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";

import { useDismissible } from "./hooks";
import { edgeChoice, moveChoice, openAt } from "../lib/dropdown";
import type { Choice } from "../lib/dropdown";

/** 고른 값과 선택지를 받아 목록을 그립니다. id 는 label 의 htmlFor 가 가리키는 버튼의 id 입니다.
 *  곁에 label 이 없는 자리에서는 id 대신 ariaLabel 로 이름을 답니다. 둘 중 하나는 있어야 합니다.
 *  value 가 선택지에 없으면 버튼에 placeholder 를 표시합니다. */
export function Dropdown<T extends string | number>({
  id, ariaLabel, value, choices, onChange, disabled = false, placeholder = "선택해주세요",
  invalid = false, describedBy, buttonRef, className,
}: {
  id?: string;
  ariaLabel?: string;
  className?: string;
  value: T;
  choices: Choice<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { open, setOpen, box } = useDismissible();
  // 키보드 커서입니다. 고른 값과 다를 수 있어 따로 둡니다. Enter 를 눌러야 고른 값이 됩니다.
  const [at, setAt] = useState(-1);
  const list = useRef<HTMLUListElement>(null);
  const picked = choices.find((choice) => choice.value === value);

  // 목록을 연 순간의 커서 위치를 잡습니다. 지금 고른 값이 있으면 그 자리입니다.
  useEffect(() => {
    if (open) setAt(openAt(choices, value));
  }, [open, choices, value]);

  // 커서가 목록 밖으로 나가면 그 칸이 보이도록 스크롤합니다. 목록이 길면 화면 밖에 있습니다.
  useEffect(() => {
    if (open && at >= 0) list.current?.children[at]?.scrollIntoView({ block: "nearest" });
  }, [open, at]);

  function pick(choice: Choice<T>): void {
    if (choice.disabled === true) return;
    onChange(choice.value);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (disabled) return;
    const keys = ["ArrowDown", "ArrowUp", "Enter", " "];
    if (!open) {
      // 닫힌 상태에서 이 키들은 목록을 엽니다. 기본 select 와 같은 동작입니다.
      if (keys.includes(event.key)) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === "Tab") {
      // Tab 은 막지 않습니다. 목록만 닫고 다음 요소로 넘어갑니다.
      setOpen(false);
      return;
    }
    const moved: Record<string, number> = {
      ArrowDown: moveChoice(choices, at, 1),
      ArrowUp: moveChoice(choices, at, -1),
      Home: edgeChoice(choices, 1),
      End: edgeChoice(choices, -1),
    };
    if (event.key in moved) {
      event.preventDefault();
      // 커서만 옮기고 값은 바꾸지 않습니다. 옮기는 도중의 값이 서버로 나가면 안 됩니다.
      if (moved[event.key] >= 0) setAt(moved[event.key]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (at >= 0) pick(choices[at]);
      else setOpen(false);
    }
  }

  return (
    <div className="dd" ref={box} onKeyDown={onKeyDown}>
      <button
        type="button"
        id={id}
        ref={buttonRef}
        className={className === undefined ? "ddbtn" : `ddbtn ${className}`}
        aria-label={ariaLabel}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onClick={() => setOpen(!open)}
      >
        <span className={picked === undefined ? "ddempty" : undefined}>
          {picked?.label ?? placeholder}
        </span>
        <svg viewBox="0 0 24 24" className="ddmark" fill="none" stroke="currentColor"
          strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {!open ? null : (
        <ul className="ddlist" role="listbox" aria-label={ariaLabel} aria-labelledby={id} ref={list}>
          {choices.map((choice, index) => (
            <li
              key={String(choice.value)}
              role="option"
              aria-selected={choice.value === value}
              aria-disabled={choice.disabled === true}
              className={[
                choice.disabled === true ? "ddoff" : "",
                index === at ? "ddat" : "",
              ].join(" ").trim() || undefined}
              onMouseEnter={() => { if (choice.disabled !== true) setAt(index); }}
              onClick={() => pick(choice)}
            >
              {choice.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
