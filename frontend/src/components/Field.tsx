// 입력 필드 하나와, 필드에서 값을 추출해 검증 결과를 도출하는 것입니다. 계정 화면 다섯 벌에서 씁니다.
// 합주실·기간 설정 화면은 사용하지 않습니다 — 입력 필드의 DOM 식별자로 name을 그대로 사용하는데,
// 그 화면에는 추가 필드와 수정 행이 함께 표시되어 같은 식별자가 두 개 생기기 때문입니다.

import { useState } from "react";

import { EyeIcon, EyeOffIcon } from "./icons";

export type Errors = Record<string, string>;

/** 검증 결과에서 오류 메시지가 있는 것만 필터링합니다. 없으면 통과입니다. */
export function failures(checked: Errors): Errors {
  return Object.fromEntries(Object.entries(checked).filter(([, message]) => message !== ""));
}

/** 제출된 폼 데이터에서 name으로 값을 추출합니다. 없거나 파일 객체면 빈 문자열입니다 — 이 필드들에는
 *  파일 입력이 없으니, 값이 진짜 문자열일 때만 사용합니다. */
export function fieldText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

export function Field(props: {
  name: string;
  label: string;
  type: string;
  placeholder: string;
  autoComplete: string;
  inputMode?: "email" | "tel" | "numeric";
  error?: string;
}) {
  const { name, label, type, placeholder, autoComplete, inputMode, error } = props;
  // 비밀번호 필드에만 눈 버튼가 붙습니다. 누르면 type이 text로 변경되어 문자가 그대로 표시됩니다.
  // 브라우저는 type=password인 필드만 마스킹하므로, 마스킹 토글을 type으로 처리합니다.
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  return (
    <div className={error ? "field err" : "field"}>
      <label htmlFor={name}>{label}</label>
      <div className={isPassword ? "hold peekable" : "hold"}>
        <input
          id={name}
          name={name}
          type={isPassword && shown ? "text" : type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          aria-invalid={error !== undefined}
        />
        {!isPassword ? null : (
          <button
            type="button"
            className="peek"
            aria-label={shown ? "비밀번호 가리기" : "비밀번호 보기"}
            aria-pressed={shown}
            onClick={() => setShown(!shown)}
          >
            {shown ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      <p className="bad">{error ?? ""}</p>
    </div>
  );
}
