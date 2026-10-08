// 공용 화면 요소(controls.tsx)를 렌더링 없이 검사합니다. Modal.test.tsx 와 같이 JSX 가 반환하는
// React element 의 props 를 직접 조사합니다. 요소마다 깨지면 잡히는 검사 1개씩입니다.

import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import {
  BackButton, Button, CloseButton, DateRange, DeleteButton, EditButton, Empty, FormFoot,
  IconButton, MenuItem, NavButton, SearchInput, TimeRange, Toggle, Why, FilePicker,
} from "./controls";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PencilIcon, TrashIcon } from "./icons";

type Props = Record<string, unknown> & { children?: unknown; className?: string };
type El = ReactElement<Props>;

function kids(el: El): El[] {
  const list = el.props.children;
  return Array.isArray(list) ? (list as El[]) : [list as El];
}

describe("Button — 주 행동·보조·위험 버튼", () => {
  it("kind 가 class 로 바뀌고 pending 이면 비활성화되며 문구가 바뀐다", () => {
    const plain = Button({ kind: "go", children: "저장" }) as El;
    expect(plain.type).toBe("button");
    expect(plain.props.className).toBe("btn go");
    expect(plain.props.type).toBe("button");

    const busy = Button({ kind: "danger", pending: true, pendingLabel: "삭제하는 중…", children: "삭제" }) as El;
    expect(busy.props.className).toBe("btn warn");
    expect(busy.props.disabled).toBe(true);
    expect(busy.props.children).toBe("삭제하는 중…");
  });

  it("to 를 주면 Link 가 되고 같은 class 를 가진다", () => {
    const link = Button({ kind: "go", to: "/notices/new", children: "글쓰기" }) as El;
    expect(link.type).not.toBe("button");
    expect(link.props.to).toBe("/notices/new");
    expect(link.props.className).toBe("btn go");
  });
});

describe("IconButton 계열 — 아이콘 1개짜리 버튼", () => {
  it("label 이 aria-label 로, danger 가 class 로 들어간다", () => {
    const el = IconButton({ label: "메뉴 열기", icon: <CloseIcon />, danger: true, pressed: true }) as El;
    expect(el.props["aria-label"]).toBe("메뉴 열기");
    expect(el.props.className).toBe("ic danger");
    expect(el.props["aria-pressed"]).toBe(true);
    expect(el.props.type).toBe("button");
  });

  it("Edit·Delete·Close·Back·Nav 는 아이콘이 고정된 IconButton 이다", () => {
    const edit = EditButton({ label: "글 수정", onClick: () => {} }) as El;
    const del = DeleteButton({ label: "글 삭제", onClick: () => {} }) as El;
    const close = CloseButton({ onClick: () => {} }) as El;
    const back = BackButton({ onClick: () => {} }) as El;
    const prev = NavButton({ dir: "prev", label: "저번 주", onClick: () => {} }) as El;
    const next = NavButton({ dir: "next", label: "다음 주", onClick: () => {} }) as El;
    expect((edit.props.icon as El).type).toBe(PencilIcon);
    expect((del.props.icon as El).type).toBe(TrashIcon);
    expect(del.props.danger).toBe(true);
    expect((close.props.icon as El).type).toBe(CloseIcon);
    expect(close.props.label).toBe("닫기");
    expect((back.props.icon as El).type).toBe(ChevronLeftIcon);
    expect(back.props.label).toBe("뒤로 가기");
    expect((prev.props.icon as El).type).toBe(ChevronLeftIcon);
    expect((next.props.icon as El).type).toBe(ChevronRightIcon);
  });
});

