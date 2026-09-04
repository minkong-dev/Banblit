import { describe, expect, it } from "vitest";

import { bodyMessage, commentMessage, postWhen, titleMessage } from "./boards";

describe("titleMessage", () => {
  it("비어 있으면 채워 달라고 한다", () => {
    expect(titleMessage("   ")).toBe("제목을 입력해 주세요.");
  });

  it("200자까지는 통과한다", () => {
    expect(titleMessage("가".repeat(200))).toBe("");
  });

  it("200자를 넘으면 사유를 돌려준다", () => {
    expect(titleMessage("가".repeat(201))).toBe("제목은 200자를 넘을 수 없습니다.");
  });
});

describe("bodyMessage", () => {
  it("비어 있으면 채워 달라고 한다", () => {
    expect(bodyMessage("")).toBe("내용을 입력해 주세요.");
  });

  it("20000자를 넘으면 사유를 돌려준다", () => {
    expect(bodyMessage("가".repeat(20001))).toBe("내용은 20000자를 넘을 수 없습니다.");
  });

  it("20000자까지는 통과한다", () => {
    expect(bodyMessage("가".repeat(20000))).toBe("");
  });
});

describe("commentMessage", () => {
  it("비어 있으면 채워 달라고 한다", () => {
    expect(commentMessage("  ")).toBe("댓글을 입력해 주세요.");
  });

  it("2000자를 넘으면 사유를 돌려준다", () => {
    expect(commentMessage("가".repeat(2001))).toBe("댓글은 2000자를 넘을 수 없습니다.");
  });

  it("2000자까지는 통과한다", () => {
    expect(commentMessage("가".repeat(2000))).toBe("");
  });
});

describe("postWhen", () => {
  it("시간대 없는 시각 글자를 날짜와 시각으로 자른다", () => {
    expect(postWhen("2026-09-04T14:30:00")).toBe("9월 4일 14:30");
  });

  it("한 자리 월·일도 앞의 0을 뗀다", () => {
    expect(postWhen("2026-01-05T09:05:00")).toBe("1월 5일 09:05");
  });
});
