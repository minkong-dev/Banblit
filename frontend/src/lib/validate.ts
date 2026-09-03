// 계정 화면의 입력 검사. 값이 성하면 빈 문자열을, 아니면 사람이 읽을 사유를 돌려준다.
// 사유가 곧 화면에 뜨는 빨간 글씨다.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN = 8;
const STRONG_MIN = 8;
const STRONG_MAX = 20;
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 11;

export function emailMessage(value: string): string {
  // 골뱅이 앞뒤에 공백 없는 글자가 있고, 점 뒤가 두 글자 이상이어야 한다.
  if (!value) return "이메일을 입력해 주세요.";
  return EMAIL.test(value) ? "" : "이메일 형식이 맞는지 확인해주세요.";
}

export function passwordMessage(value: string): string {
  if (!value) return "비밀번호를 입력해 주세요.";
  return value.length < PASSWORD_MIN ? "비밀번호는 8자 이상으로 작성해주세요." : "";
}

export function strongPasswordMessage(value: string): string {
  // 재설정은 가입보다 규칙이 빡빡하다 — 길이, 소문자, 대문자, 숫자, 특수기호를 다 본다.
  if (!value) return "새 비밀번호를 입력해주세요.";
  if (value.length < STRONG_MIN || value.length > STRONG_MAX) {
    return "8자에서 20자 사이로 입력해주세요.";
  }
  if (!/[a-z]/.test(value)) return "소문자를 하나 이상 넣어주세요.";
  if (!/[A-Z]/.test(value)) return "대문자를 하나 이상 넣어주세요.";
  if (!/[0-9]/.test(value)) return "숫자를 하나 이상 넣어주세요.";
  if (!/[^A-Za-z0-9]/.test(value)) return "특수기호를 하나 이상 넣어주세요.";
  return "";
}

export function phoneMessage(value: string): string {
  // 사람은 붙임표를 넣어 적으므로 숫자만 세어 자릿수를 본다.
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return "전화번호를 입력해주세요.";
  if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) {
    return "전화번호가 맞는지 확인해주세요.";
  }
  return "";
}
