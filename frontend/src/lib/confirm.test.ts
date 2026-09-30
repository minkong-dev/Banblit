import { afterEach, describe, expect, test, vi } from "vitest";

import { askBlind, askCancel, askDeletePost, askDeleteRoom, askRollback, objectParticle } from "./confirm";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("objectParticle", () => {
  test("받침이 있으면 을", () => {
    expect(objectParticle("공지사항")).toBe("을");
  });

  test("받침이 없으면 를", () => {
    expect(objectParticle("새벽 네시")).toBe("를");
  });

  test("끝소리가 트처럼 받침 없는 글자면 를", () => {
    expect(objectParticle("오프비트")).toBe("를");
  });

  test("한글이 아니면 를", () => {
    expect(objectParticle("E2E")).toBe("를");
  });
});

describe("askCancel — 예약에는 취소라고 묻는다", () => {
  test("이름 뒤에 조사를 붙여 취소를 묻는다", () => {
    const asked: string[] = [];
    vi.stubGlobal("window", { confirm: (text: string) => { asked.push(text); return true; } });

    expect(askCancel("여섯줄 18:00–21:00 예약")).toBe(true);
    expect(asked[0]).toBe("여섯줄 18:00–21:00 예약을 취소할까요?");
  });

  test("아니오를 누르면 false 다", () => {
    vi.stubGlobal("window", { confirm: () => false });
    expect(askCancel("예약")).toBe(false);
  });
});

describe("askBlind — 글 블라인드는 되돌릴 수 있는 곳을 적는다", () => {
  test("설정의 블라인드 탭에서 되돌릴 수 있다는 문장을 묻는다", () => {
    const asked: string[] = [];
    vi.stubGlobal("window", { confirm: (text: string) => { asked.push(text); return true; } });

    expect(askBlind()).toBe(true);
    expect(asked[0]).toBe(
      "해당 글을 가릴까요? 작성자 본인도 볼 수 없게 되고, 설정의 블라인드 탭에서 되돌릴 수 있어요.",
    );
  });

  test("아니오를 누르면 false 다", () => {
    vi.stubGlobal("window", { confirm: () => false });
    expect(askBlind()).toBe(false);
  });
});

describe("askDeletePost — 글 삭제는 첨부파일도 함께 삭제됨을 적는다", () => {
  test("글과 첨부파일이 함께 삭제되는 것을 묻는다", () => {
    const asked: string[] = [];
    vi.stubGlobal("window", { confirm: (text: string) => { asked.push(text); return true; } });

    expect(askDeletePost()).toBe(true);
    expect(asked[0]).toBe("해당 글과 첨부된 파일을 모두 삭제할까요?");
  });

  test("아니오를 누르면 false 다", () => {
    vi.stubGlobal("window", { confirm: () => false });
    expect(askDeletePost()).toBe(false);
  });
});

describe("askRollback — 배정 되돌리기는 복구가 어려움을 적는다", () => {
  test("복구가 어렵다는 문장을 함께 묻는다", () => {
    const asked: string[] = [];
    vi.stubGlobal("window", { confirm: (text: string) => { asked.push(text); return true; } });

    expect(askRollback()).toBe(true);
    expect(asked[0]).toBe(
      "현재 확정된 시간표를 해당 배정안으로 되돌려요. 해당 작업은 진행 후 다시 복구하기 어려워요. 그래도 되돌릴까요?",
    );
  });

  test("아니오를 누르면 false 다", () => {
    vi.stubGlobal("window", { confirm: () => false });
    expect(askRollback()).toBe(false);
  });
});

describe("askDeleteRoom — 합주실 삭제는 함께 사라지는 것을 적는다", () => {
  test("예약과 배정이 함께 삭제되는 것을 문장에 적는다", () => {
    const asked: string[] = [];
    vi.stubGlobal("window", { confirm: (text: string) => { asked.push(text); return true; } });

    expect(askDeleteRoom()).toBe(true);
    expect(asked[0]).toBe(
      "기록이 있을경우 예약과 배정안, 이전 배정기록이 모두 삭제돼요. 정말 삭제할까요?",
    );
  });

  test("아니오를 누르면 false 다", () => {
    vi.stubGlobal("window", { confirm: () => false });
    expect(askDeleteRoom()).toBe(false);
  });
});
