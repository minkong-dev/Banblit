// @vitest-environment jsdom
// 자식 컴포넌트의 useEffect 가 실행될 때 dialog 가 이미 열려 있어야 자식이 크기와 위치를 측정할 수 있습니다.

import { act, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { Modal } from "./Modal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom 에 없는 showModal, close 를 open 속성 추가, 삭제로 대신합니다.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); };

function Probe({ seen }: { seen: boolean[] }) {
  const own = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    seen.push(own.current?.closest("dialog")?.open ?? false);
  }, [seen]);
  return <span ref={own} />;
}

describe("Modal", () => {
  it("자식의 useEffect 보다 먼저 dialog 를 연다", () => {
    const seen: boolean[] = [];
    const root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root.render(<Modal title="제목" onClose={() => {}}><Probe seen={seen} /></Modal>));
    expect(seen).toEqual([true]);
    act(() => root.unmount());
  });
});
