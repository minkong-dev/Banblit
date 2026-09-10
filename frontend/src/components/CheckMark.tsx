// 켜고 끄는 자리 하나. 브라우저 기본 네모 대신 테두리 없는 체크 표시를 세운다.
//
// 진짜 input 을 지우지 않고 눈에서만 감춘다 — 키보드로 옮겨 다니는 것도, 화면 낭독기가
// "선택 안 됨/선택됨" 으로 읽는 것도 그 input 이 하는 일이다. 그림만 두면 둘 다 사라진다.
//
// 스스로 label 을 만들지 않으므로 부르는 쪽의 label 안에 넣는다. label 안에 label 을
// 두는 것은 올바른 문서가 아니다.

import { CheckIcon } from "./icons";

export function CheckMark(props: {
  id?: string;
  name?: string;
  /** 값을 바깥이 들고 있으면 이 둘을 함께 준다. 없으면 input 이 스스로 들고 있는다. */
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  defaultChecked?: boolean;
  disabled?: boolean;
  /** 감싸는 label 이 없을 때만 적는다 — 낭독기가 읽을 이름이 사라지지 않게. */
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
