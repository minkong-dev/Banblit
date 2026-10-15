// 검색어 입력칸과 결과 버튼 목록입니다. 서버를 호출하지 않고, 받은 items 만 표시합니다.
// 멤버 검색(MemberSearch)과 팀 검색(TeamSearch)이 같은 markup 을 씁니다.

import type { ReactNode } from "react";

import { SearchInput } from "./controls";

export function SearchList(props: {
  text: string;
  onText: (text: string) => void;
  placeholder: string;
  items: { id: number; label: string }[];
  /** items 가 비었을 때 목록 대신 표시합니다. */
  empty: ReactNode;
  onPick: (id: number) => void;
}) {
  const { text, onText, placeholder, items, empty, onPick } = props;
  return (
    <div className="seek">
      {/* 목록이 길어 본문이 스크롤해도 입력 칸은 제자리에 남습니다(shell.css 의 .seekbar). */}
      <div className="seekbar">
        <SearchInput
          // eslint-disable-next-line jsx-a11y/no-autofocus -- 검색 컴포넌트가 열릴 때 검색어 입력칸으로 초점을 이동합니다. 페이지 최초 로드가 아닙니다.
          autoFocus
          label="검색어"
          value={text}
          placeholder={placeholder}
          onChange={onText}
        />
      </div>
      {items.length === 0 ? empty : (
        <ul className="found">
          {items.map((item) => (
            <li key={item.id}>
              <button onClick={() => onPick(item.id)}>{item.label}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
