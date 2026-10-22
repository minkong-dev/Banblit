// 하루 창 3개는 탭마다 다른 화면입니다. DayView 는 보기만 하고, BookDialog 는 예약 form 을 그립니다.
// react-dom/server 로 렌더링해 버튼과 안내 문구로 구분합니다. 서버 조회는 하지 않습니다(effect 가 실행되지 않습니다).

import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

import type { DayProps } from "./DayDialog";
import { BookDialog, DayView, OffDialog } from "./DayDialog";

const day: DayProps = {
  dayKey: "2026-10-20",
  teams: [],
  entries: [],
  openHour: 18,
  closeHour: 24,
  slotCount: 6,
  inFocus: false,
  ensemble: null,
  canEditEnsemble: false,
  rooms: [],
  onClose: () => {},
};

const render = (ui: ReactElement): string =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>,
  );

describe("하루 창 — 탭마다 다른 화면", () => {
  it("전체 일정 창은 등록 버튼 없이 그날 예약이 없다고 표시한다", () => {
    const html = render(<DayView {...day} />);
    expect(html).toContain("현재 예약이 존재하지 않아요");
    expect(html).not.toContain("예약하기");
    expect(html).not.toContain("등록하기");
  });

  it("내 일정 창은 불가능 일정 등록 form 을 그린다", () => {
    const html = render(<OffDialog {...day} myOff={[]} onSaved={() => {}} />);
    expect(html).toContain("등록하기");
    expect(html).toContain("등록한 불가능 일정이 존재하지 않아요.");
  });

  it("예약 창은 위쪽 시간 선택으로 열면 그 시간으로 예약한다고 표시한다", () => {
    const html = render(<BookDialog {...day} myBookings={[]} fixed={{ from: 1, to: 3 }} myName="김민수" onSaved={() => {}} />);
    expect(html).toContain("예약하기");
    expect(html).toContain("해당 시간으로 예약할게요");
  });
});
