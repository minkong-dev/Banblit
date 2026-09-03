// 서식 한 줄과, 서식에서 값을 꺼내고 검사 결과를 추리는 것. 계정 화면 다섯 벌이
// 이것을 쓰고, 나중에 합주실·기간 설정 화면도 같은 것을 쓴다.

export type Errors = Record<string, string>;

/** 검사 결과에서 사유가 남은 것만 골라 낸다. 하나도 없으면 통과다. */
export function failures(checked: Errors): Errors {
  return Object.fromEntries(Object.entries(checked).filter(([, message]) => message !== ""));
}

/** 서식에서 이름으로 값을 꺼낸다. 없으면 빈 문자열. */
export function fieldText(form: HTMLFormElement, name: string): string {
  return String(new FormData(form).get(name) ?? "");
}

export function Field(props: {
  name: string;
  label: string;
  type: string;
  placeholder: string;
  autoComplete: string;
  inputMode?: "email" | "tel";
  error?: string;
}) {
  const { name, label, type, placeholder, autoComplete, inputMode, error } = props;
  return (
    <div className={error ? "field err" : "field"}>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error !== undefined}
      />
      <p className="bad">{error ?? ""}</p>
    </div>
  );
}
