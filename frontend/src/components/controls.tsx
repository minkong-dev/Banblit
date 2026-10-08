// 화면 전체가 공유하는 입력·버튼 요소입니다. 본질이 같은 요소는 여기 1개뿐이고, 크기·색은 CSS 가 자리에 따라 정합니다.
// 값을 보유하지 않고 서버도 호출하지 않습니다. 무엇을 할지는 호출하는 화면이 결정합니다.
// 외형(class 이름)은 styles/controls.css 가 담당합니다.

import type { ChangeEvent, ComponentProps, ReactNode } from "react";
import { Link } from "react-router-dom";

import { stateText } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, PencilIcon, TrashIcon } from "./icons";

// ===== 버튼 =====

const BUTTON_CLASS = { go: "btn go", ghost: "btn", danger: "btn warn" } as const;

/** 글자 버튼입니다. go 는 주 행동(저장·제출), ghost 는 보조(취소), danger 는 되돌릴 수 없는 동작입니다.
 *  to 를 주면 같은 모양의 링크(Link)가 됩니다. pending 이면 비활성화하고 pendingLabel 을 표시합니다. */
export function Button({ kind, to, pending = false, pendingLabel = "저장하는 중…", className, children, type = "button", ...rest }: {
  kind: keyof typeof BUTTON_CLASS;
  to?: string;
  pending?: boolean;
  pendingLabel?: string;
  children: ReactNode;
} & Omit<ComponentProps<"button">, "children">) {
  const cls = className === undefined ? BUTTON_CLASS[kind] : `${BUTTON_CLASS[kind]} ${className}`;
  if (to !== undefined) return <Link className={cls} to={to}>{children}</Link>;
  return (
    <button {...rest} type={type} className={cls} disabled={pending || rest.disabled}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/** 아이콘 1개짜리 버튼입니다. label 은 스크린 리더가 읽는 이름(aria-label)입니다. */
export function IconButton({ label, icon, danger = false, pressed, className, ...rest }: {
  label: string;
  icon: ReactNode;
  danger?: boolean;
  pressed?: boolean;
} & Omit<ComponentProps<"button">, "children">) {
  const cls = ["ic", danger ? "danger" : "", className ?? ""].filter((part) => part !== "").join(" ");
  return (
    <button {...rest} type="button" className={cls} aria-label={label} aria-pressed={pressed}>
      {icon}
    </button>
  );
}

type IconButtonRest = Omit<ComponentProps<typeof IconButton>, "icon" | "label">;

export function EditButton(props: IconButtonRest & { label: string }) {
  return <IconButton {...props} icon={<PencilIcon />} />;
}

export function DeleteButton(props: IconButtonRest & { label: string }) {
  return <IconButton {...props} danger icon={<TrashIcon />} />;
}

export function CloseButton(props: IconButtonRest & { label?: string }) {
  return <IconButton {...props} label={props.label ?? "닫기"} icon={<CloseIcon />} />;
}

export function BackButton(props: IconButtonRest & { label?: string }) {
  return <IconButton {...props} label={props.label ?? "뒤로 가기"} icon={<ChevronLeftIcon />} />;
}

/** 이전·다음 이동 버튼입니다. dir 가 아이콘 방향을 정합니다. */
export function NavButton({ dir, ...props }: IconButtonRest & { dir: "prev" | "next"; label: string }) {
  return <IconButton {...props} icon={dir === "prev" ? <ChevronLeftIcon /> : <ChevronRightIcon />} />;
}

/** 팝업 메뉴(popover) 안의 항목 1개입니다. */
export function MenuItem({ className, ...rest }: ComponentProps<"button">) {
  return <button {...rest} type="button" className={className === undefined ? "act" : `act ${className}`} />;
}

// ===== 입력 =====

/** 켜고 끄는 항목 1개입니다. check 는 제출 시 적용되는 체크 표시, switch 는 즉시 적용되는 스위치(role="switch")입니다.
 *  check 는 input 을 시각적으로만 감추고 CheckIcon 을 표시합니다. 키보드 이동과 스크린 리더 읽기는 그 input 이 처리합니다.
 *  label 을 만들지 않으므로 부모 label 안에 두거나 htmlFor 로 연결합니다. */
export function Toggle({ kind, onChange, ...rest }: {
  kind: "check" | "switch";
  onChange?: (checked: boolean) => void;
} & Omit<ComponentProps<"input">, "type" | "onChange">) {
  const input = (
    <input
      {...rest}
      type="checkbox"
      className={kind === "switch" ? "sw" : undefined}
      role={kind === "switch" ? "switch" : undefined}
      onChange={(event) => onChange?.(event.target.checked)}
    />
  );
  if (kind === "switch") return input;
  return <span className="chk">{input}<CheckIcon className="chkmark" /></span>;
}

/** form 입력칸 1개의 label 입니다. 설정 화면과 시작·종료 쌍이 사용합니다. */
export function Cell(props: { label: string; htmlFor: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={props.wide ? "wide" : undefined} htmlFor={props.htmlFor}>
      {props.label}
      {props.children}
    </label>
  );
}

type RangeProps = {
  /** 두 input 의 id 앞부분입니다. `${id}-from`, `${id}-to` 가 됩니다. */
  id: string;
  labels: [string, string];
  value: [string, string];
  onChange: (next: [string, string]) => void;
  disabled?: boolean;
  /** 오류 표시입니다. 두 input 에 같이 붙입니다. */
  invalid?: { "aria-invalid": boolean; "aria-describedby": string | undefined };
};

function Range({ type, id, labels, value, onChange, disabled, invalid, step, min, minTo, max }: RangeProps & {
  type: "time" | "date";
  step?: number;
  min?: string;
  minTo?: string;
  max?: string;
}) {
  const [from, to] = value;
  return (
    <>
      <Cell label={labels[0]} htmlFor={`${id}-from`}>
        <input
          id={`${id}-from`} type={type} step={step} min={min} max={max} value={from} disabled={disabled} {...invalid}
          onChange={(event) => onChange([event.target.value, to])}
        />
      </Cell>
      <Cell label={labels[1]} htmlFor={`${id}-to`}>
        <input
          id={`${id}-to`} type={type} step={step} min={minTo} max={max} value={to} disabled={disabled} {...invalid}
          onChange={(event) => onChange([from, event.target.value])}
        />
      </Cell>
    </>
  );
}

/** 시작·종료 시간 쌍입니다. step 은 초 단위(1시간 칸이면 3600)입니다. */
export function TimeRange(props: RangeProps & { step?: number }) {
  return Range({ ...props, type: "time" });
}

/** 시작·종료 날짜 쌍입니다. 종료일의 min 은 시작일(비어 있으면 min)이고, max 는 두 칸에 같이 붙습니다. */
export function DateRange(props: RangeProps & { min?: string; max?: string }) {
  const minTo = props.value[0] === "" ? props.min : props.value[0];
  return Range({ ...props, type: "date", minTo });
}

/** 검색어 입력칸입니다. */
export function SearchInput({ label, onChange, ...rest }: {
  label: string;
  onChange: (value: string) => void;
} & Omit<ComponentProps<"input">, "type" | "onChange">) {
  return <input {...rest} type="search" aria-label={label} onChange={(event) => onChange(event.target.value)} />;
}

/** 숨긴 파일 input 입니다. 여는 버튼은 ref 의 click() 을 호출합니다. 같은 파일을 다시 선택해도
 *  변경으로 감지되도록 선택 뒤에 값을 비웁니다. */
export function FilePicker({ onFiles, ...rest }: {
  onFiles: (files: File[]) => void;
} & Omit<ComponentProps<"input">, "type" | "onChange" | "hidden">) {
  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) onFiles(files);
  };
  return <input {...rest} type="file" hidden onChange={onChange} />;
}

