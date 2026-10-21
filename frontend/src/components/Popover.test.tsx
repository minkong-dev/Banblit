// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { Popover } from "./Popover";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Popover", () => {
  it("popover=auto 와 role, aria-label 을 붙이고 toggle 의 newState 를 boolean 으로 전달한다", () => {
    const onOpenChange = vi.fn();
    const root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root.render(
      <MemoryRouter>
        <Popover id="pop1" label="알림" className="notepop" onOpenChange={onOpenChange}>내용</Popover>
      </MemoryRouter>,
    ));
    const el = document.getElementById("pop1");
    expect(el?.getAttribute("popover")).toBe("auto");
    expect(el?.getAttribute("role")).toBe("dialog");
    expect(el?.getAttribute("aria-label")).toBe("알림");
    expect(el?.className).toBe("notepop");

    act(() => { el?.dispatchEvent(Object.assign(new Event("toggle"), { newState: "open" })); });
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    act(() => { el?.dispatchEvent(Object.assign(new Event("toggle"), { newState: "closed" })); });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    act(() => root.unmount());
  });
});
