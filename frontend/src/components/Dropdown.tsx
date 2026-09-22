// 선택지 하나를 선택하는 드롭다운입니다. 기본 select 를 대신해 화면마다 다르던 모양을 하나로 맞춥니다.
// 어느 선택지로 이동할지는 lib/dropdown.ts 가 계산하고, 이 파일은 열고 닫기·키 입력·그리기만 담당합니다.

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";

import { useDismissible } from "./hooks";
import { edgeChoice, moveChoice, openAt } from "../lib/dropdown";
import type { Choice } from "../lib/dropdown";

/** 선택한 값과 선택지를 받아 목록을 그립니다. id 는 label 의 htmlFor 가 가리키는 버튼의 id 입니다.
 *  곁에 label 이 없는 자리에서는 id 대신 ariaLabel 로 이름을 답니다. 둘 중 하나는 있어야 합니다.
 *  value 가 선택지에 없으면 버튼에 placeholder 를 표시합니다. */
/** 선택지 하나의 id 입니다. aria-activedescendant 가 이 값으로 커서 위치를 가리킵니다. */
function optionId(id: string | undefined, index: number): string {
  return `${id ?? "dd"}-opt-${index}`;
}

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
  // 키보드 커서입니다. 선택한 값과 다를 수 있어 따로 둡니다. Enter 를 눌러야 선택한 값이 됩니다.
  const [at, setAt] = useState(-1);
  const list = useRef<HTMLUListElement>(null);
  const picked = choices.find((choice) => choice.value === value);

  /** 목록을 엽니다. 여는 순간의 커서는 지금 선택한 값의 자리입니다. */
  function show(): void {
    setAt(openAt(choices, value));
    setOpen(true);
  }

  // 커서가 목록 밖으로 나가면 그 칸이 보이도록 스크롤합니다. 목록이 길면 화면 밖에 있습니다.
  useEffect(() => {
    if (open && at >= 0) list.current?.children[at]?.scrollIntoView({ block: "nearest" });
  }, [open, at]);

  function pick(choice: Choice<T>): void {
    if (choice.disabled === true) return;
    onChange(choice.value);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (disabled) return;
    const keys = ["ArrowDown", "ArrowUp", "Enter", " "];
    if (!open) {
      // 닫힌 상태에서 이 키들은 목록을 엽니다. 기본 select 와 같은 동작입니다.
      if (keys.includes(event.key)) {
        event.preventDefault();
        show();
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
      // 커서만 옮기고 값은 변경하지 않습니다. 옮기는 도중의 값이 서버로 나가면 안 됩니다.
      if (moved[event.key] >= 0) setAt(moved[event.key]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (at >= 0) pick(choices[at]);
      else setOpen(false);
    }
  }

  return (
    <div className="dd" ref={box}>
      <button
        type="button"
        id={id}
        ref={buttonRef}
        className={[("ddbtn"), className, invalid ? "bad" : ""].filter(Boolean).join(" ")}
        aria-label={ariaLabel}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-describedby={describedBy}
        // 목록의 커서를 버튼에 붙여 알립니다. 초점은 버튼에 그대로 있고 커서만 목록 안에서 움직입니다.
        aria-activedescendant={open && at >= 0 ? optionId(id, at) : undefined}
        onKeyDown={onKeyDown}
        onClick={() => { if (open) setOpen(false); else show(); }}
      >
        <span className={picked === undefined ? "ddempty" : undefined}>
          {picked?.label ?? placeholder}
        </span>
        <svg viewBox="0 0 24 24" className="ddmark" fill="none" stroke="currentColor"
          strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {/* 선택지가 없으면 목록을 그리지 않습니다. 빈 목록은 안쪽 여백만 남아 얇은 칸으로 보입니다. */}
      {!open || choices.length === 0 ? null : (
        <ul className="ddlist" role="listbox" aria-label={ariaLabel} aria-labelledby={id} ref={list}>
          {choices.map((choice, index) => (
            // 목록의 초점은 버튼에 있고 키 입력도 버튼이 받습니다(aria-activedescendant).
            // 그래서 이 줄에는 누를 때의 처리만 두고, 키보드 처리는 두지 않습니다.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={String(choice.value)}
              id={optionId(id, index)}
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
