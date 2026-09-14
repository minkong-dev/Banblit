// 켜고 끄는 항목 하나입니다. 브라우저 기본 체크박스 대신 테두리 없는 체크 표시를 표시합니다.
//
// 실제 input을 삭제하지 않고 시각적으로만 감춥니다 — 키보드로 이동하기와 스크린 리더가
// "선택 안 됨/선택됨"으로 읽는 것도 그 input이 처리합니다. 그림만 표시하면 둘 다 사라집니다.
//
// label을 자동으로 생성하지 않으므로 부모 label 안에 삽입해야 합니다. label 안에 label을
// 두는 것은 올바른 마크업이 아닙니다.

import { CheckIcon } from "./icons";

export function CheckMark(props: {
  id?: string;
  name?: string;
  /** 값을 부모가 들고 있으면 이 둘을 함께 전달합니다. 없으면 input이 자체적으로 관리합니다. */
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  defaultChecked?: boolean;
  disabled?: boolean;
  /** 감싸는 label이 없을 때만 지정합니다 — 스크린 리더가 읽을 이름이 사라지지 않게. */
  label?: string;
}) {
  const { id, name, checked, onChange, defaultChecked, disabled, label } = props;
  return (
    <span className="chk">
      <input
        id={id}
        name={name}
        type="checkbox"
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <CheckIcon className="chkmark" />
    </span>
  );
}
