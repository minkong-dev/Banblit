import { pageWindow } from "../lib/paging";

/** 쪽 넘기기 한 줄 — 이전, 번호들, 다음. 팀 목록과 게시판이 같은 줄을 쓴다. */
export function Pager(props: { page: number; pages: number; onPage: (page: number) => void }) {
  const { page, pages, onPage } = props;
  return (
    <nav className="pager" aria-label="쪽 넘기기">
      <button aria-label="이전 쪽" disabled={page === 1} onClick={() => onPage(page - 1)}>‹</button>
      {pageWindow(page, pages).map((number) => (
        <button
          key={number}
          aria-label={`${number}쪽`}
          aria-current={number === page ? "page" : undefined}
          onClick={() => onPage(number)}
        >
          {number}
        </button>
      ))}
      <button aria-label="다음 쪽" disabled={page === pages} onClick={() => onPage(page + 1)}>›</button>
    </nav>
  );
}
