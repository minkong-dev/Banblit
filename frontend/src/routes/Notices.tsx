import { AppShell, ProfileMenu } from "../components/AppShell";
import { PostBoard } from "../components/PostBoard";
import { useMe } from "../components/hooks";
import { useMyTeams } from "../components/hooks";
import { useToast } from "../components/hooks";
import "../styles/board.css";
import { roleLabel } from "../lib/account";

/** 공지사항 — 전체 공개 글 목록과 상세. 팀 게시판과 같은 틀(board.css·PostBoard)을 쓴다. */
export function Notices() {
  const { message, say } = useToast();
  const myTeams = useMyTeams();
  const { me } = useMe();

  return (
    <AppShell
      page="board"
      current="notice"
      toast={message}
      profile={
        <ProfileMenu
          name={me?.name ?? ""}
          sub={me ? `${roleLabel(me.role)} · 2026년 입부` : ""}
          teams={myTeams}
        />
      }
    >
      <div className="main">
        <PostBoard
          title="공지사항"
          hint="전체 공개"
          listPath="/notices"
          writePath="/notices"
          authorId={me?.id ?? null}
          writeNote="공지는 헤드매니저만 씁니다."
          emptyText="아직 등록된 공지가 없습니다"
          onSay={say}
        />
      </div>
    </AppShell>
  );
}
