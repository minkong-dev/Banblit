import { describe, expect, it } from "vitest";

import { emailMessage, passwordMessage, phoneMessage, strongPasswordMessage } from "./validate";

describe("emailMessage", () => {
  it("성한 값이면 아무 말도 하지 않는다", () => {
    expect(emailMessage("name@example.com")).toBe("");
  });

  it("비었으면 넣어 달라고 한다", () => {
    expect(emailMessage("")).toBe("이메일을 입력해 주세요.");
  });

  it.each(["name", "name@", "@example.com", "name@example", "na me@example.com"])(
    "모양이 아니면 확인해 달라고 한다 — %s",
    (bad) => {
      expect(emailMessage(bad)).toBe("이메일 형식이 맞는지 확인해주세요.");
    },
  );
});

describe("passwordMessage", () => {
  it("여덟 자면 통과한다", () => {
    expect(passwordMessage("12345678")).toBe("");
  });

  it("비었으면 넣어 달라고 한다", () => {
    expect(passwordMessage("")).toBe("비밀번호를 입력해 주세요.");
  });

  it("여덟 자보다 짧으면 막는다", () => {
    expect(passwordMessage("1234567")).toBe("비밀번호는 8자 이상으로 작성해주세요.");
  });
});

describe("strongPasswordMessage — 재설정은 가입보다 규칙이 빡빡하다", () => {
  it("네 가지를 모두 갖추면 통과한다", () => {
    expect(strongPasswordMessage("Abcdef1!")).toBe("");
  });

  it.each([
    ["", "새 비밀번호를 입력해주세요."],
    ["Ab1!", "8자에서 20자 사이로 입력해주세요."],
    ["Abcdefghij1!Abcdefghij", "8자에서 20자 사이로 입력해주세요."],
    ["ABCDEF1!", "소문자를 하나 이상 넣어주세요."],
    ["abcdef1!", "대문자를 하나 이상 넣어주세요."],
    ["Abcdefg!", "숫자를 하나 이상 넣어주세요."],
    ["Abcdefg1", "특수기호를 하나 이상 넣어주세요."],
  ])("%s 는 막는다", (given, expected) => {
    expect(strongPasswordMessage(given)).toBe(expected);
  });
});

describe("phoneMessage", () => {
  it("열 자리와 열한 자리를 받는다", () => {
    expect(phoneMessage("01012345678")).toBe("");
    expect(phoneMessage("0212345678")).toBe("");
  });

  it("붙임표가 섞여 있어도 숫자만 세어 받는다", () => {
    expect(phoneMessage("010-1234-5678")).toBe("");
  });

  it("비었으면 넣어 달라고 한다", () => {
    expect(phoneMessage("")).toBe("전화번호를 입력해주세요.");
    expect(phoneMessage("----")).toBe("전화번호를 입력해주세요.");
  });

  it("자릿수가 맞지 않으면 막는다", () => {
    expect(phoneMessage("012345678")).toBe("전화번호가 맞는지 확인해주세요.");
    expect(phoneMessage("010123456789")).toBe("전화번호가 맞는지 확인해주세요.");
  });
});
