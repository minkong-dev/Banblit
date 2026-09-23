import { describe, expect, it } from "vitest";

import {
  emailMessage,
  loginIdMessage,
  passwordMessage,
  signupPasswordMessage,
  strongPasswordMessage,
  studentNoMessage,
} from "./validate";

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

describe("영문·숫자·기호 밖의 글자", () => {
  it.each(["한글@example.com", "name@한글.com", "ａ@example.com"])(
    "이메일에서 거절한다 — %s",
    (bad) => {
      expect(emailMessage(bad)).toBe("이메일은 영문·숫자·기호만 사용할 수 있습니다.");
    },
  );

  it.each(["가나다라마바사아Abc1!", "Abcde1!가", "Ａbcdef1!", "Abcde1!\u0000"])(
    "새 비밀번호에서 거절한다 — %s",
    (bad) => {
      expect(signupPasswordMessage(bad)).toBe(
        "비밀번호는 영문·숫자·기호만 사용할 수 있습니다.",
      );
      expect(strongPasswordMessage(bad)).toBe(
        "비밀번호는 영문·숫자·기호만 사용할 수 있습니다.",
      );
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

describe("signupPasswordMessage — 가입도 재설정과 같은 규칙을 쓴다", () => {
  it("네 가지를 모두 갖추면 통과한다", () => {
    expect(signupPasswordMessage("Abcdef1!")).toBe("");
  });

  it.each([
    ["", "비밀번호를 입력해 주세요."],
    ["Ab1!", "8자에서 20자 사이로 입력해주세요."],
    ["ABCDEF1!", "소문자를 하나 이상 넣어주세요."],
    ["abcdef1!", "대문자를 하나 이상 넣어주세요."],
    ["Abcdefg!", "숫자를 하나 이상 넣어주세요."],
    ["Abcdefg1", "특수기호를 하나 이상 넣어주세요."],
  ])("%s 는 막는다", (given, expected) => {
    expect(signupPasswordMessage(given)).toBe(expected);
  });
});

describe("strongPasswordMessage — 재설정", () => {
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

describe("loginIdMessage", () => {
  it("영문 소문자·숫자·밑줄 4~20자면 통과한다", () => {
    expect(loginIdMessage("seoyeon1")).toBe("");
  });

  it("대문자가 섞여도 정규화해서 통과한다", () => {
    expect(loginIdMessage("Seoyeon1")).toBe("");
  });

  it("비었으면 넣어 달라고 한다", () => {
    expect(loginIdMessage("  ")).toBe("아이디를 입력해 주세요.");
  });

  it.each(["ab", "a".repeat(21), "seoyeon!", "seoyeon 1"])(
    "규칙에 맞지 않으면 막는다 — %s",
    (bad) => {
      expect(loginIdMessage(bad)).toBe(
        "아이디는 영문 소문자·숫자·밑줄(_) 4~20자로 입력해주세요",
      );
    },
  );
});

describe("studentNoMessage", () => {
  it("숫자 여덟 자리면 통과한다", () => {
    expect(studentNoMessage("20260001")).toBe("");
  });

  it("비었으면 넣어 달라고 한다", () => {
    expect(studentNoMessage("  ")).toBe("학번을 입력해 주세요.");
  });

  it.each(["2026001", "202600011", "2026000a", "2026-0001"])(
    "숫자 여덟 자리가 아니면 막는다 — %s",
    (bad) => {
      expect(studentNoMessage(bad)).toBe("학번은 숫자 8자리여야 해요.");
    },
  );
});
