// 멤버 검색, 팀 검색과 멤버 검색 Modal 입니다. 팀 생성 화면, 권한 세트 편집 화면, 불가능 일정 화면이 사용합니다.
// SearchList 가 검색어 입력칸과 결과 버튼 목록을 표시하고, MemberSearch 와 TeamSearch 가 같은 markup 을 씁니다.
//
// MemberSearch 는 검색어가 비어 있으면 명단 전체를 이름 순으로 표시합니다. 목록은 modal 본문이 스크롤합니다.
// TeamSearch 는 useTeams 가 이미 받은 팀 목록에서 이름이 일치하는 팀만 남기고, 서버에 검색을 요청하지 않습니다.

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

import type { Member, Team } from "../lib/contract";
import { loadState } from "../lib/loading";
import { searchMembers } from "../lib/pipeline";
import { matchingTeams, memberLabel, noMembersMessage } from "../lib/roster";
import { Empty, SearchInput } from "./controls";
import { Modal } from "./Modal";
import { useTeams } from "./queries";

function SearchList(props: {
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

export function MemberSearch(props: {
  onPick: (member: Member) => void;
  /** 이미 선택한 멤버는 목록에서 제외합니다. 같은 멤버를 두 번 선택할 필요가 없습니다. */
  exclude?: number[];
}) {
  const { onPick, exclude } = props;
  const [text, setText] = useState("");
  const query = text.trim();

  const found = useQuery({
    queryKey: ["member-search", query],
    queryFn: async () => ({ members: await searchMembers(query) }),
    // 한 글자 입력할 때마다 조회가 새로 나갑니다. 이전 결과를 삭제하지 않고 두면 목록이
    // "불러오는 중…" 으로 사라졌다 돌아오지 않고, 다음 결과가 도착할 때 한 번에 바뀝니다.
    placeholderData: keepPreviousData,
  });
  const skip = new Set(exclude ?? []);
  const members = found.isSuccess ? found.data.members.filter((member) => !skip.has(member.id)) : [];

  return (
    <SearchList
      text={text}
      onText={setText}
      placeholder="이름을 입력해주세요"
      items={members.map((member) => ({ id: member.id, label: memberLabel(member.name, member.cohort) }))}
      empty={<Empty state={loadState(found)} text={noMembersMessage(query)} />}
      onPick={(id) => {
        const member = members.find((item) => item.id === id);
        if (member !== undefined) onPick(member);
      }}
    />
  );
}

export function TeamSearch({ onPick }: { onPick: (team: Team) => void }) {
  const [text, setText] = useState("");
  const teams = useTeams();
  const shown = matchingTeams(teams.data?.teams ?? [], text);

  return (
    <SearchList
      text={text}
      onText={setText}
      placeholder="팀 이름을 입력해주세요"
      items={shown.map((team) => ({ id: team.id, label: team.name }))}
      empty={<Empty state={loadState(teams)} text={text.trim() === "" ? "등록된 팀이 없어요." : "해당하는 팀을 찾지 못했어요."} />}
      onPick={(id) => {
        const team = shown.find((item) => item.id === id);
        if (team !== undefined) onPick(team);
      }}
    />
  );
}

export function MemberPicker(props: {
  /** GrantModal 은 권한 이름을 제목으로 씁니다 — 화면 문구를 변경하지 않으므로 고정값이 아니라 prop 으로 받습니다. */
  title: string;
  hint: string;
  exclude?: number[];
  onPick: (member: Member) => void;
  onClose: () => void;
}) {
  const { title, hint, exclude, onPick, onClose } = props;
  return (
    <Modal title={title} hint={hint} onClose={onClose}>
      <MemberSearch exclude={exclude} onPick={onPick} />
    </Modal>
  );
}
