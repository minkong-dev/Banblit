import { describe, expect, it } from "vitest";

import {
  attachmentMessage,
  boardActions,
  bodyMessage,
  commentMessage,
  fileSizeLabel,
  titleMessage,
} from "./boards";

describe("titleMessage", () => {
  it("비어 있으면 채워 달라고 한다", () => {
    expect(titleMessage("   ")).toBe("제목을 입력해주세요.");
  });

  it("200자까지는 통과한다", () => {
    expect(titleMessage("가".repeat(200))).toBe("");
  });

  it("200자를 넘으면 사유를 돌려준다", () => {
    expect(titleMessage("가".repeat(201))).toBe("제목은 200자 이내로 작성해주세요.");
  });
});

describe("bodyMessage", () => {
  it("비어 있으면 채워 달라고 한다", () => {
    expect(bodyMessage("")).toBe("내용을 입력해주세요.");
  });

  it("20000자를 넘으면 사유를 돌려준다", () => {
    expect(bodyMessage("가".repeat(20001))).toBe("내용은 20000자 이내로 작성해주세요.");
  });

  it("20000자까지는 통과한다", () => {
    expect(bodyMessage("가".repeat(20000))).toBe("");
  });
});

describe("commentMessage", () => {
  it("비어 있으면 채워 달라고 한다", () => {
    expect(commentMessage("  ")).toBe("댓글을 입력해주세요.");
  });

  it("2000자를 넘으면 사유를 돌려준다", () => {
    expect(commentMessage("가".repeat(2001))).toBe("댓글은 2000자 이내로 작성해주세요.");
  });

  it("2000자까지는 통과한다", () => {
    expect(commentMessage("가".repeat(2000))).toBe("");
  });
});

describe("fileSizeLabel", () => {
  it("천 바이트가 안 되면 그대로 바이트로 적는다", () => {
    expect(fileSizeLabel(0)).toBe("0B");
    expect(fileSizeLabel(999)).toBe("999B");
  });

  it("단위가 올라가면 소수 한 자리까지만 남긴다", () => {
    expect(fileSizeLabel(1024)).toBe("1KB");
    expect(fileSizeLabel(123456)).toBe("120.6KB");
  });

  it("상한인 300MB는 딱 300MB로 읽힌다", () => {
    expect(fileSizeLabel(300 * 1024 * 1024)).toBe("300MB");
  });

  it("기가바이트까지 올라간다", () => {
    expect(fileSizeLabel(3 * 1024 * 1024 * 1024)).toBe("3GB");
  });
});

describe("attachmentMessage", () => {
  it("허용된 확장자에 크기가 넘지 않으면 통과한다", () => {
    expect(attachmentMessage("악보.pdf", 123456)).toBe("");
    expect(attachmentMessage("연습.MP4", 1024)).toBe("");
  });

  it("상한과 같은 크기까지는 통과한다", () => {
    expect(attachmentMessage("악보.pdf", 300 * 1024 * 1024)).toBe("");
  });

  it("상한을 넘으면 상한과 이 파일의 크기를 함께 알린다", () => {
    expect(attachmentMessage("공연.mp4", 400 * 1024 * 1024)).toBe(
      "파일 당 업로드 가능한 크기는 300MB 이하만 가능해요. 해당 파일은 400MB 에요.",
    );
  });

  it("허용하지 않는 확장자면 무엇이 되는지 알린다", () => {
    expect(attachmentMessage("설치.exe", 1024)).toBe(
      "지원하지 않는 파일 형식이에요. 파일명을 확인해주세요.",
    );
  });

  it("확장자가 없으면 거른다", () => {
    expect(attachmentMessage("악보", 1024)).not.toBe("");
  });

  it("점으로 시작하는 이름을 확장자로 읽지 않는다", () => {
    expect(attachmentMessage(".zip", 1024)).not.toBe("");
  });
});

describe("boardActions — 글·댓글 하나에 무엇을 할 수 있는가", () => {
  it("쓴 사람 본인은 수정도 삭제도 한다", () => {
    expect(boardActions(7, 7, false)).toEqual({ canEdit: true, canDelete: true });
  });

  it("남의 것은 권한이 없으면 아무것도 못 한다", () => {
    expect(boardActions(7, 8, false)).toEqual({ canEdit: false, canDelete: false });
  });

  it("타 멤버 글 삭제 및 블라인드 권한자는 남의 것을 삭제할 수 있지만 수정하지는 않는다", () => {
    expect(boardActions(7, 8, true)).toEqual({ canEdit: false, canDelete: true });
  });

  it("아직 누구인지 모르면 권한이 있어도 아무것도 못 한다", () => {
    expect(boardActions(7, null, true)).toEqual({ canEdit: false, canDelete: false });
  });
});
