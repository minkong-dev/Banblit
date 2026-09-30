// MemberPicker 도 렌더링 없이 반환된 element 트리를 조사합니다. Teams.tsx 의 Lineup·SeatRows,
// SettingsMembers.tsx 의 GrantModal(add 모드)이 각자 다시 작성하던 "Modal 안의 MemberSearch" 를 공용으로 둡니다.

import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { MemberPicker } from "./MemberPicker";
import { Modal } from "./Modal";
import { MemberSearch } from "./MemberSearch";

type ModalEl = ReactElement<{ title: string; hint: string; onClose: () => void; children: ReactElement }>;
type SearchEl = ReactElement<{ exclude?: number[]; onPick: (member: { id: number }) => void }>;

describe("MemberPicker — Modal 안에 MemberSearch 를 두는 자리", () => {
  it("title·hint·onClose 를 Modal 에 그대로 전달한다", () => {
    const onClose = vi.fn();
    const el = MemberPicker({ title: "멤버 검색", hint: "드럼", onPick: () => {}, onClose }) as ModalEl;

    expect(el.type).toBe(Modal);
    expect(el.props.title).toBe("멤버 검색");
    expect(el.props.hint).toBe("드럼");
    expect(el.props.onClose).toBe(onClose);
  });

  it("GrantModal 처럼 title 이 권한 이름이어도 그대로 전달한다 — 화면 문구를 바꾸지 않는다", () => {
    const el = MemberPicker({
      title: "합주실 관리", hint: "권한을 부여할 멤버를 검색해요", onPick: () => {}, onClose: () => {},
    }) as ModalEl;

    expect(el.props.title).toBe("합주실 관리");
  });

  it("exclude·onPick 을 MemberSearch 에 그대로 전달한다", () => {
    const onPick = vi.fn();
    const el = MemberPicker({ title: "멤버 검색", hint: "드럼", exclude: [1, 2], onPick, onClose: () => {} }) as ModalEl;
    const search = el.props.children as SearchEl;

    expect(search.type).toBe(MemberSearch);
    expect(search.props.exclude).toEqual([1, 2]);
    expect(search.props.onPick).toBe(onPick);
  });

  it("exclude 를 생략하면 MemberSearch 에도 넘기지 않는다 — Lineup 은 exclude 없이 쓴다", () => {
    const el = MemberPicker({ title: "멤버 검색", hint: "드럼", onPick: () => {}, onClose: () => {} }) as ModalEl;
    const search = el.props.children as SearchEl;

    expect(search.props.exclude).toBeUndefined();
  });
});
