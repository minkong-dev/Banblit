// 글을 쓰는 화면입니다. 공지사항과 팀 게시판이 같은 화면을 씁니다.
// 목록 아래에 form 을 이어붙이지 않고 자기 주소를 가진 화면으로 둡니다 —
// 목록과 작성은 하는 일이 다르고, 붙여 두면 작성 화면을 주소로 가리킬 수 없습니다.

import { useNavigate, useParams } from "react-router-dom";

import { WriteForm } from "../components/PostWriteForm";
import { can } from "../lib/account";
import { boardListKey } from "../lib/pipeline";
import { useMe, useMyTeams } from "../components/queries";
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
      authorId={me?.id ?? null}
      allowed={can(me, "notice_write")}
      denied="공지 작성 권한이 있는 멤버만 작성이 가능해요."
    />
  );
}

/** 팀 게시판 작성입니다. 주소의 teamId 가 내가 속한 팀이어야 form 이 보입니다. */
export function BoardWrite() {
  const { me } = useMe();
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
      authorId={me?.id ?? null}
      allowed={team !== undefined}
      denied="이 팀에 소속된 멤버만 쓸 수 있어요."
    />
  );
}

/** 두 화면의 공통 뼈대입니다. 쓸 수 없는 사람에게는 사유만 표시하고 form 을 그리지 않습니다. */
function WritePage({ title, hint, draftPath, listPath, listKey, authorId, allowed, denied }: {
  title: string;
  hint: string;
  /** 초안을 만드는 주소입니다. */
  draftPath: string;
  /** 작성을 마치거나 취소했을 때 돌아갈 목록 주소입니다. */
  listPath: string;
  /** 목록 화면이 조회에 사용하는 주소입니다. 돌아갔을 때 방금 쓴 글이 보이게 같은 값을 씁니다. */
  listKey: string;
  authorId: number | null;
  allowed: boolean;
  denied: string;
}) {
  const navigate = useNavigate();
  const toList = (): void => void navigate(listPath);

  return (
    <>
      <div className="main">
        <div className="card">
          <div className="sethead">
            <b>{title}</b>
            <span>{hint}</span>
          </div>
          {!allowed ? (
            <div className="empty">{denied}</div>
          ) : (
            <WriteForm
              draftPath={draftPath}
              authorId={authorId}
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
