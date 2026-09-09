// 계정 화면의 입력 검사. 값이 성하면 빈 문자열을, 아니면 사람이 읽을 사유를 돌려준다.
// 사유가 곧 화면에 뜨는 빨간 글씨다.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN = 8;
const STRONG_MIN = 8;
const STRONG_MAX = 20;

export function emailMessage(value: string): string {
  // 골뱅이 앞뒤에 공백 없는 글자가 있고, 점 뒤가 두 글자 이상이어야 한다.
  if (!value) return "이메일을 입력해 주세요.";
  return EMAIL.test(value) ? "" : "이메일 형식이 맞는지 확인해주세요.";
}

/** 로그인 칸. 규칙을 보지 않는다 — 여기서 조이면 규칙을 바꾸기 전에 만든 계정이
 *  로그인 자체를 못 하게 된다. 맞는지는 서버가 판단한다. */
export function passwordMessage(value: string): string {
  if (!value) return "비밀번호를 입력해 주세요.";
  return value.length < PASSWORD_MIN ? "비밀번호는 8자 이상으로 작성해주세요." : "";
}

/** 새로 정하는 비밀번호가 지켜야 할 것. 가입과 재설정이 이 하나를 함께 쓴다 —
 *  화면마다 따로 두면 한쪽만 느슨해진다. 서버의 같은 규칙은 input.py 의 require_password 다.
 *  빈 값은 부르는 쪽이 먼저 거른다. 화면마다 부르는 말이 달라서다. */
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

/** 가입에서 처음 정하는 비밀번호. */
export function signupPasswordMessage(value: string): string {
  if (!value) return "비밀번호를 입력해 주세요.";
  return passwordRuleMessage(value);
}

/** 재설정에서 다시 정하는 비밀번호. */
export function strongPasswordMessage(value: string): string {
  if (!value) return "새 비밀번호를 입력해주세요.";
  return passwordRuleMessage(value);
}

/** 기수. 1981년이 1기이고 해마다 하나씩 오르지만, 연도로 환산하지 않고 숫자만 받는다 —
 *  명단에 적힌 기수를 그대로 넣기 위해서다. 서버도 같은 범위를 다시 거른다. */
export function cohortMessage(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "기수를 입력해 주세요.";
  const cohort = Number(trimmed);
  if (!Number.isInteger(cohort) || cohort < 1 || cohort > 200) {
    return "기수는 1에서 200 사이의 숫자여야 해요.";
  }
  return "";
}

/** name 을 taken 과 견줘, 비었거나 겹치면 그 사유를 돌려준다. what 은 "합주실"·"팀"처럼
 *  문장에 들어갈 이름이다. 앞뒤 공백을 뗀 뒤 견주므로 공백만 다른 이름도 겹친 것으로 본다. */
export function uniqueNameMessage(name: string, taken: string[], what: string): string {
  const trimmed = name.trim();
  if (!trimmed) return `${what} 이름을 입력해 주세요.`;
  const clash = taken.some((other) => other.trim() === trimmed);
  return clash ? `같은 이름의 ${what}이 이미 있습니다.` : "";
}