describe("Toggle — 체크와 switch", () => {
  it("kind 에 따라 role 과 class 가 다르고 onChange 는 boolean 을 받는다", () => {
    const onChange = vi.fn();
    const check = Toggle({ kind: "check", id: "a", checked: false, onChange }) as El;
    const input = kids(check)[0];
    expect(check.props.className).toBe("chk");
    expect(input.props.type).toBe("checkbox");
    expect(input.props.role).toBeUndefined();
    (input.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    expect(onChange).toHaveBeenCalledWith(true);

    const sw = Toggle({ kind: "switch", id: "b", checked: true, onChange }) as El;
    expect(sw.props.className).toBe("sw");
    expect(sw.props.role).toBe("switch");
  });
});

describe("TimeRange·DateRange — 시작·종료 쌍", () => {
  it("TimeRange 는 Cell 2개를 그리고 각 input 이 자기 값만 바꾼다", () => {
    const onChange = vi.fn();
    const el = TimeRange({
      id: "ens", labels: ["시작 시간", "종료 시간"], value: ["10:00", "12:00"], step: 3600, onChange,
    }) as El;
    const [from, to] = kids(el);
    expect(from.props.htmlFor).toBe("ens-from");
    expect(to.props.htmlFor).toBe("ens-to");
    const toInput = kids(to)[0];
    expect(toInput.props.type).toBe("time");
    expect(toInput.props.step).toBe(3600);
    (toInput.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "13:00" } });
    expect(onChange).toHaveBeenCalledWith(["10:00", "13:00"]);
  });

  it("DateRange 는 종료일의 min 이 시작일이다", () => {
    const el = DateRange({
      id: "p", labels: ["시작일", "종료일"], value: ["2026-10-01", "2026-10-05"], min: "2026-09-01", onChange: () => {},
    }) as El;
    const [from, to] = kids(el);
    expect(kids(from)[0].props.min).toBe("2026-09-01");
    expect(kids(to)[0].props.min).toBe("2026-10-01");
    expect(kids(to)[0].props.type).toBe("date");
  });
});

describe("SearchInput·MenuItem·Why·Empty", () => {
  it("SearchInput 은 type=search 이고 onChange 가 문자열을 준다", () => {
    const onChange = vi.fn();
    const el = SearchInput({ label: "검색어", value: "", placeholder: "이름", onChange }) as El;
    expect(el.props.type).toBe("search");
    expect(el.props["aria-label"]).toBe("검색어");
    (el.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "김" } });
    expect(onChange).toHaveBeenCalledWith("김");
  });

  it("MenuItem 은 act class 의 button 이다", () => {
    const el = MenuItem({ onClick: () => {}, children: "로그아웃" }) as El;
    expect(el.props.className).toBe("act");
    expect(el.props.type).toBe("button");
  });

  it("Why 는 빈 문구면 null, 아니면 role=alert", () => {
    expect(Why({ text: "" })).toBeNull();
    const el = Why({ text: "이름을 입력해주세요", id: "why1" }) as El;
    expect(el.props.role).toBe("alert");
    expect(el.props.id).toBe("why1");
    expect(el.props.className).toBe("why");
  });

  it("Empty 는 state 가 있으면 stateText 로, 없으면 text 를 그대로, as 로 태그를 정한다", () => {
    const loading = Empty({ state: { kind: "loading" }, text: "없어요" }) as El;
    expect(loading.props.children).toBe("불러오는 중…");
    expect(loading.type).toBe("p");
    const li = Empty({ text: "없어요", as: "li" }) as El;
    expect(li.type).toBe("li");
    expect(li.props.children).toBe("없어요");
    expect(li.props.className).toBe("empty");
  });
});

describe("FormFoot — 취소·저장 줄", () => {
  it("onSubmit 이 없으면 저장이 type=submit, 있으면 onClick 이며 blocked·pending 이 비활성화한다", () => {
    const onCancel = vi.fn();
    const submitForm = FormFoot({ submitLabel: "저장", pending: false, onCancel, bad: "값이 틀려요", whyId: "w" }) as El;
    const [acts, why] = kids(submitForm);
    const [, cancel, save] = kids(acts);
    expect(cancel.props.children).toBe("취소");
    expect(save.props.type).toBe("submit");
    expect(why.props.text).toBe("값이 틀려요");

    const onSubmit = vi.fn();
    const modal = FormFoot({ submitLabel: "저장", pending: true, blocked: true, onCancel, onSubmit }) as El;
    const save2 = kids(kids(modal)[0])[2];
    expect(save2.props.onClick).toBe(onSubmit);
    expect(save2.props.disabled).toBe(true);
    expect(save2.props.pending).toBe(true);
  });
});

describe("FilePicker — 숨긴 input", () => {
  it("input 은 숨겨져 있고 change 가 파일을 넘기고 값을 비운다", () => {
    const onFiles = vi.fn();
    const picker = FilePicker({ accept: "image/*", multiple: true, onFiles }) as El;
    expect(picker.props.type).toBe("file");
    expect(picker.props.hidden).toBe(true);
    expect(picker.props.multiple).toBe(true);
    const file = new File(["x"], "a.png");
    const target = { files: [file], value: "a.png" };
    (picker.props.onChange as (event: { target: typeof target }) => void)({ target });
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(target.value).toBe("");
  });
});