// ===== 문구 =====

/** 오류 문구입니다. 빈 문자열이면 그리지 않습니다. role="alert" 로 스크린 리더에도 전달됩니다. */
export function Why({ text, id }: { text: string; id?: string }) {
  if (text === "") return null;
  return <p className="why" id={id} role="alert">{text}</p>;
}

/** 목록이 비었거나 불러오는 중·실패일 때 그 자리에 표시하는 문구입니다. state 가 있으면 stateText 가 문구를 정합니다. */
export function Empty({ state, text, as: Tag = "p" }: { state?: LoadState; text: string; as?: "p" | "li" | "div" }) {
  // 실패는 alert, 불러오는 중은 status 로 스크린 리더에 전달합니다. 비어 있음은 일반 문구입니다.
  const role = state?.kind === "failed" ? "alert" : state?.kind === "loading" ? "status" : undefined;
  return <Tag className="empty" role={role}>{state === undefined ? text : stateText(state, text)}</Tag>;
}

// ===== form 아래 줄 =====

/** 취소·저장 버튼 줄과 오류 문구입니다. onSubmit 이 없으면 저장 버튼이 form 을 제출(type="submit")하고,
 *  있으면 그 함수를 호출합니다(modal 처럼 form 이 없는 자리). extra 는 왼쪽에 추가로 붙는 버튼입니다. */
export function FormFoot({ submitLabel, pendingLabel, pending, blocked = false, onCancel, onSubmit, extra, bad = "", whyId }: {
  submitLabel: string;
  pendingLabel?: string;
  pending: boolean;
  blocked?: boolean;
  onCancel?: () => void;
  onSubmit?: () => void;
  extra?: ReactNode;
  bad?: string;
  whyId?: string;
}) {
  return (
    <>
      <div className="acts">
        {extra}
        {onCancel === undefined ? null : <Button kind="ghost" onClick={onCancel}>취소</Button>}
        <Button
          kind="go"
          type={onSubmit === undefined ? "submit" : "button"}
          onClick={onSubmit}
          pending={pending}
          pendingLabel={pendingLabel}
          disabled={blocked}
        >
          {submitLabel}
        </Button>
      </div>
      <Why text={bad} id={whyId} />
    </>
  );
}
