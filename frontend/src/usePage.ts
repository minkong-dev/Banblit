import { useEffect } from "react";

/** 화면 CSS 는 body[data-page="..."] 안에 갇혀 있다. 그 표시를 걸고 떼는 자리. */
export function usePage(page: string): void {
  useEffect(() => {
    document.body.dataset.page = page;
    return () => {
      delete document.body.dataset.page;
    };
  }, [page]);
}
