// "멤버 검색" Modal 하나입니다. routes/Teams.tsx 의 Lineup·SeatRows, routes/SettingsMembers.tsx 의
// GrantModal(add 모드) 3곳이 Modal 안에 MemberSearch 를 두는 같은 모양을 각자 다시 작성하던 것을 공용으로 둡니다.

import { Modal } from "./Modal";
import { MemberSearch } from "./MemberSearch";
import type { Member } from "../lib/contract";

export function MemberPicker(props: {
  /** GrantModal 은 권한 이름을 제목으로 씁니다 — 화면 문구를 바꾸지 않으므로 고정값이 아니라 prop 으로 받습니다. */
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
