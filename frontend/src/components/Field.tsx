// 서식 한 줄과, 서식에서 값을 꺼내고 검사 결과를 추리는 것. 계정 화면 다섯 벌이 쓴다.
// 합주실·기간 설정 화면은 쓰지 않는다 — 입력칸의 화면 안 식별자를 name 그대로 쓰는데,
// 그 화면은 추가 서식과 고치는 줄이 함께 떠 있어 같은 식별자가 두 개 생긴다.

import { useState } from "react";

import { EyeIcon, EyeOffIcon } from "./icons";

export type Errors = Record<string, string>;

/** 검사 결과에서 사유가 남은 것만 골라 낸다. 하나도 없으면 통과다. */
export function failures(checked: Errors): Errors {
  return Object.fromEntries(Object.entries(checked).filter(([, message]) => message !== ""));
}

/** 서식에서 이름으로 값을 꺼낸다. 없거나 파일이면 빈 문자열 — 이 서식들에는 파일
 *  입력이 없으니, 값이 진짜 문자열일 때만 쓴다. */
export function fieldText(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
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
  // 비밀번호 칸에만 눈 단추가 붙는다. 누르면 type 이 text 로 바뀌어 글자가 그대로 보인다.
  // 브라우저는 type=password 인 칸만 가리므로, 가리고 보이는 것을 type 으로 다룬다.
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
