// 계정 화면의 입력 검증입니다. 값이 유효하면 빈 문자열을, 그렇지 않으면 사용자가 읽을 수 있는 오류 메시지를 반환합니다.
// 오류 메시지가 화면에 표시되는 빨간 텍스트입니다.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN = 8;
const STRONG_MIN = 8;
const STRONG_MAX = 20;

export function emailMessage(value: string): string {
  // @ 기호 앞뒤에 공백이 없고 마지막 점 뒤가 두 글자 이상이어야 합니다.
  if (!value) return "이메일을 입력해 주세요.";
  return EMAIL.test(value) ? "" : "이메일 형식이 맞는지 확인해주세요.";
}

/** 로그인 입력 필드입니다. 강화된 규칙을 적용하지 않습니다. 이 함수에서 규칙을 강화하면 규칙 변경 전에 생성한 계정이 로그인할 수 없게 됩니다. 유효성은 서버가 판단합니다. */
export function passwordMessage(value: string): string {
  if (!value) return "비밀번호를 입력해 주세요.";
  return value.length < PASSWORD_MIN ? "비밀번호는 8자 이상으로 작성해주세요." : "";
}

/** 새로 설정하는 비밀번호가 충족해야 할 규칙입니다. 가입과 재설정이 이 함수를 공유합니다. 화면마다 따로 정의하면 규칙이 어긋납니다. 서버의 같은 규칙은 input.py 의 require_password() 입니다. 빈 값은 호출자가 먼저 검증합니다. 화면마다 표시하는 문구가 다르기 때문입니다. */
function passwordRuleMessage(value: string): string {
  if (value.length < STRONG_MIN || value.length > STRONG_MAX) {
    return "8자에서 20자 사이로 입력해주세요.";
  }
  if (!/[a-z]/.test(value)) return "소문자를 하나 이상 넣어주세요.";
  if (!/[A-Z]/.test(value)) return "대문자를 하나 이상 넣어주세요.";
  if (!/[0-9]/.test(value)) return "숫자를 하나 이상 넣어주세요.";
  if (!/[^A-Za-z0-9]/.test(value)) return "특수기호를 하나 이상 넣어주세요.";
  return "";
}

/** 가입에서 처음 설정하는 비밀번호입니다. */
export function signupPasswordMessage(value: string): string {
  if (!value) return "비밀번호를 입력해 주세요.";
  return passwordRuleMessage(value);
}

/** 재설정에서 다시 설정하는 비밀번호입니다. */
export function strongPasswordMessage(value: string): string {
  if (!value) return "새 비밀번호를 입력해주세요.";
  return passwordRuleMessage(value);
}

/** 기수입니다. 1981년이 1기이고 매년 하나씩 증가하지만, 연도로 변환하지 않고 숫자만 수신합니다. 명단에 기재된 기수를 그대로 입력받기 위함입니다. 서버도 같은 범위를 검증합니다. */
export function cohortMessage(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "기수를 입력해 주세요.";
  const cohort = Number(trimmed);
  if (!Number.isInteger(cohort) || cohort < 1 || cohort > 100) {
    return "기수는 1에서 100 사이의 숫자여야 해요.";
  }
  return "";
}

/** name을 taken 목록과 비교해, 비었거나 겹치면 그 사유를 반환합니다. what은 "합주실"·"팀"처럼 오류 문장에 들어갈 제품 용어입니다. 앞뒤 공백을 제거한 후 비교하므로 공백만 다른 이름도 중복으로 판정합니다. */
export function uniqueNameMessage(name: string, taken: string[], what: string): string {
  const trimmed = name.trim();
  if (!trimmed) return `${what} 이름을 입력해 주세요.`;
  const clash = taken.some((other) => other.trim() === trimmed);
  return clash ? `같은 이름의 ${what}이 이미 있습니다.` : "";
}

/** 학번입니다. 숫자 8자리만 수신합니다. 서버의 같은 규칙은 input.py의 require_student_no()입니다. */
export function studentNoMessage(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "학번을 입력해 주세요.";
  return /^\d{8}$/.test(trimmed) ? "" : "학번은 숫자 8자리여야 해요.";
}
