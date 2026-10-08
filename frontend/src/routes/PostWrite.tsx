// 글을 쓰는 화면입니다. 공지사항과 팀 게시판이 같은 화면을 씁니다.
// 목록 아래에 form 을 이어붙이지 않고 자기 주소를 가진 화면으로 둡니다 —
// 목록과 작성은 하는 일이 다르고, 붙여 두면 작성 화면을 주소로 가리킬 수 없습니다.

import { useNavigate, useParams } from "react-router-dom";

import { Empty } from "../components/controls";
import { SectionHead } from "../components/Layout";
import { WriteForm } from "../components/PostWriteForm";
import { can } from "../lib/account";
import { boardListKey } from "../lib/pipeline";
import { useMe, useMyTeams } from "../components/queries";
import { stateText } from "../lib/loading";
import type { LoadState } from "../lib/loading";
import type { Account } from "../lib/contract";
import "../styles/board.css";

/** 공지사항 작성입니다. notice_write 권한이 있어야 form 이 보입니다. */
export function NoticeWrite() {
  const { me } = useMe();

  return (
    <WritePage
      title="공지 작성"
      hint="멤버 전체에게 공개돼요"
      draftPath="/notices/drafts"
      listPath="/notices"
      listKey="/notices"
      allowed={can(me, "notice_write")}
      denied="공지 작성 권한이 있는 멤버만 작성이 가능해요."
    />
  );
}

/** 팀 게시판 작성입니다. 주소의 teamId 가 내가 속한 팀이어야 form 이 보입니다. */
export function BoardWrite() {
  const mine = useMyTeams();
  const { teamId } = useParams();
  const team = mine.find((one) => String(one.id) === teamId);

  return (
    <WritePage
      title={team === undefined ? "글 작성" : `${team.name} 글 작성`}
      hint="해당 팀에 소속된 멤버만 볼 수 있어요"
      draftPath={`/teams/${teamId ?? ""}/posts/drafts`}
      listPath="/board"
      listKey={`/teams/${teamId ?? ""}/posts`}
      allowed={team !== undefined}
      denied="이 팀에 소속된 멤버만 쓸 수 있어요."
    />
  );
}

/** form 대신 표시할 사유입니다. 쓸 수 있을 경우 빈 문자열을 반환합니다.
 *  me 가 null 인 것을 권한 부족과 같은 문구로 표시하면, 조회가 실패했을 때 사용자가
 *  권한 문제로 오인합니다. meState 의 뜻은 components/queries 의 useMe 에 있습니다. */
function blockWhy(me: Account | null, meState: LoadState, allowed: boolean, denied: string): string {
  if (me === null) return stateText(meState, "로그인이 필요해요.");
  return allowed ? "" : denied;
}

/** 두 화면의 공통 뼈대입니다. 쓸 수 없는 사람에게는 사유만 표시하고 form 을 그리지 않습니다. */
function WritePage({ title, hint, draftPath, listPath, listKey, allowed, denied }: {
  title: string;
  hint: string;
  /** 초안을 만드는 주소입니다. */
  draftPath: string;
  /** 작성을 마치거나 취소했을 때 돌아갈 목록 주소입니다. */
  listPath: string;
  /** 목록 화면이 조회에 사용하는 주소입니다. 돌아갔을 때 방금 쓴 글이 보이게 같은 값을 씁니다. */
  listKey: string;
  allowed: boolean;
  denied: string;
}) {
  const navigate = useNavigate();
  const toList = (): void => void navigate(listPath);
  // queryKey 가 ["me"] 로 같아 이 화면을 연 목록 화면이 받아 둔 응답을 그대로 씁니다.
  const { me, meState } = useMe();
  const why = blockWhy(me, meState, allowed, denied);

  return (
    <>
      <div className="main">
        <div className="card">
          <SectionHead title={title} desc={hint} />
          {why !== "" ? (
            <Empty as="div" text={why} />
          ) : (
            <WriteForm
              draftPath={draftPath}
              authorId={me?.id ?? null}
              // 목록 화면이 사용하는 queryKey 와 같아야 합니다. 다르면 돌아갔을 때
              // 방금 쓴 글이 없는 목록이 보입니다(PostBoard 도 boardListKey 를 사용합니다).
              queryKey={boardListKey(listKey)}
              onDone={toList}
              onCancel={toList}
            />
          )}
        </div>
      </div>
    </>
  );
}
