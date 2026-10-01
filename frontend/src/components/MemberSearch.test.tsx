// MemberSearch 는 useQuery 를 쓰므로 QueryClientProvider 로 감싸고, 조회 결과는 cache 에 미리 넣어
// react-dom/server 로 렌더링합니다. 검색어가 비어 있을 때의 queryKey 는 ["member-search", ""] 입니다.

import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

import { LOADING_TEXT } from "../lib/loading";
import type { Member } from "../lib/contract";
import { MemberSearch } from "./MemberSearch";

function render(members: Member[] | null, exclude?: number[]): string {
  const client = new QueryClient();
  if (members !== null) client.setQueryData(["member-search", ""], { members });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemberSearch onPick={() => {}} exclude={exclude} />
    </QueryClientProvider>,
  );
}

const people: Member[] = [
  { id: 1, name: "김민수", cohort: 25 },
  { id: 2, name: "김민수", cohort: 26 },
];

describe("MemberSearch — 결과 목록", () => {
  it("조회 전에는 불러오는 중 문구를 표시한다", () => {
    expect(render(null)).toContain(LOADING_TEXT);
  });

  it("동명이인은 기수까지 붙여 각각 한 줄씩 표시한다", () => {
    const html = render(people);

    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain("25");
    expect(html).toContain("26");
  });

  it("exclude 에 든 멤버는 목록에서 뺀다", () => {
    const html = render(people, [1]);

    expect(html.match(/<li>/g)).toHaveLength(1);
    expect(html).not.toContain("25");
  });

  it("결과가 모두 제외되어 비면 목록 대신 빈 목록 문구를 표시한다", () => {
    const html = render(people, [1, 2]);

    expect(html).not.toContain("<ul");
    expect(html).toContain('<p class="empty">');
  });
});
