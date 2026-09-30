// ModalFormFoot 은 JSX 가 반환하는 React element(순수 객체)를 직접 조사합니다. 이 저장소는
// 화면을 실제로 그려보는 testing-library 를 쓰지 않으므로, 렌더링 없이 반환된 트리에서
// 버튼 문구·onClick·disabled 값을 확인합니다.

import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { ModalFormFoot } from "./Modal";

type ButtonEl = ReactElement<{ children?: unknown; onClick?: () => void; disabled?: boolean }>;

function children(el: ReactElement<{ children: unknown }>): ButtonEl[] {
  return el.props.children as ButtonEl[];
}

describe("ModalFormFoot — Modal.foot 의 취소·저장 버튼 줄", () => {
  it("취소 버튼을 누르면 onCancel 을 호출하고 저장 버튼은 submitLabel 을 표시한다", () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    const el = ModalFormFoot({ onCancel, onSubmit, pending: false, submitLabel: "저장" });
    const [, cancelBtn, submitBtn] = children(el as ReactElement<{ children: unknown }>);

    cancelBtn.props.onClick?.();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(cancelBtn.props.children).toBe("취소");
    expect(submitBtn.props.children).toBe("저장");
    expect(submitBtn.props.disabled).toBe(false);

    submitBtn.props.onClick?.();
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("pending 이면 저장 버튼 문구가 바뀌고 비활성화된다", () => {
    const el = ModalFormFoot({
      onCancel: () => {}, onSubmit: () => {}, pending: true, submitLabel: "저장",
    });
    const [, , submitBtn] = children(el as ReactElement<{ children: unknown }>);

    expect(submitBtn.props.children).toBe("저장하는 중…");
    expect(submitBtn.props.disabled).toBe(true);
  });

  it("extra 를 주면 맨 앞에 그대로 들어간다 — Teams.tsx 의 팀 삭제 버튼 자리", () => {
    const extra = <button className="ghost drop">팀 삭제</button>;
    const el = ModalFormFoot({
      onCancel: () => {}, onSubmit: () => {}, pending: false, submitLabel: "저장", extra,
    });
    const [first] = children(el as ReactElement<{ children: unknown }>);

    expect(first).toBe(extra);
  });
});
