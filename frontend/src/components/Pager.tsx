import { pageWindow } from "../lib/paging";

/** pagination(페이지네이션): 이전 버튼, 페이지 번호들, 다음 버튼를 한 줄에 표시합니다.
 *  팀 목록과 게시판이 같은 컴포넌트를 사용합니다. */
export function Pager(props: { page: number; pages: number; onPage: (page: number) => void }) {
  const { page, pages, onPage } = props;
  return (
    <nav className="pager" aria-label="페이지네이션">
      <button aria-label="이전 목록" disabled={page === 1} onClick={() => onPage(page - 1)}>‹</button>
      {pageWindow(page, pages).map((number) => (
        <button
          key={number}
          aria-label={`${number}페이지`}
          aria-current={number === page ? "page" : undefined}
          onClick={() => onPage(number)}
        >
          {number}
        </button>
      ))}
      <button aria-label="다음 목록" disabled={page === pages} onClick={() => onPage(page + 1)}>›</button>
    </nav>
  );
}
