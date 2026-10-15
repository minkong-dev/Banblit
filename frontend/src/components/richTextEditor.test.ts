// attach 는 파일을 글에 올린 뒤 받은 주소로 본문에 노드를 넣습니다. 서버 호출(uploadAttachment)과 toast(say)는
// 가짜로 바꾸고, 편집기는 chain 호출만 기록하는 객체로 대신합니다.

import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.fn<(postId: number, file: File) => Promise<number>>();
const toast = vi.fn<(message: string) => void>();
vi.mock("../lib/pipeline", () => ({
  uploadAttachment: (postId: number, file: File) => upload(postId, file),
  attachmentInlineUrl: (id: number) => `/api/attachments/${id}/inline`,
}));
vi.mock("./toast", () => ({ say: (message: string) => toast(message) }));

import { attach } from "./richTextEditor";
import type { Editor } from "./richTextEditor";

/** chain().focus().setImage(...).run() 처럼 이어 부른 명령 이름과 인자를 calls 에 남기는 가짜 편집기입니다. */
function fakeEditor(): { editor: Editor; calls: [string, unknown][] } {
  const calls: [string, unknown][] = [];
  const chain = new Proxy({}, {
    get: (_target, name: string) => (arg: unknown) => {
      calls.push([name, arg]);
      return chain;
    },
  });
  return { editor: { chain: () => chain } as unknown as Editor, calls };
}

const pdf = new File(["%PDF"], "악보.pdf", { type: "application/pdf" });

beforeEach(() => {
  upload.mockReset();
  toast.mockReset();
});

describe("attach — 파일을 올리고 본문에 넣기", () => {
  it("글 번호가 없으면 올리지 않고 사유만 알린다", async () => {
    const { editor, calls } = fakeEditor();
    await attach(editor, [pdf], null, null);
    expect(upload).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    expect(toast).toHaveBeenCalledWith("글을 준비하는 중이에요. 잠시 후 다시 넣어주세요.");
  });

  it("PDF 를 올리면 받은 주소로 PDF 노드를 넣는다", async () => {
    upload.mockResolvedValue(7);
    const { editor, calls } = fakeEditor();
    await attach(editor, [pdf], null, 3);
    expect(upload).toHaveBeenCalledWith(3, pdf);
    expect(calls).toContainEqual(["setPdf", { src: "/api/attachments/7/inline", title: "악보.pdf" }]);
  });

  it("올리지 못하면 본문을 건드리지 않고 사유를 알린다", async () => {
    upload.mockRejectedValue(new Error("용량 초과"));
    const { editor, calls } = fakeEditor();
    await attach(editor, [pdf], null, 3);
    expect(calls).toEqual([]);
    expect(toast.mock.calls[0]?.[0]).toContain("악보.pdf 을 올리지 못했어요");
  });
});
